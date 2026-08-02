import { Router } from "express";
import { requireInternal } from "../middleware.ts";
import { confirmRefundExecuted, confirmWithdrawn } from "../services.ts";
import { Case, Payout } from "../models/index.ts";
import { applyCaseEvent, applyPaymentEvent } from "../stateMachines.ts";

/* ============================================================================
   Internal hooks (indexer → backend, all 200 on success). PRD §11.2.
   These drive the server-side state machines from chain observation. In this
   build there's no indexer process, so these are exercised by /demo/seed and
   the frontend's labeled simulation — but the contract is identical.
   ========================================================================== */

export const internalRoutes = Router();

/**
 * @openapi
 * /internal/payments/{id}/refund-executed:
 *   post:
 *     tags: [Internal]
 *     summary: Refund observed on chain (indexer → backend)
 *     security: [{ internalAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { content: { application/json: { schema: { properties: { refundTxHash: {type: string}, debtRecorded: {type: boolean} } } } } }
 *     responses: { 200: { description: "Payment → REFUNDED (or DEBT_OUTSTANDING); case closed" } }
 *     notes: Internal channel only — requires `x-finne-internal` header.
 */
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

/**
 * @openapi
 * /internal/payments/{id}/withdrawn:
 *   post:
 *     tags: [Internal]
 *     summary: Withdrawal observed on chain
 *     security: [{ internalAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "Payment → WITHDRAWN" } }
 */
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

// Lockup ended (no dispute). Indexer fires this from wall-clock vs releaseTimestamp.
// Drives ESCROWED → WITHDRAWABLE, or CLEARED → WITHDRAWABLE (the two `lockup_end_*`
// edges defined in stateMachines.ts). A payment already past these states throws
// IllegalTransitionError, which we swallow — the hook is idempotent churn by design.
/**
 * @openapi
 * /internal/payments/{id}/lockup-ended:
 *   post: { tags: [Internal], summary: "Lockup ended (no dispute)", security: [{ internalAuth: [] }], parameters: [{ name: id, in: path, required: true }], responses: { 200: { description: OK } } }
 */
internalRoutes.post("/internal/payments/:id/lockup-ended", requireInternal, async (req, res, next) => {
  try {
    const payout = await Payout.findOne({ paymentId: req.params.id });
    if (payout) {
      try {
        const event =
          payout.status === "CLEARED" ? "lockup_end_after_clear" : "lockup_end_no_dispute";
        payout.status = applyPaymentEvent(payout.status as never, event as never);
        await payout.save();
      } catch {
        // already WITHDRAWABLE / withdrawn / refunded — expected, ignore
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Debt settled (recipient's next withdrawal absorbed the debt).
// Drives DEBT_OUTSTANDING → DEBT_SETTLED (terminal). Swallow the transition error
// if the debt is already settled or never recorded.
/**
 * @openapi
 * /internal/payments/{id}/debt-settled:
 *   post: { tags: [Internal], summary: "Debt settled (next payout absorbed it)", security: [{ internalAuth: [] }], parameters: [{ name: id, in: path, required: true }], responses: { 200: { description: OK } } }
 */
internalRoutes.post("/internal/payments/:id/debt-settled", requireInternal, async (req, res, next) => {
  try {
    const payout = await Payout.findOne({ paymentId: req.params.id });
    if (payout) {
      try {
        payout.status = applyPaymentEvent(payout.status as never, "next_payment_absorbs_debt");
        await payout.save();
      } catch {
        // not in DEBT_OUTSTANDING — expected, ignore
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Response window elapsed with no reply → case advances to UNDER_REVIEW.
/**
 * @openapi
 * /internal/cases/{id}/deadline-passed:
 *   post: { tags: [Internal], summary: "Response window elapsed (case → UNDER_REVIEW)", security: [{ internalAuth: [] }], parameters: [{ name: id, in: path, required: true }], responses: { 200: { description: OK } } }
 */
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
