/* ============================================================================
   FIN-104 — narrative summary (one paragraph, labelled "Summary").

   A short, source-stamped paragraph that summarises what the case is about for
   the reviewer. Renders absent on any failure (P8). Through the shared client +
   post-filter like every other model-touched line. This is the narrative the
   reviewer reads at the top of the case — it prepares, never concludes.
   ========================================================================== */

import { complete } from "./model-client.ts";
import { gateLine } from "./post-filter.ts";

export interface NarrativeResult {
  text: string | null; // null when degraded — render nothing, not a placeholder
  degraded: boolean;
}

/**
 * Generate a one-paragraph summary. Degrades to null on timeout/error/filter-
 * block. The caller renders the Summary section only when text is non-null.
 */
export async function generateNarrative(
  caseContext: string,
  findingsSummary: string,
): Promise<NarrativeResult> {
  const system = [
    "You are a clerk summarising a dispute file. You prepare; you never decide.",
    "Write ONE paragraph (2-4 sentences) summarising what the dispute is about and what the checks found.",
    "Do not use outcome words (refund, reject, approve, release). Do not indicate which side should win.",
    "Do not introduce facts that are not in the provided context. Plain language.",
  ].join(" ");

  const prompt = [
    `Case context: ${caseContext}`,
    "",
    `Findings summary: ${findingsSummary}`,
    "",
    "Write the summary paragraph.",
  ].join("\n");

  const res = await complete({ task: "narrative.summary", system, prompt });
  if (res.degraded || !res.text) {
    return { text: null, degraded: true };
  }

  const gated = gateLine(res.text, "model");
  if (gated.degrade) {
    // The whole narrative is one block; if it trips the filter, drop it.
    console.warn("[narrative] summary blocked by post-filter — degrading to absent");
    return { text: null, degraded: true };
  }
  return { text: gated.text, degraded: false };
}
