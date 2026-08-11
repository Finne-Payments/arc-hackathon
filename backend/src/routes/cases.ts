import { Router } from "express";
import { requirePermission, currentRole } from "../middleware.ts";
import {
  getSharedCase,
  buildLegacyCaseContext,
  submitResponse,
  attachEvidence,
  requestInfo,
  recordDecision,
  submitRefundSignature,
} from "../services.ts";
import { Payout, Decision as DecisionModel, Case as CaseModel } from "../models/index.ts";
import {
  attachEvidenceDocument,
  attachEvidenceLink,
  resolveEvidenceObjectKey,
  previewEvidence,
} from "../services/documents.ts";
import { Case, EvidenceAnnotation } from "../models/index.ts";
import { getEvidenceStore } from "../integrations/storage/localStore.ts";
import { validateUploadDeclaration, sanitizeFilename } from "../integrations/storage/uploadPolicy.ts";
import { scopeFor } from "../scope.ts";
import type { DecisionOutcome } from "../statusVocabulary.ts";
import { HttpError } from "../errors.ts";
import { getLatestFrame } from "../agent/frame-assembly.ts";
import { recordHumanAction } from "../agent/model-client.ts";
import { getFrameStatus } from "../registrar/frameStatus.ts";
import { assembleForCaseByNumber } from "../registrar/frameOrchestrator.ts";

/* ============================================================================
   Case routes (PRD §11.2). The shared case body is byte-identical across
   seats (P3) — roles gate actions, never reads.
   ========================================================================== */

export const caseRoutes = Router();

/**
 * @openapi
 * /cases:
 *   get:
 *     tags: [Cases]
 *     summary: List all cases (newest first)
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ cases: CaseRow[] }" } }
 *     notes: Requires `case:read`.
 */
caseRoutes.get("/cases", requirePermission("case:read"), async (req, res, next) => {
  try {
    const scope = await scopeFor(req);
    const cases = await Case.find(scope?.case ?? {}).sort({ openedAt: -1 }).lean();
    res.json({ cases });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}:
 *   get:
 *     tags: [Cases]
 *     summary: Shared case body (byte-identical across seats — P3)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string }, description: "Case number e.g. CASE-0142" }]
 *     responses: { 200: { description: "Full shared case body" }, 404: { description: Not found } }
 *     notes: Requires `case:read`.
 */
