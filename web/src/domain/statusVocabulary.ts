/* ============================================================================
   Status vocabulary (PRD §10.3, GAP-W1). UI wording lives in exactly one module.
   This is the web-side mirror of the backend's statusVocabulary — the single
   source of truth for the words + dots the screens render. Until a real shared
   @finne/domain workspace package exists, both apps import an identical copy;
   the two MUST stay in lockstep (any change is made here and in the backend).
   ========================================================================== */

/** Display word for each payment state. */
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
};

/** Display word for each case state (EXECUTED deliberately maps to the money word). */
export const CASE_WORD: Record<string, string> = {
  OPEN: "Opened",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Under review",
  DECIDED: "Decided",
  EXECUTED: "Refunded",
  CLOSED: "Closed",
};

/** The PRD §11.2 minimum length for a decision reason. */
export const MIN_DECISION_REASON = 20;
/** The PRD §10.2 cap on information requests per case. */
export const MAX_INFO_REQUESTS = 2;
