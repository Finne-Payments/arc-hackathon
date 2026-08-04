/* ============================================================================
   FIN-103 — outcome-word post-filter (shared module).

   Applied to ALL model-generated text (narrative, turning questions). The clerk
   prepares and points; it never names an outcome in its own voice. Banned words
   are the outcome-action vocabulary the reviewer alone may choose.

   Template-authored and computed lines are EXEMPT by construction — the caller
   carries a provenance flag ("template" | "computed" | "model"), and only
   "model" lines pass through this filter. That is what makes outcome-requirement
   templates safe to name outcomes: a person authored them, the model did not.
   ========================================================================== */

export type Provenance = "template" | "computed" | "model";

/**
 * Outcome-action words the reviewer alone may utter. Matched as whole words,
 * case-insensitive, with common inflections. "release" is included because it
 * is the escrow action synonym for "uphold the platform".
 *
 * Kept narrow on purpose: we police outcome *actions*, not ordinary verbs. The
 * verdict guard (validateNoVerdictKeys) handles liability/fraud language; this
 * filter handles the reviewer's decision vocabulary leaking into model text.
 */
const BANNED_OUTCOME_WORDS = [
  "refund",
  "refunding",
  "refunded",
  "refunds",
  "reject",
  "rejecting",
  "rejected",
  "rejects",
  "rejection",
  "approve",
  "approving",
  "approved",
  "approves",
  "approval",
  "release",
  "releasing",
  "released",
  "releases",
];

const BANNED_WORD_RE = new RegExp(
  `\\b(${BANNED_OUTCOME_WORDS.join("|")})\\b`,
  "gi",
);

export interface FilterResult {
  /** The text, with banned words masked as [redacted] (best-effort) if replaceable, else unchanged. */
  text: string;
  /** True if one or more banned words were found. */
  blocked: boolean;
  /** The banned tokens found, lowercased + deduped. */
  matched: string[];
}

/**
 * Filter a single model-generated text block. Returns the (possibly masked)
 * text plus the list of banned words found. The caller decides whether to
 * degrade (drop the line) or keep the masked text — frame assembly drops the
 * line entirely on `blocked`, because a masked question reads worse than none.
 */
export function filterModelText(text: string): FilterResult {
  const matched = new Set<string>();
  const masked = text.replace(BANNED_WORD_RE, (tok) => {
    matched.add(tok.toLowerCase());
    return "[outcome]";
  });
  return {
    text: masked,
    blocked: matched.size > 0,
    matched: [...matched],
  };
}

/**
 * Gate a line by provenance. Model lines are filtered; template/computed lines
 * pass through untouched (they are exempt — a human authored them). Returns the
 * final text and a `degrade` flag: when a model line is blocked, the caller
 * should treat the line as unusable and drop it (P8 degrade).
 */
export function gateLine(
  text: string,
  provenance: Provenance,
): { text: string; degrade: boolean } {
  if (provenance !== "model") return { text, degrade: false };
  const res = filterModelText(text);
  return { text: res.text, degrade: res.blocked };
}
