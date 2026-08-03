import { Router } from "express";
import { requirePermission, requireInternal, currentRole } from "../middleware.ts";
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
/**
 * @openapi
 * /payouts:
 *   post:
 *     tags: [Payouts]
 *     summary: Create a protected payout directly (no chain required)
 *     description: Used by the New Payout form when the RefundProtocol contract is not deployed yet. Creates a Payout record in ESCROWED status with the form data. When a chain is available, use the wallet signing path instead.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientWallet, amount, refundTo]
 *             properties:
 *               recipientWallet: { type: string }
 *               amount: { type: string }
 *               refundTo: { type: string }
 *               description: { type: string }
 *               deliverables: { type: array }
 *               protectionDate: { type: string }
 *     responses:
 *       201: { description: "{ payout: PayoutRow }" }
 *       400: { description: "Missing required fields" }
 *     notes: Requires `workorder:create` (reviewer/merchant only).
 */
payoutRoutes.post("/payouts", requirePermission("workorder:create"), async (req, res, next) => {
  try {
    const { recipientWallet, amount, refundTo, description, deliverables, protectionDate } = req.body ?? {};
    if (!recipientWallet || !amount || !refundTo) {
      throw new HttpError(400, "Recipient wallet, amount, and refund address are required.");
    }

    const caller = req.session.userId ? await User.findById(req.session.userId).lean() : null;
    const platformKey = caller?.platformKey ?? "northbeam";
    const rKey = recipientWallet.toLowerCase().slice(0, 10);

    // Also create a work order if deliverables are provided
    let workOrderRef: string | null = null;
    if (deliverables && Array.isArray(deliverables) && deliverables.length > 0 && description) {
      const wo = await WorkOrder.create({
        platformKey,
        recipientKey: rKey,
        description: String(description),
        deliverables: deliverables.map((d: { name?: string; due?: string }) => ({
          name: String(d.name ?? ""),
          due: String(d.due ?? ""),
          acceptanceCriteria: "",
        })),
        amount: String(amount),
        currency: "USDC",
        status: "open",
      });
      workOrderRef = `${rKey}:${description}`;
      void wo;
    }

    const paymentId = `pmt_${Date.now()}`;
    const now = new Date();
    const lockupEnd = protectionDate ? new Date(protectionDate).toISOString() : new Date(now.getTime() + 30 * 86400 * 1000).toISOString();

    const { canonicalHash } = await import("../canonical.ts");
    const receiptBody = {
      paymentId,
      chain: "arc-testnet",
      contractAddress: "not-deployed",
      txHash: `0x${paymentId.padEnd(64, "0").slice(0, 64)}`,
      amount: String(amount),
      refundTo,
      recipientKey: rKey,
      platformKey,
      paidAt: now.toISOString(),
    };
    const receiptHash = canonicalHash(receiptBody);

    const payout = await Payout.create({
      ...receiptBody,
      recipientWallet,
      workOrderRef,
      trancheIndex: null,
      disputeDeadline: lockupEnd,
      lockupEnd,
      status: "ESCROWED",
      receiptHash,
      registryAnchorTx: null,
      refundTxHash: null,
      withdrawTxHash: null,
    });

    res.status(201).json({ payout });
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
payoutRoutes.post("/payouts/:paymentId/disputes", requirePermission("case:open"), async (req, res, next) => {
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
