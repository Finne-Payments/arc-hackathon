/* ============================================================================
   Opaque identifiers — generated server-side, never caller-supplied (BE-02).
   Payment IDs, case IDs, correction IDs, job IDs, evidence IDs are opaque.
   ========================================================================== */

/** Prefix convention for opaque business IDs. */
export const ID_PREFIXES = {
  payment: "pay",
  case: "case",
  correction: "cor",
  job: "job",
  evidence: "ev",
  analysis: "an",
  decision: "dec",
  invitation: "inv",
  response: "resp",
} as const;

/**
 * Generate an opaque ID: `<prefix>_<base36-time>_<random>`.
 * Deterministic prefix + time-sortable + collision-resistant random suffix.
 */
export function generateId(prefix: keyof typeof ID_PREFIXES | string): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}_${random}`;
}

/** Validate that a string looks like an opaque ID with the given prefix. */
export function isOpaqueId(value: string, prefix: string): boolean {
  return new RegExp(`^${prefix}_[a-z0-9]+_[a-z0-9]+$`, "i").test(value);
}

/** Canonical case display number for receipts/notices (e.g. CASE-0142). */
export function caseDisplayNumber(seq: number): string {
  return "CASE-" + String(seq).padStart(4, "0");
}
