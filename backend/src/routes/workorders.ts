import { Router } from "express";
import { requirePermission } from "../middleware.ts";
import { WorkOrder } from "../models/index.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Work-order routes (PRD §11.2). The only endpoint group that was previously
   missing — the `workorder:create` / `workorder:read` permissions existed in
   the RBAC matrix but pointed at nothing.

   A work order binds a chain payment to the work, deliverables, amount and
   currency. It is NOT append-only (PRD §9.2 — only Payout/Evidence/Decision
   are); the `status` field is mutable so it can move open → closed.
   ========================================================================== */

export const workOrderRoutes = Router();

// Create a work order for a platform. Reviewer-only (workorder:create).
workOrderRoutes.post("/platforms/:key/workorders", requirePermission("workorder:create"), async (req, res, next) => {
  try {
    const platformKey = req.params.key;
    const { recipientKey, description, deliverables, amount } = req.body ?? {};

    if (!description?.trim()) {
      throw new HttpError(400, "A description of the work is required.");
    }
    if (!amount?.toString().trim()) {
      throw new HttpError(400, "The payout amount is required.");
    }
    if (!deliverables || !Array.isArray(deliverables) || deliverables.length === 0) {
      throw new HttpError(400, "At least one deliverable is required.");
    }

    const doc = await WorkOrder.create({
      platformKey,
      recipientKey: String(recipientKey ?? ""),
      description: String(description),
      deliverables: deliverables.map((d: { name?: string; due?: string; acceptanceCriteria?: string }) => ({
        name: String(d.name ?? ""),
        due: String(d.due ?? ""),
        acceptanceCriteria: String(d.acceptanceCriteria ?? ""),
      })),
      amount: String(amount),
      currency: "USDC",
      status: "open",
    });

    res.status(201).json({ workOrder: doc });
  } catch (e) {
    next(e);
  }
});

// List work orders for a platform. Any seat with workorder:read.
workOrderRoutes.get("/platforms/:key/workorders", requirePermission("workorder:read"), async (req, res, next) => {
  try {
    const workOrders = await WorkOrder.find({ platformKey: req.params.key }).sort({ _id: -1 }).lean();
    res.json({ workOrders });
  } catch (e) {
    next(e);
  }
});
