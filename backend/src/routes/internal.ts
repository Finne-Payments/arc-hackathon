import { Router } from "express";
import { requireInternal } from "../middleware.ts";
import { confirmRefundExecuted, confirmWithdrawn } from "../services.ts";
import { Case } from "../models/index.ts";
import { applyCaseEvent } from "../stateMachines.ts";

/* ============================================================================
   Internal hooks (indexer → backend, all 200 on success). PRD §11.2.
   These drive the server-side state machines from chain observation. In this
   build there's no indexer process, so these are exercised by /demo/seed and
   the frontend's labeled simulation — but the contract is identical.
   ========================================================================== */

export const internalRoutes = Router();

// Refund observed on chain.
internalRoutes.post("/internal/payments/:id/refund-executed", requireInternal, async (req, res, next) => {
  try {
    const { refundTxHash, debtRecorded } = req.body ?? {};
    await confirmRefundExecuted(req.params.id, String(refundTxHash), Boolean(debtRecorded));
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Withdrawal observed on chain.
internalRoutes.post("/internal/payments/:id/withdrawn", requireInternal, async (req, res, next) => {
  try {
    const { withdrawTxHash } = req.body ?? {};
    await confirmWithdrawn(req.params.id, String(withdrawTxHash ?? ""));
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Lockup ended (no dispute). Indexer would fire this from wall-clock.
internalRoutes.post("/internal/payments/:id/lockup-ended", requireInternal, async (_req, res, next) => {
  try {
    // The edge ESCROWED → WITHDRAWABLE (or CLEARED → WITHDRAWABLE) is driven here.
    // The services layer doesn't expose a dedicated call in this build; the
    // machines already define the edges. For demo integrity we no-op (PH-5).
    res.status(200).json({ ok: true, note: "lockup-ended is a PH-5 indexer hook" });
  } catch (e) {
    next(e);
  }
});

// Debt settled (recipient's next withdrawal absorbed the debt).
internalRoutes.post("/internal/payments/:id/debt-settled", requireInternal, async (_req, res, next) => {
  try {
    res.status(200).json({ ok: true, note: "debt-settled handled via refund-executed chain in this build" });
  } catch (e) {
    next(e);
  }
});

// Response window elapsed with no reply → case advances to UNDER_REVIEW.
internalRoutes.post("/internal/cases/:id/deadline-passed", requireInternal, async (req, res, next) => {
  try {
    const caseDoc = await Case.findOne({ caseNumber: req.params.id });
    if (caseDoc) {
      try {
        const after = applyCaseEvent(
          { status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount },
          "deadline_passed",
        );
        caseDoc.status = after.status;
        await caseDoc.save();
      } catch {
        // already past this point — expected chatter
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
