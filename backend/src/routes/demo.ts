import { Router, type Request, type Response, type NextFunction } from "express";
import { requirePermission } from "../middleware.ts";
import { loadEnv } from "../env.ts";
import { seedDemoWorld } from "../seed.ts";
import { confirmRefundExecuted } from "../services.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Demo routes (DEMO_MODE-gated, reviewer seat). PRD §11.2.
   - POST /demo/seed wipes 11 collections (heartbeat Meta survives) and rebuilds
     the world from frozen fixtures.
   - POST /demo/execute-refund simulates the indexer's refund confirmation with
     a fixed fake tx hash, always labeled `simulated:true` (D11).

   Both are destructive / fabricate chain facts, so they refuse to run unless
   DEMO_MODE is enabled (GAP-S2). demoMode defaults true; only the literal
   'false' disables it (PRD §18.2) — which is exactly when these must be blocked.
   ========================================================================== */

export const demoRoutes = Router();

const FAKE_REFUND_TX = "0x2e61aa04cd97f1b3805592e0c11da6b47f30918ce2ab5d6f01c744e5a90ab8c4";

/** Reject with 403 unless DEMO_MODE is enabled. */
function requireDemoMode(_req: Request, _res: Response, next: NextFunction): void {
  if (!loadEnv().demoMode) {
    return next(
      new HttpError(403, "Demo actions are disabled — DEMO_MODE is off. (PRD §18.2, GAP-S2)"),
    );
  }
  next();
}

/**
 * @openapi
 * /demo/seed:
 *   post:
 *     tags: [Demo]
 *     summary: Seed the demo world (DEMO_MODE only)
 *     description: Wipes data collections and rebuilds from frozen fixtures. Destructive — demo mode only.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { content: { application/json: { schema: { properties: { scenario: {type: string, enum: [A, B]}, withReply: {type: boolean}, stage: {type: string} } } } } }
 *     responses: { 201: { description: "{ caseNumber, paymentIds, scenario, stage }" } }
 *     notes: Requires `demo:seed` (reviewer only) + DEMO_MODE=true.
 */
demoRoutes.post("/demo/seed", requirePermission("demo:seed"), requireDemoMode, async (req, res, next) => {
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

/**
 * @openapi
 * /demo/execute-refund:
 *   post:
 *     tags: [Demo]
 *     summary: Simulate a refund confirmation (DEMO_MODE only)
 *     description: Labeled simulation of the indexer's refund-confirmation hook. Always carries `simulated: true`.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [paymentId], properties: { paymentId: {type: string}, debtRecorded: {type: boolean} } } } } }
 *     responses: { 200: { description: "{ ok, simulated: true, refundTxHash }" } }
 *     notes: Requires `demo:seed` + DEMO_MODE=true.
 */
demoRoutes.post("/demo/execute-refund", requirePermission("demo:seed"), requireDemoMode, async (req, res, next) => {
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
