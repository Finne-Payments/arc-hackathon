import { Router } from "express";
import { requirePermission } from "../middleware.ts";
import { getSharedCase } from "../services.ts";
import { claimLabel } from "../claimVocabulary.ts";

/* ============================================================================
   Timeline + decision-preview routes.
   The timeline is a true case chronicle — every entry is built from real case
   data and surfaces the *content* of each event (claim, reply snippet, brief
   headline, evidence), not just a bare "X happened" marker. Entries are pushed
   in lifecycle order; the frontend renders them as-is.
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

/** Short snippet for timeline labels — first clause, capped. */
function snippet(text: string | undefined | null, max = 64): string {
  if (!text) return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

interface TLEvent {
  time: string;
  type: string;
  label: string;
  detail?: string;
  txHash?: string;
}

/**
 * Internal build shape — carries the raw ISO timestamp (`sortAt`) so events can
 * be sorted latest-first before the display time string is formatted.
 */
interface TLBuild {
  sortAt: string;
  type: string;
  label: string;
  detail?: string;
  txHash?: string;
}

/**
 * @openapi
 * /cases/{id}/timeline:
 *   get:
 *     tags: [Timeline]
 *     summary: Case timeline (assembled from real lifecycle data)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ events: [{ time, type, label, detail?, txHash? }] }" } }
 *     notes: Requires `case:read`.
 */
// GET /cases/:id/timeline — the case chronicle, content-rich.
extraRoutes.get("/cases/:id/timeline", requirePermission("case:read"), async (req, res, next) => {
  try {
    const shared = await getSharedCase(req.params.id);
    const built: TLBuild[] = [];

    const payout = shared.payout as { paidAt: string; txHash: string; amount: string } | null;
    const c = shared.case as {
      openedAt: string;
      payoutRef: string;
      openedBy: string;
      allegationClaimType: string;
      allegationFreeText: string;
      allegationAmountContested: string;
      infoRequests: { target: string; text: string; requestedAt: string }[];
    } | null;
    const responses = shared.responses as { authorName: string; text: string; submittedAt: string }[];
    const evidence = shared.evidence as { title: string; submittedBy: string; submittedAt: string }[];
    const brief = shared.brief as {
      latest: {
        generatedAt: string;
        checks: { result: string }[];
        inconsistencies: string[];
        missingItems: string[];
      };
      versions: number;
    } | null;
    const decision = shared.decision as { decidedAt: string; outcome: string; reason: string } | null;

    // 1. Payment protected.
    if (payout?.paidAt) {
      built.push({
        sortAt: payout.paidAt,
        type: "payment",
        label: `Payment protected on Arc`,
        detail: `${payout.amount} USDC escrowed`,
        txHash: payout.txHash,
      });
    }

    // 2. Dispute opened — with the claim type, amount, and the opener's words.
    if (c?.openedAt) {
      const contested = c.allegationAmountContested || "0";
      built.push({
        sortAt: c.openedAt,
        type: "dispute",
        label: `Dispute opened: ${claimLabel(c.allegationClaimType)}`,
        detail: [
          `${contested} USDC contested · opened by ${c.openedBy === "recipient" ? "recipient" : "platform"}`,
          snippet(c.allegationFreeText, 90),
        ]
          .filter(Boolean)
          .join(" — "),
      });
    }

    // 3. Information requests — target + a snippet of the question.
    for (const req of c?.infoRequests ?? []) {
      built.push({
        sortAt: req.requestedAt,
        type: "info",
        label: `Information requested from ${req.target}`,
        detail: snippet(req.text),
      });
    }

    // 4. Responses — the replier + a snippet of what they said.
    for (const r of responses) {
      built.push({
        sortAt: r.submittedAt,
        type: "reply",
        label: `Reply from ${r.authorName}`,
        detail: snippet(r.text),
      });
    }

    // 5. Evidence — each submission is a dated entry.
    for (const e of evidence) {
      built.push({
        sortAt: e.submittedAt,
        type: "evidence",
        label: `Evidence added by ${e.submittedBy}`,
        detail: e.title,
      });
    }

    // 6. Agent brief — only when one exists. Headline = pass/missing counts.
    if (brief?.latest?.generatedAt) {
      const checks = brief.latest.checks ?? [];
      const passed = checks.filter((c) => c.result === "pass").length;
      const missing = checks.length - passed;
      const extra: string[] = [];
      if (brief.latest.inconsistencies?.length) extra.push(`${brief.latest.inconsistencies.length} inconsistency`);
      if (brief.latest.missingItems?.length) extra.push(`${brief.latest.missingItems.length} missing item`);
      built.push({
        sortAt: brief.latest.generatedAt,
        type: "agent",
        label: `Agent brief prepared (v${brief.versions})`,
        detail: [
          `${passed} of ${checks.length} checks pass${missing ? ` · ${missing} missing` : ""}`,
          extra.join(" · "),
        ]
          .filter(Boolean)
          .join(" — "),
      });
    }

    // 7. Decision — outcome + a snippet of the written reason.
    if (decision?.decidedAt) {
      built.push({
        sortAt: decision.decidedAt,
        type: "decision",
        label: `Decision: ${decision.outcome}`,
        detail: snippet(decision.reason, 90),
      });
    }

    // Latest-first: sort by raw timestamp descending. Events without a parseable
    // timestamp fall to the end (NaN comparison handling).
    built.sort((a, b) => {
      const ta = Date.parse(a.sortAt);
      const tb = Date.parse(b.sortAt);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });

    const events: TLEvent[] = built.map(({ sortAt, ...rest }) => ({ time: fmtDate(sortAt), ...rest }));
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
