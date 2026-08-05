import { Router } from "express";
import { requirePermission, requireInternal, requireChainConfigured, currentRole } from "../middleware.ts";
import { recordDetectedPayment, getSharedReceipt, openedByForRole, openDispute } from "../services.ts";
import { attachWorkOrderDocument, previewWorkOrderDocument } from "../services/documents.ts";
import { Payout, WorkOrder, User, EvidenceAnnotation } from "../models/index.ts";
import { getEvidenceStore } from "../integrations/storage/localStore.ts";
import { validateUploadDeclaration, sanitizeFilename } from "../integrations/storage/uploadPolicy.ts";
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
    // Join the work order description into each payout so the ledger's "For"
    // column shows what the merchant entered — without a separate fetch.
    const paymentIds = payouts.map((p) => p.paymentId);
    const workOrders = await WorkOrder.find({ paymentId: { $in: paymentIds } }).lean();
    const woByPaymentId = new Map(workOrders.map((w) => [w.paymentId, w]));
    const enriched = payouts.map((p) => ({
      ...p,
      description: woByPaymentId.get(p.paymentId)?.description ?? null,
    }));
    res.json({ payouts: enriched });
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

/* ====================================================================== */
/* Work order documents — payment-time contracts attached to a payout.    */
/* Stored in S3, arbiter-only. Two-step presigned upload.                 */
/* ====================================================================== */

// Allocate a presigned PUT URL for a payment-time contract document.
payoutRoutes.post("/payouts/:paymentId/documents/uploads", requirePermission("workorder:create"), async (req, res, next) => {
  try {
    const { filename, mimeType, declaredSizeBytes } = req.body ?? {};
    // Central validation (same rules as case evidence).
    const check = validateUploadDeclaration({
      filename: String(filename ?? ""),
      mimeType: String(mimeType ?? ""),
      declaredSizeBytes: Number(declaredSizeBytes),
    });
    if (!check.ok) throw new HttpError(400, check.reason);
    // The payout must already exist (chain-first gate).
    const payout = await Payout.findOne({ paymentId: req.params.paymentId });
    if (!payout) {
      throw new HttpError(404, `No payout ${req.params.paymentId} — the on-chain pay() hasn't been detected yet.`);
    }
    const store = await getEvidenceStore();
    const allocation = await store.allocateUpload({
      scope: "workorder",
      ownerId: req.params.paymentId,
      filename: sanitizeFilename(String(filename)),
      mimeType: String(mimeType),
      declaredSizeBytes: Number(declaredSizeBytes),
    });
    res.status(201).json(allocation);
  } catch (e) {
    next(e);
  }
});

// Finalize a work order document upload + trigger the agent summary.
payoutRoutes.post("/payouts/:paymentId/documents/uploads/:uploadId/complete", requirePermission("workorder:create"), async (req, res, next) => {
  try {
    const { filename } = req.body ?? {};
    const store = await getEvidenceStore();
    const stored = await store.finalizeUpload(req.params.uploadId);
    const result = await attachWorkOrderDocument({
      paymentId: req.params.paymentId,
      stored: {
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        objectKey: stored.objectKey,
        filename: sanitizeFilename(String(filename ?? "contract")),
      },
    });
    res.status(201).json({ documentId: result.documentId, sha256: stored.sha256, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });
  } catch (e) {
    next(e);
  }
});

// Download of a work-order contract document (case parties — evidence:download).
payoutRoutes.get("/payouts/:paymentId/documents/:documentId/download", requirePermission("evidence:download"), async (req, res, next) => {
  try {
    const workOrder = await WorkOrder.findOne({ paymentId: req.params.paymentId }).lean();
    if (!workOrder) throw new HttpError(404, `No work order for payment ${req.params.paymentId}.`);
    const doc = (workOrder.documents ?? []).find((d) => d.documentId === req.params.documentId);
    if (!doc) throw new HttpError(404, `Document ${req.params.documentId} not found.`);
    const store = await getEvidenceStore();
    const url = await store.getDownloadUrl(doc.objectKey);
    res.json(url);
  } catch (e) {
    next(e);
  }
});

// Preview a work-order contract document inline (case parties — evidence:download).
payoutRoutes.get("/payouts/:paymentId/documents/:documentId/preview", requirePermission("evidence:download"), async (req, res, next) => {
  try {
    const result = await previewWorkOrderDocument(req.params.paymentId, req.params.documentId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Agent summaries for a payment's contract documents (the arbiter sees these).
payoutRoutes.get("/payouts/:paymentId/documents/annotations", requirePermission("workorder:read"), async (req, res, next) => {
  try {
    const annotations = await EvidenceAnnotation.find({
      ownerRef: { $regex: `^workorder:${req.params.paymentId}:` },
    }).sort({ generatedAt: 1 }).lean();
    res.json({ annotations });
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
