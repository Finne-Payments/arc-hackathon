import { Router } from "express";
import { requirePermission } from "../middleware.ts";
import { seedDemoWorld } from "../seed.ts";
import { confirmRefundExecuted } from "../services.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Demo routes (DEMO_MODE-gated, reviewer seat). PRD §11.2.
   - POST /demo/seed wipes 11 collections (heartbeat Meta survives) and rebuilds
     the world from frozen fixtures.
   - POST /demo/execute-refund simulates the indexer's refund confirmation with
     a fixed fake tx hash, always labeled `simulated:true` (D11).
   ========================================================================== */

export const demoRoutes = Router();

const FAKE_REFUND_TX = "0x2e61aa04cd97f1b3805592e0c11da6b47f30918ce2ab5d6f01c744e5a90ab8c4";

demoRoutes.post("/demo/seed", requirePermission("demo:seed"), async (req, res, next) => {
  try {
    const scenario = req.body?.scenario === "B" ? "B" : "A";
    const withReply = req.body?.withReply !== false; // default true (scenario A under review)
    const stage = req.body?.stage; // optional explicit case stage override
    const result = await seedDemoWorld({ scenario, withReply, stage });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

demoRoutes.post("/demo/execute-refund", requirePermission("demo:seed"), async (req, res, next) => {
  try {
    const paymentId = String(req.body?.paymentId ?? "");
    if (!paymentId) throw new HttpError(400, "paymentId is required.");
    // Simulated refund confirmation (D11 — always labeled in the UI).
    await confirmRefundExecuted(paymentId, FAKE_REFUND_TX, Boolean(req.body?.debtRecorded));
    res.status(200).json({ ok: true, simulated: true, refundTxHash: FAKE_REFUND_TX });
  } catch (e) {
    next(e);
  }
});
