import { Router } from "express";
import { requirePermission } from "../middleware.ts";
import { getSharedCase } from "../services.ts";

/* ============================================================================
   Timeline + decision-preview routes.
   The timeline is assembled from the case's lifecycle events (no hardcoded
   strings) — every entry's text is built from real data.
   ========================================================================== */

export const extraRoutes = Router();

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

/**
 * @openapi
 * /cases/{id}/timeline:
 *   get:
 *     tags: [Timeline]
 *     summary: Case timeline (assembled from real lifecycle data)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ events: [{ time, type, label, txHash? }] }" } }
 *     notes: Requires `case:read`.
 */
// GET /cases/:id/timeline — assembled from real case lifecycle data.
extraRoutes.get("/cases/:id/timeline", requirePermission("case:read"), async (req, res, next) => {
  try {
    const shared = await getSharedCase(req.params.id);
    const events: { time: string; type: string; label: string; txHash?: string }[] = [];
    const c = shared.case as { openedAt: string; payoutRef: string; infoRequests: { text: string; requestedAt: string }[] };
    const payout = shared.payout as { paidAt: string; txHash: string };
    const responses = shared.responses as { submittedAt: string }[];
    const brief = shared.brief as { latest: { generatedAt: string }; versions: number } | null;
    const decision = shared.decision as { decidedAt: string; outcome: string } | null;

    if (payout?.paidAt) events.push({ time: fmtDate(payout.paidAt), type: "payment", label: "Payment protected on Arc", txHash: payout.txHash });
    if (c?.openedAt) events.push({ time: fmtDate(c.openedAt), type: "dispute", label: "Dispute opened" });
    for (const req of c?.infoRequests ?? []) {
      events.push({ time: fmtDate(req.requestedAt), type: "info", label: `More information requested: ${req.text}` });
    }
    for (const r of responses) {
      events.push({ time: fmtDate(r.submittedAt), type: "reply", label: "Reply submitted" });
    }
    if (brief?.latest?.generatedAt) {
      events.push({ time: fmtDate(brief.latest.generatedAt), type: "agent", label: `Agent brief updated (v${brief.versions})` });
    }
    if (decision?.decidedAt) {
      events.push({ time: fmtDate(decision.decidedAt), type: "decision", label: `Decision signed: ${decision.outcome}` });
    }

    res.json({ events });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /cases/{id}/decision-preview:
 *   post:
 *     tags: [Timeline]
 *     summary: Decision consequence preview (built from real payout data)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [outcome], properties: { outcome: {type: string, enum: [refund, release, no_action]} } } } } }
 *     responses: { 200: { description: "{ preview: string }" } }
 *     notes: Requires `case:read`. Pure read — no mutation.
 */
// POST /cases/:id/decision-preview — outcome consequence text built from real data.
extraRoutes.post("/cases/:id/decision-preview", requirePermission("case:read"), async (req, res, next) => {
  try {
    const shared = await getSharedCase(req.params.id);
    const payout = shared.payout as { amount: string; refundTo: string };
    const c = shared.case as { allegationAmountContested: string };
    const contested = c?.allegationAmountContested || "0";
    const total = payout?.amount || "0";
    const refundTo = (payout?.refundTo ?? "").slice(0, 8) + "…";
    const outcome = req.body?.outcome;

    let preview = "";
    if (outcome === "refund") {
      preview = `${contested} USDC reverts from escrow to the refund address (${refundTo}), fixed when the payment was made. The remaining ${total} USDC stays protected for the recipient.`;
    } else if (outcome === "release") {
      preview = `The payout stands; the recipient can withdraw the full ${total} USDC when the protection window ends. Your reasons are shown to both sides.`;
    } else {
      preview = "The dispute ends with no refund. The payout continues on its original schedule and the case record is locked.";
    }
    res.json({ preview });
  } catch (e) {
    next(e);
  }
});
