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
import type { DecisionOutcome } from "../statusVocabulary.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Case routes (PRD §11.2). The shared case body is byte-identical across
   seats (P3) — roles gate actions, never reads.
   ========================================================================== */

export const caseRoutes = Router();

caseRoutes.get("/cases", requirePermission("case:read"), async (_req, res, next) => {
  try {
    const cases = await Case.find({}).sort({ openedAt: -1 }).lean();
    res.json({ cases });
  } catch (e) {
    next(e);
  }
});

// The shared case body (P3).
caseRoutes.get("/cases/:id", requirePermission("case:read"), async (req, res, next) => {
  try {
    res.json(await getSharedCase(req.params.id));
  } catch (e) {
    next(e);
  }
});

// Recipient right of reply.
caseRoutes.post("/cases/:id/responses", requirePermission("case:respond"), async (req, res, next) => {
  try {
    const { text, evidence } = req.body ?? {};
    await submitResponse(req.params.id, "recipient", "Maya Reyes", {
      text: String(text ?? ""),
      evidence: Array.isArray(evidence) ? evidence : [],
    });
    res.status(201).json({ caseNumber: req.params.id, status: "UNDER_REVIEW" });
  } catch (e) {
    next(e);
  }
});

// Add evidence (merchant or recipient).
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

// Reviewer requests more information (max 2 — enforced in the machine).
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

// Reviewer decision. Refund returns an unsigned tx for the browser wallet.
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
