import { Router } from "express";
import { requirePermission, requireInternal, requireChainConfigured, currentRole } from "../middleware.ts";
import { recordDetectedPayment, getSharedReceipt, openedByForRole, openDispute } from "../services.ts";
import { Payout } from "../models/index.ts";
import { scopeFor } from "../scope.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Payout + receipt routes (PRD §11.2).
   ========================================================================== */

export const payoutRoutes = Router();

/**
 * @openapi
 * /payouts/detected:
 *   post:
 *     tags: [Payouts]
 *     summary: Receipt assembly from a detected on-chain payment (indexer → backend)
 *     security: [{ internalAuth: [] }]
 *     description: Idempotent — replays of the same paymentId return the existing receipt.
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { paymentId: {type: string}, to: {type: string}, amount: {type: string}, refundTo: {type: string}, txHash: {type: string} } } } }
 *     responses: { 201: { description: "Receipt created or existing returned" } }
 */
// Idempotent receipt assembly from a detected payment (indexer → backend).
payoutRoutes.post("/payouts/detected", requireInternal, async (req, res, next) => {
  try {
    const det = {
      paymentId: String(req.body.paymentId),
      chain: String(req.body.chain ?? "arc-local"),
      contractAddress: String(req.body.contractAddress ?? ""),
      txHash: String(req.body.txHash),
      to: String(req.body.to),
      amount: String(req.body.amount),
      refundTo: String(req.body.refundTo),
      blockTimestamp: String(req.body.blockTimestamp ?? new Date().toISOString()),
      txSender: String(req.body.txSender ?? ""),
    };
    const { payout, created } = await recordDetectedPayment(det);
    res.status(201).json({ payout, created });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /payouts:
 *   get:
 *     tags: [Payouts]
 *     summary: Payout ledger (sorted by paidAt)
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ payouts: PayoutRow[] }" } }
 *     notes: Requires `payout:read`.
 *
 *   post:
 *     tags: [Payouts]
 *     summary: (Removed) payouts are created only by the indexer on pay()
 *     description: >
 *       A Payout row is created ONLY by the indexer when it detects an on-chain
 *       `pay()` on the RefundProtocol — there is no POST endpoint. The merchant's
 *       browser wallet signs approve()+pay() directly (see wallet.ts
 *       approveAndPay); the indexer then builds the receipt.
 */
payoutRoutes.get("/payouts", requirePermission("payout:read"), async (req, res, next) => {
  try {
    void currentRole(req); // role available; list scoping is per-seat (GAP-B1)
    const scope = await scopeFor(req);
    const payouts = await Payout.find(scope?.payout ?? {}).sort({ paidAt: -1 }).lean();
    res.json({ payouts });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /payouts/{paymentId}/receipt:
 *   get:
 *     tags: [Payouts]
 *     summary: Full shared receipt (identical for every seat — P3)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: paymentId, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "Receipt body (payout + workOrder + case + decision + evidence)" }, 404: { description: Not found } }
 *     notes: Requires `payout:read`.
 */
payoutRoutes.get("/payouts/:paymentId/receipt", requirePermission("payout:read"), async (req, res, next) => {
  try {
    const receipt = await getSharedReceipt(req.params.paymentId);
    res.json(receipt);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /payouts/{paymentId}/disputes:
 *   post:
 *     tags: [Payouts]
 *     summary: Open a dispute against a payout
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: paymentId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [freeText], properties: { claimType: {type: string}, freeText: {type: string}, amountContested: {type: string} } } } }
 *     responses: { 201: { description: "{ caseNumber, status }" }, 409: { description: "Already has an open case" } }
 *     notes: Requires `case:open`.
 */
payoutRoutes.post("/payouts/:paymentId/disputes", requirePermission("case:open"), requireChainConfigured("refundProtocol"), async (req, res, next) => {
  try {
    const role = currentRole(req);
    const openedBy = openedByForRole(role);
    const { claimType, freeText, amountContested } = req.body ?? {};
    if (!freeText?.trim()) throw new HttpError(400, "Tell us what went wrong — the free-text claim is required.");
    const { caseDoc } = await openDispute(req.params.paymentId, openedBy, {
      claimType: String(claimType ?? "work_not_delivered_in_full"),
      freeText: String(freeText),
      amountContested: String(amountContested ?? ""),
    });
    res.status(201).json({ caseNumber: caseDoc.caseNumber, status: caseDoc.status });
  } catch (e) {
    next(e);
  }
});
