/* ============================================================================
   Status vocabulary — UI wording lives in exactly one shared module.
   Now re-exports from the @finne/domain workspace package (FND-02). The legacy
   escrow-model words below are a compatibility shim kept only until BE-02/UI-01
   migrate the backend models and screens to the registrar vocabulary.
   ========================================================================== */

// Shared constants — single source of truth in @finne/domain
import { MAX_INFO_REQUESTS } from "@finne/domain";
export { PAYMENT_WORDS, CASE_WORDS } from "@finne/domain";
export { MAX_INFO_REQUESTS };

/** The minimum length for a decision reason (DEC-01). Mirrors backend. */
export const MIN_DECISION_REASON = 20;

/* ============================================================================
   Legacy escrow-model display words (compatibility shim).
   These map the OLD payment/case states the current backend still emits
   (ESCROWED, DEBT_OUTSTANDING, EXECUTED, …). They will be removed when UI-01
   migrates the screens to the registrar vocabulary (OBSERVED/VERIFIED/…).
   ========================================================================== */

/** Legacy display word for each OLD payment state. @deprecated use PAYMENT_WORDS */
export const PAYMENT_WORD: Record<string, string> = {
  ESCROWED: "Protected",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  CLEARED: "Cleared",
  WITHDRAWABLE: "Ready to withdraw",
  WITHDRAWN: "Withdrawn",
  DEBT_OUTSTANDING: "Debt outstanding",
  DEBT_SETTLED: "Debt settled",
};

/** Status-dot color token for each payment state. */
export const PAYMENT_DOT: Record<string, "warn" | "brand" | "ok" | "risk" | "ink"> = {
  ESCROWED: "brand",
  DISPUTED: "warn",
  REFUNDED: "risk",
  CLEARED: "ok",
  WITHDRAWABLE: "ok",
  WITHDRAWN: "ink",
  DEBT_OUTSTANDING: "risk",
  DEBT_SETTLED: "ok",
  // registrar-model states (forward-compat)
  OBSERVED: "warn",
  VERIFIED: "brand",
  REJECTED: "risk",
  PROOF_DRAFT: "warn",
  ANCHORED: "ok",
  UNDISPUTED: "ok",
};

/** Legacy display word for each OLD case state. @deprecated use CASE_WORDS */
export const CASE_WORD: Record<string, string> = {
  OPEN: "Opened",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Under review",
  DECIDED: "Decided",
  EXECUTED: "Refunded",
  CLOSED: "Closed",
};

/* ============================================================================
   Claim-type vocabulary (mirrors backend claimVocabulary.ts — keep in lockstep).
   ========================================================================== */
export const CLAIM_LABEL: Record<string, string> = {
  work_not_delivered_in_full: "Work not delivered in full",
  short_payment: "Short payment",
  unauthorised_charge: "Unauthorised charge",
  deliverable_rejected: "Deliverable rejected",
  other: "Other dispute",
};

export const DEFAULT_CLAIM_TYPE = "work_not_delivered_in_full";

export function claimLabel(code: string | null | undefined): string {
  if (!code) return "Dispute";
  return CLAIM_LABEL[code] ?? code;
}

export const CLAIM_CODES = Object.keys(CLAIM_LABEL);
