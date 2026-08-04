import { Router } from "express";
import { requirePermission, currentRole } from "../middleware.ts";
import {
  getSharedCase,
  submitResponse,
  attachEvidence,
  requestInfo,
  recordDecision,
} from "../services.ts";
import { Case } from "../models/index.ts";
import { scopeFor } from "../scope.ts";
import type { DecisionOutcome } from "../statusVocabulary.ts";
import { HttpError } from "../errors.ts";

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
    res.json(await getSharedCase(req.params.id));
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
    await submitResponse(req.params.id, "recipient", "Maya Santos", {
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
    const submittedBy = role === "recipient" ? "recipient" : "platform";
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

/**
 * @openapi
 * /cases/{id}/requests:
 *   post:
 *     tags: [Cases]
 *     summary: Reviewer requests more information (max 2 per case)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [target, text], properties: { target: {type: string, enum: [platform, recipient]}, text: {type: string} } } } } }
 *     responses: { 201: { description: "{ caseNumber, status, infoRequestCount }" }, 409: { description: "Max requests used or not under review" } }
 *     notes: Requires `case:request_info` (reviewer only).
 */
caseRoutes.post("/cases/:id/requests", requirePermission("case:request_info"), async (req, res, next) => {
  try {
    const { target, text } = req.body ?? {};
    if (target !== "platform" && target !== "recipient") {
      throw new HttpError(400, "Target must be 'platform' or 'recipient'.");
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
 *     summary: Reviewer decision (refund returns unsigned tx for wallet signing)
 *     description: "Refund outcome requires a linked wallet; returns { unsignedTx } for the browser wallet to sign refundByArbiter. Release/no-action close the case directly (no wallet needed)."
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [outcome, reason], properties: { outcome: {type: string, enum: [refund, release, no_action]}, reason: {type: string, minLength: 20} } } } } }
 *     responses:
 *       201: { description: "{ decision, unsignedTx } — unsignedTx is null for non-refund outcomes" }
 *       400: { description: "Reason too short or no wallet linked for refund" }
 *       409: { description: "Case not under review" }
 *     notes: Requires `case:decide` (reviewer only). Refund additionally requires a connected wallet.
 */
caseRoutes.post("/cases/:id/decisions", requirePermission("case:decide"), async (req, res, next) => {
  try {
    const { outcome, reason } = req.body ?? {};
    if (!["refund", "release", "no_action"].includes(outcome)) {
      throw new HttpError(400, "Outcome must be refund, release or no_action.");
    }
    const decidedByName = req.session.displayName ?? "Reviewer";
    // Look up the reviewer's linked wallet address from the User doc.
    const { User } = await import("../models/index.ts");
    const user = req.session.userId ? await User.findById(req.session.userId) : null;
    const decidedByWallet = user?.walletAddress ?? req.session.walletAddress ?? "";
    if (outcome === "refund" && !decidedByWallet) {
      throw new HttpError(400, "Connect your wallet before approving a refund — the wallet signs the on-chain transaction.");
    }
    const { decision, unsignedTx } = await recordDecision(req.params.id, decidedByName, decidedByWallet, {
      outcome: outcome as DecisionOutcome,
      reason: String(reason ?? ""),
    });
    res.status(201).json({ decision, unsignedTx });
  } catch (e) {
    next(e);
  }
});