caseRoutes.get("/cases/:id", requirePermission("case:read"), async (req, res, next) => {
  try {
    const body = await getSharedCase(req.params.id);
    // Attach the agent frame + running status. Keyed on caseNumber directly so
    // this works for BOTH legacy and v1 cases — the case in the URL is the key
    // the agents use. No v1-layer lookup required.
    let frame: unknown = null;
    let frameStatus: unknown = null;
    try {
      frame = await getLatestFrame(req.params.id);
      frameStatus = getFrameStatus(req.params.id);
    } catch {
      // frame store absent in some setups — frame stays null.
    }
    // Attach the structured case context (sourced on-chain + off-chain facts).
    // Degrades to null if the chain/DB reads fail — never blocks the case view.
    let caseContext: unknown = null;
    try {
      caseContext = await buildLegacyCaseContext(body);
    } catch {
      caseContext = null;
    }
    res.json({ ...body, frame, frameStatus, caseContext });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /cases/:id/refresh — re-fetch on-chain + off-chain data and re-run the
 * agent pipeline for this case (by case number). Works for every case visible
 * in the case room — legacy or v1 — because the agents key on caseNumber, the
 * same identifier in the URL. Builds the frame input directly from the shared
 * case body (payout + work order + evidence + responses).
 */
caseRoutes.post("/cases/:id/refresh", requirePermission("case:read"), async (req, res, next) => {
  try {
    const caseNumber = req.params.id;
    // Confirm the case exists (throws 404 via getSharedCase if not).
    await getSharedCase(caseNumber);
    const result = await assembleForCaseByNumber(caseNumber);
    res.status(201).json({
      frameId: result.frameId,
      frame: result.frame,
      narrative: result.narrative,
      degradeLevel: result.degradeLevel,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/responses:
 *   post:
 *     tags: [Cases]
 *     summary: Recipient right of reply
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [text], properties: { text: {type: string}, evidence: {type: array} } } } } }
 *     responses: { 201: { description: "Reply recorded, case → UNDER_REVIEW" }, 409: { description: "Not awaiting response" } }
 *     notes: Requires `case:respond` (recipient only).
 */
caseRoutes.post("/cases/:id/responses", requirePermission("case:respond"), async (req, res, next) => {
  try {
    const { text, evidence } = req.body ?? {};
    // All three parties (customer, merchant, arbiter) can send messages.
    // Derive the author side from the caller's role so the conversation thread
    // correctly attributes each message.
    const role = currentRole(req);
    const author = role === "merchant" ? "merchant" : role === "arbiter" ? "arbiter" : "customer";
    const authorName = req.session?.displayName ?? (role === "merchant" ? "Merchant" : role === "arbiter" ? "Arbiter" : "Customer");
    await submitResponse(req.params.id, author, authorName, {
      text: String(text ?? ""),
      evidence: Array.isArray(evidence) ? evidence : [],
    });
    res.status(201).json({ caseNumber: req.params.id, status: "UNDER_REVIEW" });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/evidence:
 *   post:
 *     tags: [Cases]
 *     summary: Add evidence to a case
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [title, fileOrText], properties: { type: {type: string}, title: {type: string}, fileOrText: {type: string} } } } } }
 *     responses: { 201: { description: "Evidence added (sha256 fingerprinted)" }, 409: { description: "Case closed" } }
 *     notes: Requires `case:add_evidence`.
 */
caseRoutes.post("/cases/:id/evidence", requirePermission("case:add_evidence"), async (req, res, next) => {
  try {
    const role = currentRole(req);
    // The merchant IS the payment recipient; every other party is the customer side.
    const submittedBy = role === "merchant" ? "merchant" : "customer";
    const { type, title, fileOrText } = req.body ?? {};
    if (!title?.trim() || !fileOrText?.trim()) {
      throw new HttpError(400, "Evidence needs a title and content (text or a file reference).");
    }
    await attachEvidence(req.params.id, submittedBy, String(type ?? "message"), String(title), String(fileOrText));
    res.status(201).json({ caseNumber: req.params.id });
  } catch (e) {
    next(e);
  }
});

/* ====================================================================== */
/* Evidence documents — uploaded files (PDF/MD/TXT) stored in S3,         */
/* arbiter-only. Two-step presigned upload: allocate → PUT → complete.    */
/* ====================================================================== */

// Allocate a presigned PUT URL for a case evidence file.
caseRoutes.post("/cases/:id/evidence/uploads", requirePermission("case:add_evidence"), async (req, res, next) => {
  try {
    const { filename, mimeType, declaredSizeBytes } = req.body ?? {};
    // Central validation: allowed mime/extension + size cap + filename presence.
    const check = validateUploadDeclaration({
      filename: String(filename ?? ""),
      mimeType: String(mimeType ?? ""),
      declaredSizeBytes: Number(declaredSizeBytes),
    });
    if (!check.ok) throw new HttpError(400, check.reason);
    const store = await getEvidenceStore();
    const allocation = await store.allocateUpload({
      scope: "case",
      ownerId: req.params.id,
      filename: sanitizeFilename(String(filename)),
      mimeType: String(mimeType),
      declaredSizeBytes: Number(declaredSizeBytes),
    });
    res.status(201).json(allocation);
  } catch (e) {
    next(e);
  }
});

// Finalize an upload: verify the object, compute sha256, record evidence metadata.
caseRoutes.post("/cases/:id/evidence/uploads/:uploadId/complete", requirePermission("case:add_evidence"), async (req, res, next) => {
  try {
    const { title, filename } = req.body ?? {};
    if (!title?.trim()) throw new HttpError(400, "title is required.");
    const role = currentRole(req);
    const store = await getEvidenceStore();
    const stored = await store.finalizeUpload(req.params.uploadId);
    const result = await attachEvidenceDocument({
      caseNumber: req.params.id,
      submittedByRole: role,
      title: String(title),
      stored: {
        evidenceId: stored.evidenceId,
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        objectKey: stored.objectKey,
        filename: sanitizeFilename(String(filename ?? "document")),
      },
    });
    res.status(201).json({ evidenceId: result.evidenceId, sha256: stored.sha256, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });
  } catch (e) {
    next(e);
  }
});

// Add a link (e.g. YouTube) as evidence — shared visibility.
caseRoutes.post("/cases/:id/evidence/links", requirePermission("case:add_evidence"), async (req, res, next) => {
  try {
    const { title, linkUrl } = req.body ?? {};
    if (!title?.trim() || !linkUrl?.trim()) {
      throw new HttpError(400, "title and linkUrl are required.");
    }
    const role = currentRole(req);
    const result = await attachEvidenceLink({
      caseNumber: req.params.id,
      submittedByRole: role,
      title: String(title),
      linkUrl: String(linkUrl),
    });
    res.status(201).json({ evidenceId: result.evidenceId });
  } catch (e) {
    next(e);
  }
});

// Download: get a short-lived presigned GET URL for an evidence file. Case
// parties (reviewer + recipient) pass evidence:download; non-parties 403.
caseRoutes.get("/cases/:id/evidence/:evidenceId/download", requirePermission("evidence:download"), async (req, res, next) => {
  try {
    const objectKey = await resolveEvidenceObjectKey(req.params.id, req.params.evidenceId);
    const store = await getEvidenceStore();
    const url = await store.getDownloadUrl(objectKey);
    res.json(url);
  } catch (e) {
    next(e);
  }
});

// Preview: return renderable content for the inline preview modal. Text/PDF →
// extracted text; video → presigned URL; link → the URL. Case parties only.
caseRoutes.get("/cases/:id/evidence/:evidenceId/preview", requirePermission("evidence:download"), async (req, res, next) => {
  try {
    const result = await previewEvidence(req.params.id, req.params.evidenceId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Per-case agent document summaries (the arbiter sees these as cards).
caseRoutes.get("/cases/:id/annotations", requirePermission("case:read"), async (req, res, next) => {
  try {
    const annotations = await EvidenceAnnotation.find({
      ownerRef: { $regex: `^case:${req.params.id}:` },
    }).sort({ generatedAt: 1 }).lean();
    res.json({ annotations });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/requests:
 *   post:
 *     tags: [Cases]
 *     summary: Reviewer requests more information (max 2 per case)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [target, text], properties: { target: {type: string, enum: [customer, merchant]}, text: {type: string} } } } } }
 *     responses: { 201: { description: "{ caseNumber, status, infoRequestCount }" }, 409: { description: "Max requests used or not under review" } }
 *     notes: Requires `case:request_info` (reviewer only).
 */
caseRoutes.post("/cases/:id/requests", requirePermission("case:request_info"), async (req, res, next) => {
  try {
    const { target, text } = req.body ?? {};
    if (target !== "customer" && target !== "merchant") {
      throw new HttpError(400, "Target must be 'customer' or 'merchant'.");
    }
    const { caseDoc } = await requestInfo(req.params.id, target, String(text ?? ""));
    res.status(201).json({
      caseNumber: caseDoc.caseNumber,
      status: caseDoc.status,
      infoRequestCount: caseDoc.infoRequestCount,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/decisions:
 *   post:
 *     tags: [Cases]
 *     summary: Reviewer decision (refund returns EIP-712 typed-data for the arbiter to sign)
 *     description: "Records the decision immediately. Refund outcome returns { refundTypedData } — the arbiter signs this EIP-712 payload in their wallet (no gas, no chain switch). The signed authorization is then submitted via /cases/{id}/decisions/refund-tx, which the backend relays to refundByArbiterWithSig. Release/no-action close the case directly."
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [outcome, reason], properties: { outcome: {type: string, enum: [refund, release, no_action]}, reason: {type: string, minLength: 20} } } } } }
 *     responses:
 *       201: { description: "{ decision, refundTypedData } — refundTypedData is null for non-refund outcomes" }
 *       400: { description: "Reason too short" }
 *       409: { description: "Case not under review" }
 *     notes: Requires `case:decide` (reviewer only). The decision records immediately; the refund signature + submission is a separate step.
 */
caseRoutes.post("/cases/:id/decisions", requirePermission("case:decide"), async (req, res, next) => {
  try {
    const { outcome, reason } = req.body ?? {};
    if (!["refund", "release", "no_action"].includes(outcome)) {
      throw new HttpError(400, "Outcome must be refund, release or no_action.");
    }
    const decidedByName = req.session.displayName ?? "Reviewer";
    // Look up the reviewer's linked wallet address from the User doc (recorded
    // for attribution; the refund no longer requires it to match the arbiter key).
    const { User } = await import("../models/index.ts");
    const user = req.session.userId ? await User.findById(req.session.userId) : null;
    const decidedByWallet = user?.walletAddress ?? req.session.walletAddress ?? "";
    const { decision, refundTypedData } = await recordDecision(req.params.id, decidedByName, decidedByWallet, {
      outcome: outcome as DecisionOutcome,
      reason: String(reason ?? ""),
    });
    res.status(201).json({ decision, refundTypedData });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/decisions/refund-tx:
 *   post:
 *     tags: [Cases]
 *     summary: Submit the arbiter's signed refund authorization (relayer)
 *     description: "Takes the (v,r,s) signature the arbiter produced over the refundTypedData payload and submits refundByArbiterWithSig on chain using the backend's operator key. The submitter and the authorizer are decoupled — the arbiter signs, the backend relays."
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [paymentID, expiry, salt, v, r, s], properties: { paymentID: {type: string}, expiry: {type: integer}, salt: {type: integer}, v: {type: integer}, r: {type: string}, s: {type: string} } } } } }
 *     responses:
 *       200: { description: "{ txHash } — the refund transaction hash" }
 *       503: { description: "Relayer unavailable (no operator key or contract address)" }
 *     notes: Requires `case:decide` (reviewer only).
 */
caseRoutes.post("/cases/:id/decisions/refund-tx", requirePermission("case:decide"), async (req, res, next) => {
  try {
    const { paymentID, expiry, salt, v, r, s } = req.body ?? {};
    if (!paymentID || expiry === undefined || salt === undefined || v === undefined || !r || !s) {
      throw new HttpError(400, "paymentID, expiry, salt, v, r, s are all required.");
    }
    const { txHash } = await submitRefundSignature(req.params.id, {
      paymentID: String(paymentID), expiry: Number(expiry), salt: Number(salt),
      v: Number(v), r: String(r), s: String(s),
    });
    res.status(200).json({ txHash });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /cases/:id/refund-tx — stamp the refund tx hash on the decision +
 * transition the payout to REFUNDED. Called by the frontend right after the
 * arbiter's direct refundByArbiter tx is broadcast (not the signature+relay
 * path). This makes the refund tx visible on the receipt immediately, without
 * waiting for the indexer's 30s tick.
 */
caseRoutes.post("/cases/:id/refund-tx", requirePermission("case:decide"), async (req, res, next) => {
  try {
    const { txHash } = req.body ?? {};
    if (!txHash || !String(txHash).startsWith("0x")) {
      throw new HttpError(400, "txHash is required (0x…).");
    }
    const caseDoc = await CaseModel.findOne({ caseNumber: req.params.id }).lean();
    if (!caseDoc) throw new HttpError(404, `No case ${req.params.id} found.`);
    // Stamp the refund tx hash on the decision.
    await DecisionModel.updateOne(
      { caseRef: req.params.id },
      { $set: { refundTxHash: String(txHash), executedAt: new Date().toISOString() } },
    );
    // Transition the payout to REFUNDED so the receipt/status reflect it.
    const payout = await Payout.findOne({ paymentId: caseDoc.payoutRef });
    if (payout && payout.status === "DISPUTED") {
      try {
        const { applyPaymentEvent } = await import("../stateMachines.ts");
        payout.status = applyPaymentEvent(payout.status as never, "refund_confirmed");
        await payout.save();
      } catch {
        // Already past DISPUTED — no-op.
      }
    }
    // Close the case.
    try {
      await CaseModel.findOneAndUpdate(
        { caseNumber: req.params.id },
        { $set: { status: "CLOSED" } },
      );
    } catch {
      // Status transition failed — the indexer will reconcile.
    }
    res.status(200).json({ ok: true, txHash: String(txHash) });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /cases/:id/frame/actions — log a per-line reviewer action on the agent
 * decision frame (FIN-127). Keyed on caseNumber + gated by the case:decide
 * permission (the arbiter, who accepts/edits/discards frame lines while forming
 * a decision). recordHumanAction keys on callId, so the path param is
 * contextual only.
 *
 * Accepts { callId, action: "accept"|"edit"|"discard", lineId?, originalText?,
 * editedText?, provenance? }. For "edit", the edited text is stored ALONGSIDE
 * the original in the corpus (the same shared store v1 uses).
 */
caseRoutes.post("/cases/:id/frame/actions", requirePermission("case:decide"), async (req, res, next) => {
  try {
    const body = req.body as {
      callId?: string;
      action?: string;
      lineId?: string;
      originalText?: string;
      editedText?: string;
      provenance?: string;
    };
    if (!body.callId || !body.action) throw new HttpError(400, "callId and action required.");
    const valid = ["accept", "edit", "discard"];
    if (!valid.includes(body.action)) throw new HttpError(400, `action must be one of: ${valid.join(", ")}`);
    await recordHumanAction(body.callId, body.action, {
      lineId: body.lineId,
      originalText: body.originalText,
      editedText: body.editedText,
      provenance: body.provenance as "template" | "computed" | "model" | undefined,
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
