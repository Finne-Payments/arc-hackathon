/* ============================================================================
   Claim-type vocabulary. allegationClaimType on the Case is a free string, but
   the product recognises a fixed set of dispute reasons; each maps to a
   human-readable label shown in the case room + timeline + disputes list.
   Unknown codes fall back to the raw string (forward-compatible — new types
   render literally until they're added here).
   ========================================================================== */

export const CLAIM_LABEL: Record<string, string> = {
  work_not_delivered_in_full: "Work not delivered in full",
  short_payment: "Short payment",
  unauthorised_charge: "Unauthorised charge",
  deliverable_rejected: "Deliverable rejected",
  other: "Other dispute",
};

/** The canonical default when a dispute is opened without an explicit type. */
export const DEFAULT_CLAIM_TYPE = "work_not_delivered_in_full";

/** Human label for a claim code; unknown codes render as their raw value. */
export function claimLabel(code: string | null | undefined): string {
  if (!code) return "Dispute";
  return CLAIM_LABEL[code] ?? code;
}

/** The recognised codes (for filters / dropdowns). */
export const CLAIM_CODES = Object.keys(CLAIM_LABEL);
