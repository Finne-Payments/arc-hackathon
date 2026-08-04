/* ============================================================================
   v1 router — the 36 canonical operations (FND-03 Appendix A).
   Each route maps to one OpenAPI operation. All retryable writes require
   Idempotency-Key. Async operations return jobId + status URL.
   ========================================================================== */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { Config } from "@finne/config";
import jwt from "jsonwebtoken";
import { generateId } from "@finne/domain";
import { resolveV1Session, requireAuth, requirePerm, requireIdempotencyKey, requireInternal } from "./middleware.ts";
import { notFound, validationError } from "./errors.ts";
import * as svc from "./services.ts";
import { Payment, Case as CaseModel, Correction, Job, Invitation } from "./models.ts";
import { getEvidenceStore } from "../integrations/storage/localStore.ts";
import { canonicalHash as backendCanonicalHash } from "../canonical.ts";
import { submitSponsoredTransfer, pollTransaction, verifyWebhookSignature, walletInventoryCheck, getTransactionState } from "../integrations/circle/circleService.ts";
import { assembleFrame, getLatestFrame } from "../agent/frame-assembly.ts";
import { loadClauseParameters, DEMO_PACK_REF } from "../seed/policy-pack.ts";
import { PolicyClause } from "./models.ts";
import { recordHumanAction } from "../agent/model-client.ts";

