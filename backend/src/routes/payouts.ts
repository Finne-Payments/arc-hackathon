import { Router } from "express";
import { requirePermission, requireInternal, requireChainConfigured, currentRole } from "../middleware.ts";
import { recordDetectedPayment, getSharedReceipt, openedByForRole, openDispute } from "../services.ts";
import { Payout, WorkOrder, User } from "../models/index.ts";
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
 * /payouts:
 *   get:
 *     tags: [Payouts]
 *     summary: Payout ledger (sorted by paidAt desc)
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ payouts: PayoutRow[] }" } }
 *     notes: Requires `payout:read`. Payouts are created ONLY by the indexer from on-chain pay() events — there is no POST endpoint.
 */

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
 * /payouts/{paymentId}/metadata:
 *   post:
 *     tags: [Payouts]
 *     summary: Attach work-order metadata to an existing on-chain payout
 *     description: >
 *       Chain-first: the on-chain pay() must have already happened (the indexer
 *       created the Payout row from the PaymentCreated event). This endpoint
 *       attaches the off-chain metadata — description, deliverables, work order —
 *       to that real payout. It 404s if the payout doesn't exist yet, so metadata
 *       can never be saved without a confirmed on-chain payment behind it.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: paymentId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               deliverables: { type: array, items: { type: object, properties: { name: {type: string}, due: {type: string}, acceptanceCriteria: {type: string} } } }
 *     responses:
 *       200: { description: "{ payout, workOrder } — metadata saved" }
 *       404: { description: "Payout not found — the on-chain pay() hasn't been detected yet" }
 *     notes: "Requires workorder:create. The payout MUST already exist (indexer-created from a real pay())."
 */
payoutRoutes.post("/payouts/:paymentId/metadata", requirePermission("workorder:create"), async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { description, deliverables, settleImmediately } = req.body ?? {};

    // Chain-first gate: the payout must already exist in the DB. The indexer
    // creates it only when it detects a real on-chain PaymentCreated event, so
    // its presence PROVES the chain confirmed pay(). No payout → 404.
    const payout = await Payout.findOne({ paymentId });
    if (!payout) {
      throw new HttpError(404, `No payout ${paymentId} — the on-chain pay() hasn't been detected yet. Wait for the indexer to confirm it, then attach metadata.`);
    }

    const caller = req.session.userId ? await User.findById(req.session.userId).lean() : null;
    const platformKey = caller?.platformKey ?? payout.platformKey ?? "unknown";
    const rKey = payout.recipientKey || payout.recipientWallet.toLowerCase().slice(0, 10);

    // Create / update the work order and link it to the payout via paymentId.
    const desc = String(description ?? "").trim();
    let workOrder: typeof WorkOrder.prototype | null = null;
    if (desc || (deliverables && deliverables.length > 0)) {
      workOrder = await WorkOrder.findOneAndUpdate(
        { paymentId },
        {
          $set: {
            platformKey,
            recipientKey: rKey,
            description: desc || "Protected payout",
            deliverables: (deliverables ?? []).map((d: { name?: string; due?: string; acceptanceCriteria?: string }) => ({
              name: String(d.name ?? ""),
              due: String(d.due ?? ""),
              acceptanceCriteria: String(d.acceptanceCriteria ?? ""),
            })),
            amount: String(payout.amount),
            currency: "USDC",
            status: "open",
            paymentId,
          },
        },
        { upsert: true, new: true },
      );
    }

    // "Settle immediately": the merchant confirms the deliverables are already
    // delivered, so the protection window is skipped. Transition the payout
    // ESCROWED → WITHDRAWABLE so the recipient can claim the funds right away.
    // The on-chain lockup (set by the arbiter at deploy) still applies — the
    // recipient calls withdraw() once the contract's releaseTimestamp passes.
    if (settleImmediately && payout.status === "ESCROWED") {
      try {
        const { applyPaymentEvent } = await import("../stateMachines.ts");
        payout.status = applyPaymentEvent(payout.status as never, "lockup_end_no_dispute");
      } catch {
        // Already past ESCROWED (e.g. disputed) — the transition is a no-op.
      }
      await payout.save();
    }

    res.status(200).json({ payout, workOrder });
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