export function createV1Router(config: Config): Router {
  const router = Router();

  // Session resolution on every request
  router.use(resolveV1Session(config));

  /* ====================================================================== */
  /* Meta (3–4)                                                             */
  /* ====================================================================== */

  router.get("/v1/meta", (_req: Request, res: Response) => {
    res.json({
      apiVersion: "1.0.0",
      chainId: config.arc.chainId,
      chainName: config.arc.chainName,
      registryAddress: config.arc.registryAddress,
      gitCommit: "_pending_",
      demoMode: config.demoMode,
    });
  });

  router.get("/v1/me", requireAuth, (req: Request, res: Response) => {
    const s = req.v1session!;
    res.json({
      role: s.role,
      tenantKey: s.tenantKey,
      displayName: s.displayName,
      walletAddress: s.walletAddress,
    });
  });

  /* ====================================================================== */
  /* Recipient auth: invitation challenge (5–7)                             */
  /* ====================================================================== */

  // POST /v1/auth/recipient/challenges — create a wallet-ownership challenge
  router.post("/v1/auth/recipient/challenges", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { invitationToken } = req.body ?? {};
      if (!invitationToken) throw validationError("invitationToken is required.");

      // Hash the token and look up the invitation (never store raw tokens)
      const tokenHash = backendCanonicalHash({ invitationToken });
      const invitation = await Invitation.findOne({ tokenHash, consumed: false });
      if (!invitation) throw notFound("Invitation not found or already consumed.");
      if (new Date(invitation.expiresAt) < new Date()) throw validationError("Invitation has expired.");

      const challengeId = generateId("chal");
      const nonce = generateId("nonce").slice(0, 32);
      const domain = config.arc.chainName;
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      res.status(201).json({
        challengeId,
        invitationId: invitation.invitationId,
        domain,
        uri: `https://finne.app/auth`,
        chainId: config.arc.chainId,
        nonce,
        issuedAt,
        expiresAt,
      });
    } catch (e) { next(e); }
  });

  // POST /v1/auth/recipient/sessions — verify signature, issue session
  router.post("/v1/auth/recipient/sessions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, signature } = req.body ?? {};
      if (!challengeId || !signature) throw validationError("challengeId and signature are required.");

      // In production, this verifies an EOA or ERC-1271 signature against the
      // challenge nonce (BE-05). For the local/demo path, we accept the signature
      // as the wallet address proof and issue a recipient session bound to the
      // invitation's case.
      // TODO(INT-05): wire Circle modular wallet ERC-1271 verification.

      // Recover address from signature (simplified for demo — real impl uses viem recoverAddress)
      const token = jwt.sign(
        {
          userId: generateId("user"),
          role: "recipient",
          tenantKey: "northstar",
          displayName: "Recipient",
          walletAddress: signature, // placeholder — real impl recovers from signature
        },
        config.sessionSecret,
        { expiresIn: "24h" },
      );
      res.status(201).json({ token, session: { role: "recipient" } });
    } catch (e) { next(e); }
  });

  // DELETE /v1/auth/session — end session (client drops token)
  router.delete("/v1/auth/session", (_req: Request, res: Response) => {
    res.status(204).send();
  });

  /* ====================================================================== */
  /* Jobs (8)                                                               */
  /* ====================================================================== */

  router.get("/v1/jobs/:jobId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await Job.findOne({ jobId: req.params.jobId });
      if (!job) throw notFound("Job not found.");
      res.json({ jobId: job.jobId, status: job.status, result: job.result, error: job.error });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Dashboard (9)                                                          */
  /* ====================================================================== */

  router.get("/v1/dashboard", requirePerm("payment:read"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const payments = await Payment.countDocuments();
      const openCases = await CaseModel.countDocuments({ state: { $in: ["OPEN", "RESPONDED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"] } });
      const pendingDecisions = await CaseModel.countDocuments({ state: "UNDER_REVIEW" });
      res.json({ paymentCount: payments, openCases, pendingDecisions });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Payments (10–16)                                                       */
  /* ====================================================================== */

  // 10: POST /v1/demo/payouts — operations-only 202 job
  router.post("/v1/demo/payouts", requirePerm("demo:payout"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idemKey = req.headers["idempotency-key"] as string;
      const { recipient, amountMicroUsdc } = req.body ?? {};
      if (!recipient || !amountMicroUsdc) throw validationError("recipient and amountMicroUsdc are required.");

      // Enqueue as a job — the actual Circle transfer happens in the worker
      // (INT-04). For the local path, the job creates a synthetic VERIFIED payment.
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "demo_payout",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: "demo",
        status: "queued",
        idempotencyKey: idemKey,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  // 11: POST /v1/payments/import — import an existing finalized transfer
  router.post("/v1/payments/import", requirePerm("payment:import"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { txHash } = req.body ?? {};
      if (!txHash) throw validationError("txHash is required.");
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "import_payment",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: txHash,
        status: "queued",
        idempotencyKey: req.headers["idempotency-key"] as string,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  // 12: GET /v1/payments
  router.get("/v1/payments", requirePerm("payment:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payments = await svc.listPayments(req.v1session?.tenantKey);
      res.json(payments);
    } catch (e) { next(e); }
  });

  // 13: GET /v1/payments/:paymentId
  router.get("/v1/payments/:paymentId", requirePerm("payment:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await svc.getPaymentDetail(req.params.paymentId, req.v1session?.tenantKey);
      res.json(payment);
    } catch (e) { next(e); }
  });

  // 14: POST /v1/payments/:paymentId/proof-runs
  router.post("/v1/payments/:paymentId/proof-runs", requirePerm("payment:import"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "proof_run",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: req.params.paymentId,
        status: "queued",
        idempotencyKey: req.headers["idempotency-key"] as string,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  // 15: POST /v1/payments/:paymentId/anchors
  router.post("/v1/payments/:paymentId/anchors", requirePerm("payment:anchor"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "anchor_receipt",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: req.params.paymentId,
        status: "queued",
        idempotencyKey: req.headers["idempotency-key"] as string,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  // 16: POST /v1/payments/:paymentId/cases
  router.post("/v1/payments/:paymentId/cases", requirePerm("case:open"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { claimType, allegation, challengedAmountMicroUsdc, citedEvidenceIds } = req.body ?? {};
      if (!allegation || !challengedAmountMicroUsdc) throw validationError("allegation and challengedAmountMicroUsdc are required.");
      const result = await svc.openCase({
        paymentId: req.params.paymentId,
        tenantKey: req.v1session!.tenantKey,
        openedBy: req.v1session!.userId,
        claimType: claimType ?? "work_not_delivered_in_full",
        allegation,
        challengedAmountMicroUsdc: String(challengedAmountMicroUsdc),
        citedEvidenceIds: citedEvidenceIds ?? [],
        policyVersion: "v1",
        responseWindowHours: config.responseWindowHours,
      });
      res.status(202).json({ caseId: result.caseDoc.caseId, caseNumber: result.caseDoc.caseNumber, claimHash: result.claimHash });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Cases (17–19)                                                          */
  /* ====================================================================== */

  // 17: GET /v1/cases
  router.get("/v1/cases", requirePerm("case:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = req.v1session?.tenantKey ? { tenantKey: req.v1session.tenantKey } : {};
      const cases = await CaseModel.find(filter).sort({ openedAt: -1 }).lean();
      res.json(cases);
    } catch (e) { next(e); }
  });

  // 18: GET /v1/cases/:caseId
  router.get("/v1/cases/:caseId", requirePerm("case:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const detail = await svc.getCaseDetail(req.params.caseId);
      res.json(detail);
    } catch (e) { next(e); }
  });

  // 19: POST /v1/cases/:caseId/recipient-invitations
  router.post("/v1/cases/:caseId/recipient-invitations", requirePerm("invitation:create"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caseDoc = await CaseModel.findOne({ caseId: req.params.caseId });
      if (!caseDoc) throw notFound("Case not found.");

      const invitationId = generateId("inv");
      const rawToken = generateId("tok");
      const tokenHash = backendCanonicalHash({ token: rawToken });
      const invitation = new Invitation({
        invitationId,
        caseId: caseDoc.caseId,
        paymentId: caseDoc.paymentId,
        tenantKey: caseDoc.tenantKey,
        expectedWallet: null,
        tokenHash,
        consumed: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      });
      await invitation.save();
      res.status(201).json({ invitationId, invitationToken: rawToken, expiresAt: invitation.expiresAt });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Evidence (20–22)                                                       */
  /* ====================================================================== */

  // 20: POST /v1/evidence/uploads
  router.post("/v1/evidence/uploads", requirePerm("evidence:upload"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { caseId, filename, mimeType, declaredSizeBytes, visibility } = req.body ?? {};
      if (!caseId || !filename || !mimeType || !declaredSizeBytes) {
        throw validationError("caseId, filename, mimeType, declaredSizeBytes are required.");
      }
      const store = getEvidenceStore();
      const allocation = await store.allocateUpload({ caseId, filename, mimeType, declaredSizeBytes });
      res.status(201).json({ ...allocation, visibility: visibility ?? "SHARED" });
    } catch (e) { next(e); }
  });

  // 21: POST /v1/evidence/uploads/:uploadId/complete
  router.post("/v1/evidence/uploads/:uploadId/complete", requirePerm("evidence:upload"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getEvidenceStore();
      const stored = await store.finalizeUpload(req.params.uploadId);
      // Record evidence metadata in the DB
      const { caseId, visibility, title } = req.body ?? {};
      const evidence = await svc.recordEvidence({
        caseId: caseId ?? "unknown",
        paymentId: "",
        tenantKey: req.v1session?.tenantKey ?? "unknown",
        submittedBy: req.v1session?.userId ?? "unknown",
        visibility: visibility ?? "SHARED",
        title: title ?? "Evidence",
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        objectKey: stored.evidenceId, // the store manages the real key
        version: stored.version,
      });
      res.status(201).json(evidence);
    } catch (e) { next(e); }
  });

  // 22: GET /v1/evidence/:evidenceId/download
  router.get("/v1/evidence/:evidenceId/download", requirePerm("evidence:download"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getEvidenceStore();
      const url = await store.getDownloadUrl(req.params.evidenceId);
      res.json(url);
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Response (23–24)                                                       */
  /* ====================================================================== */

  // 23: POST /v1/cases/:caseId/responses
  router.post("/v1/cases/:caseId/responses", requirePerm("case:respond"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, evidenceIds } = req.body ?? {};
      if (!text) throw validationError("text is required.");
      const result = await svc.submitResponse({
        caseId: req.params.caseId,
        text: String(text),
        evidenceIds: evidenceIds ?? [],
        submittedBy: req.v1session!.walletAddress ?? req.v1session!.userId,
      });
      res.status(201).json({ responseId: result.responseDoc.responseId, caseId: req.params.caseId });
    } catch (e) { next(e); }
  });

  // 24: POST /v1/responses/:responseId/transactions (hint attachment)
  router.post("/v1/responses/:responseId/transactions", requirePerm("case:respond"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Transaction hints are stored but never trusted until Arc reconciliation
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "attach_response_tx",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: req.params.responseId,
        status: "queued",
        idempotencyKey: req.headers["idempotency-key"] as string,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Analysis (25–26)                                                       */
  /* ====================================================================== */

  // 25: POST /v1/cases/:caseId/analysis-runs
  router.post("/v1/cases/:caseId/analysis-runs", requirePerm("analysis:run"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = generateId("job");
      const job = new Job({
        jobId,
        type: "analysis_run",
        tenantKey: req.v1session!.tenantKey,
        parentResourceId: req.params.caseId,
        status: "queued",
        idempotencyKey: req.headers["idempotency-key"] as string,
      });
      await job.save();
      res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    } catch (e) { next(e); }
  });

  // 26: POST /v1/cases/:caseId/analysis-approvals
  router.post("/v1/cases/:caseId/analysis-approvals", requirePerm("analysis:approve"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysis = await svc.approveAnalysis(req.params.caseId);
      res.status(202).json({ analysisId: analysis.analysisId, status: "approved" });
    } catch (e) { next(e); }
  });

  /* ------------------------------------------------------------------------ */
  /* Decision frame (PRD Addendum A4 / FIN-120…127)                           */
  /*                                                                          */
  /* The verdict-free frame: turning questions (model) + outcome requirements  */
  /* (templates) + unresolved items (computed). Generated synchronously with a */
  /* 3-rung degrade ladder — never blocks the decision (P8).                  */
  /* ------------------------------------------------------------------------ */

  // 26a: GET /v1/cases/:caseId/frame — latest frame for the case room
  router.get("/v1/cases/:caseId/frame", requirePerm("case:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const frame = await getLatestFrame(req.params.caseId);
      res.json({ frame });
    } catch (e) { next(e); }
  });

  // 26b: POST /v1/cases/:caseId/frame — assemble + persist a fresh frame
  router.post("/v1/cases/:caseId/frame", requirePerm("analysis:run"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caseId = req.params.caseId;
      const detail = await svc.getCaseDetail(caseId);
      const c = detail.case;
      const payment = detail.payment;

      // Build the check input from the case record. Degrade gracefully when
      // payment/work-order data is incomplete — checks return "missing" findings.
      const clauses = await loadClauseParameters();
      const checkInput = {
        payment: {
          amountMicroUsdc: payment?.amountMicroUsdc ?? c.challengedAmountMicroUsdc,
          recipient: payment?.recipient ?? "",
          payer: payment?.payer ?? "",
          paidAt: payment?.paidAt ?? c.openedAt,
        },
        challengedAmountMicroUsdc: c.challengedAmountMicroUsdc,
        claimType: c.claimType ?? "non_delivery",
        allegation: c.allegation ?? "",
        disputeOpenedAt: c.openedAt,
        // Demo-bound: no work-order linkage in v1 yet, so deliverables come from
        // the request body if provided, else a single contested deliverable.
        deliverables: (req.body?.deliverables as any[]) ?? [{ name: "Contested deliverable", due: c.openedAt, acceptanceCriteria: "" }],
        deliveryTimestamps: req.body?.deliveryTimestamps ?? {},
        rejectionTimestamps: req.body?.rejectionTimestamps ?? {},
        clauses,
      };

      const unresolvedInput = {
        hasResponse: !!detail.response,
        evidenceBySide: {
          platform: detail.evidence.filter((e: any) => e.submittedBy !== "recipient").length,
          recipient: detail.evidence.filter((e: any) => e.submittedBy === "recipient").length,
        },
        contestedAmountMicroUsdc: c.challengedAmountMicroUsdc,
        deliverableAmountsMicroUsdc: req.body?.deliverableAmountsMicroUsdc ?? [],
        deliverablesWithoutCriteria: (req.body?.deliverables as any[])?.filter((d) => !d.acceptanceCriteria).map((d) => d.name) ?? [],
        findings: [], // filled by assembly after checks run; unresolved recomputes from its own inputs
      };

      const result = await assembleFrame({
        caseId,
        claimType: c.claimType ?? "non_delivery",
        caseContext: req.body?.caseContext ?? `Dispute over ${c.challengedAmountMicroUsdc} micro-USDC. Claim: ${c.claimType ?? "non_delivery"}.`,
        checkInput,
        unresolvedInput,
      });

      res.status(201).json({
        frameId: result.frameId,
        frame: result.frame,
        narrative: result.narrative,
        degradeLevel: result.degradeLevel,
      });
    } catch (e) { next(e); }
  });

  // 26c: POST /v1/cases/:caseId/frame/actions — log a per-line reviewer action (FIN-127)
  // Accepts { callId, action: "accept"|"edit"|"discard", lineId?, originalText?, editedText? }.
  // For "edit", the edited text is stored ALONGSIDE the original line in the corpus.
  router.post("/v1/cases/:caseId/frame/actions", requirePerm("analysis:approve"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        callId?: string;
        action?: string;
        lineId?: string;
        originalText?: string;
        editedText?: string;
        provenance?: string;
      };
      if (!body.callId || !body.action) throw validationError("callId and action required.");
      const valid = ["accept", "edit", "discard"];
      if (!valid.includes(body.action)) throw validationError(`action must be one of: ${valid.join(", ")}`);
      await recordHumanAction(body.callId, body.action, {
        lineId: body.lineId,
        originalText: body.originalText,
        editedText: body.editedText,
        provenance: body.provenance as "template" | "computed" | "model" | undefined,
      });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // 26d: GET /v1/policy-clauses — the demo policy pack (FIN-115 case-room render)
  router.get("/v1/policy-clauses", requirePerm("case:read"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const clauses = await PolicyClause.find({ packRef: DEMO_PACK_REF }).sort({ clauseNumber: 1 }).lean();
      res.json({ clauses });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Decisions (27)                                                         */
  /* ====================================================================== */

  // 27: POST /v1/cases/:caseId/decisions
  router.post("/v1/cases/:caseId/decisions", requirePerm("case:decide"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { outcome, rationale, correctionAmountMicroUsdc } = req.body ?? {};
      if (!outcome || !rationale) throw validationError("outcome and rationale are required.");
      if (rationale.length < 20) throw validationError("rationale must be at least 20 characters.");
      const result = await svc.recordDecision({
        caseId: req.params.caseId,
        outcome,
        rationale: String(rationale),
        correctionAmountMicroUsdc: correctionAmountMicroUsdc ? String(correctionAmountMicroUsdc) : null,
        decidedBy: req.v1session!.displayName,
        decidedByWallet: req.v1session!.walletAddress ?? "0x0",
      });
      res.status(202).json({ decisionId: result.decisionDoc.decisionId, decisionHash: result.decisionHash });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Corrections (28–33)                                                    */
  /* ====================================================================== */

  // 28: POST /v1/cases/:caseId/correction-instructions
  router.post("/v1/cases/:caseId/correction-instructions", requirePerm("correction:instruction"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.createCorrectionInstruction(req.params.caseId, req.v1session!.tenantKey);
      res.status(202).json({ correctionId: result.correctionDoc.correctionId, instructionHash: result.instructionHash });
    } catch (e) { next(e); }
  });

  // 29: GET /v1/corrections/:correctionId
  router.get("/v1/corrections/:correctionId", requirePerm("correction:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correction = await Correction.findOne({ correctionId: req.params.correctionId }).lean();
      if (!correction) throw notFound("Correction not found.");
      res.json(correction);
    } catch (e) { next(e); }
  });

  // 30: POST /v1/corrections/:correctionId/wallet-intents
  router.post("/v1/corrections/:correctionId/wallet-intents", requirePerm("correction:wallet-intent"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correction = await Correction.findOne({ correctionId: req.params.correctionId });
      if (!correction) throw notFound("Correction not found.");
      correction.state = "AWAITING_SIGNATURE";
      await correction.save();
      // Return the exact USDC transfer calldata for the recipient to authorize
      res.status(201).json({
        correctionId: correction.correctionId,
        destination: correction.destination,
        token: correction.token,
        amountMicroUsdc: correction.amountMicroUsdc,
        chainId: correction.chainId,
      });
    } catch (e) { next(e); }
  });

  // 31: POST /v1/corrections/:correctionId/transactions (COR-02: submit via Circle Gas Station)
  router.post("/v1/corrections/:correctionId/transactions", requirePerm("correction:submit"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correction = await Correction.findOne({ correctionId: req.params.correctionId });
      if (!correction) throw notFound("Correction not found.");
      if (correction.state !== "AWAITING_SIGNATURE") {
        throw validationError(`Correction is ${correction.state}, not AWAITING_SIGNATURE.`);
      }

      // INT-06/COR-02: Submit the sponsored USDC transfer via Circle Gas Station.
      // Every value is derived from the immutable correction instruction — no client override.
      // The Maya wallet ID comes from env (MAYA_WALLET_ID).
      const mayaWalletId = process.env.MAYA_WALLET_ID;
      if (!mayaWalletId) throw validationError("MAYA_WALLET_ID not configured. Cannot submit correction.");

      // Convert micro-USDC to human-readable for the Circle API (6 decimals)
      const amountHuman = (Number(correction.amountMicroUsdc) / 1_000_000).toString();

      const result = await submitSponsoredTransfer(config, {
        walletId: mayaWalletId,
        destinationAddress: correction.destination,
        tokenAddress: correction.token,
        amount: amountHuman,
      });

      // Store the Circle transaction ID as the userOpHash/providerId hint.
      // The final Arc txHash is resolved by INT-07 reconciliation (verify route).
      correction.state = "SUBMITTED";
      correction.userOpHash = result.transactionId;
      correction.providerId = "circle";
      await correction.save();

      res.status(202).json({
        correctionId: correction.correctionId,
        state: "SUBMITTED",
        circleTransactionId: result.transactionId,
        note: "userOpHash is a provider operation ID, not the final Arc tx. Verify via /verify to reconcile.",
      });
    } catch (e) { next(e); }
  });

  // 32: POST /v1/corrections/:correctionId/decline
  router.post("/v1/corrections/:correctionId/decline", requirePerm("correction:decline"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body ?? {};
      await svc.declineCorrection(req.params.correctionId, reason ?? "Recipient declined.");
      res.status(200).json({ correctionId: req.params.correctionId, state: "DECLINED" });
    } catch (e) { next(e); }
  });

  // 33: POST /v1/corrections/:correctionId/verify (INT-07: reconcile + close)
  router.post("/v1/corrections/:correctionId/verify", requirePerm("correction:verify"), requireIdempotencyKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correction = await Correction.findOne({ correctionId: req.params.correctionId });
      if (!correction) throw notFound("Correction not found.");
      if (correction.state !== "SUBMITTED") {
        throw validationError(`Correction is ${correction.state}, not SUBMITTED. Submit first.`);
      }

      // INT-07: Reconcile the Circle transaction ID → final Arc txHash.
      // If a correctionTxHash is provided, use it directly.
      // Otherwise, poll the Circle transaction (stored as userOpHash).
      let arcTxHash: string;

      if (req.body?.correctionTxHash) {
        // Caller provided the Arc tx hash directly (e.g. from webhook)
        arcTxHash = req.body.correctionTxHash;
      } else if (correction.userOpHash) {
        // Poll the Circle transaction for the final Arc txHash
        try {
          const tx = await pollTransaction(config, correction.userOpHash, { timeoutMs: 60_000 });
          if (tx.state !== "COMPLETE") {
            correction.state = tx.state === "FAILED" || tx.state === "DENIED" || tx.state === "CANCELLED" ? "FAILED" : correction.state;
            await correction.save();
            throw validationError(`Circle transaction ${tx.state}. ${tx.txHash ? "Arc tx: " + tx.txHash : ""}`);
          }
          if (!tx.txHash) throw validationError("Transaction COMPLETE but no Arc txHash returned.");
          arcTxHash = tx.txHash;
        } catch (e) {
          if (e instanceof Error && e.message.includes("did not reach terminal")) {
            // Still pending — return current status without closing
            const status = await getTransactionState(config, correction.userOpHash);
            return res.status(202).json({
              correctionId: correction.correctionId,
              state: "SUBMITTED",
              circleState: status.state,
              message: "Transaction still pending. Retry verify later.",
            });
          }
          throw e;
        }
      } else {
        throw validationError("No correctionTxHash or Circle transaction ID to reconcile.");
      }

      // Verify the correction + close the case
      const result = await svc.verifyCorrection(correction.caseId, arcTxHash);
      res.status(202).json({
        caseId: result.caseDoc.caseId,
        state: result.caseDoc.state,
        arcTxHash,
        message: "Correction verified. Case closed.",
      });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Webhooks / chain / public (34–36)                                      */
  /* ====================================================================== */

  // 34: POST /v1/webhooks/circle (INT-07: signature-verified)
  router.post("/v1/webhooks/circle", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sigResult = verifyWebhookSignature(
        config,
        JSON.stringify(req.body ?? {}),
        req.headers["x-circle-signature"] as string | undefined,
        req.headers["x-circle-key-id"] as string | undefined,
      );
      if (!sigResult.valid) {
        res.status(401).json({ error: sigResult.reason });
        return;
      }

      // Parse the webhook event. Circle sends: { type, data: { transaction: { id, state, txHash } } }
      const body = req.body ?? {};
      const notificationType = body?.type ?? "unknown";

      // For transaction-state notifications, reconcile to Arc
      if (notificationType.includes("transaction") && body?.data?.transaction?.id) {
        const txId = body.data.transaction.id;
        const txState = body.data.transaction.state;
        const arcTxHash = body.data.transaction.txHash;

        // If a correction is pending with this Circle tx ID, reconcile it
        if (txState === "COMPLETE" && arcTxHash) {
          const correction = await Correction.findOne({ userOpHash: txId, state: "SUBMITTED" });
          if (correction) {
            try {
              await svc.verifyCorrection(correction.caseId, arcTxHash);
            } catch {
              // May already be verified — idempotent
            }
          }
        }
      }

      // Acknowledge quickly (INT-07: "acknowledge quickly, and enqueue")
      res.status(202).json({ received: true });
    } catch (e) { next(e); }
  });

  // INT-04: GET /v1/wallet-inventory — redacted Circle wallet inventory check
  router.get("/v1/wallet-inventory", requirePerm("meta:read"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const inventory = await walletInventoryCheck(config);
      res.json(inventory);
    } catch (e) { next(e); }
  });

  // 35: GET /v1/chain/transactions/:hash
  router.get("/v1/chain/transactions/:hash", requirePerm("payment:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      // In production: fetch + verify from Arc RPC (INT-02). For local, return
      // a placeholder indicating the verifier would check the transfer.
      res.json({
        txHash: req.params.hash,
        verified: false,
        message: "Chain verifier not configured. Set ARC_USDC_ADDRESS + CASE_REGISTRY_ADDRESS.",
      });
    } catch (e) { next(e); }
  });

  // 36: GET /v1/public/proofs/:proofId
  router.get("/v1/public/proofs/:proofId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Privacy-minimized public proof — no allegations, documents, or PII.
      const payment = await Payment.findOne({ paymentId: req.params.proofId }).lean();
      if (!payment) throw notFound("Proof not found.");
      res.json({
        paymentId: payment.paymentId,
        receiptHash: payment.receiptHash,
        anchorTxHash: payment.anchorTxHash,
        state: payment.state,
        amountMicroUsdc: payment.amountMicroUsdc,
      });
    } catch (e) { next(e); }
  });

  /* ====================================================================== */
  /* Internal routes (indexer → backend)                                     */
  /* ====================================================================== */

  router.post("/v1/internal/payments/verified", requireInternal(config), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { txHash, payer, recipient, token, amountMicroUsdc, paidAt, blockNumber, chainId, items, policyVersion, policyHash } = req.body ?? {};
      const result = await svc.createVerifiedPayment({
        tenantKey: "northstar",
        chainId: chainId ?? config.arc.chainId,
        txHash,
        payer,
        recipient,
        token,
        amountMicroUsdc,
        paidAt,
        blockNumber: blockNumber ?? 0,
        finalized: true,
        items: items ?? [],
        policyVersion: policyVersion ?? "v1",
        policyHash: policyHash ?? "0x0",
      });
      res.status(201).json({ paymentId: result.payment.paymentId, created: result.created });
    } catch (e) { next(e); }
  });

  router.post("/v1/internal/scheduler/tick", requireInternal(config), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Advance all overdue cases
      const overdue = await CaseModel.find({
        state: "OPEN",
        responseDueAt: { $lt: new Date().toISOString() },
      });
      for (const c of overdue) {
        await svc.advanceDeadline(c.caseId);
      }
      res.json({ advanced: overdue.length });
    } catch (e) { next(e); }
  });

  return router;
}
