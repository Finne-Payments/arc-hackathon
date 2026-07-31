/* ============================================================================
   Status vocabulary — the single shared mapping (PRD §10.3, FIN-51).
   No screen invents its own wording. The web app imports these words; the
   backend supplies them so both sides agree.
   ========================================================================== */

export type PaymentStatus =
  | "ESCROWED"
  | "DISPUTED"
  | "REFUNDED"
  | "CLEARED"
  | "WITHDRAWABLE"
  | "WITHDRAWN"
  | "DEBT_OUTSTANDING"
  | "DEBT_SETTLED";

export type CaseStatus =
  | "OPEN"
  | "AWAITING_RESPONSE"
  | "UNDER_REVIEW"
  | "DECIDED"
  | "EXECUTED"
  | "CLOSED";

export type DecisionOutcome = "refund" | "release" | "no_action";

/** The 1–3 outcome code that goes on chain via anchorDecision (PRD §8.2). */
export function outcomeCode(o: DecisionOutcome): 1 | 2 | 3 {
  switch (o) {
    case "refund":
      return 1;
    case "release":
      return 2;
    case "no_action":
      return 3;
  }
}

/** Payment state machine → UI word (PRD §10.3). */
export const PAYMENT_WORDS: Record<PaymentStatus, string> = {
  ESCROWED: "Protected",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  CLEARED: "Cleared",
  WITHDRAWABLE: "Ready to withdraw",
  WITHDRAWN: "Withdrawn",
  DEBT_OUTSTANDING: "Debt outstanding",
  DEBT_SETTLED: "Debt settled",
};

/** Case state machine → UI word. EXECUTED maps to the money word (PRD §10.3). */
export const CASE_WORDS: Record<CaseStatus, string> = {
  OPEN: "Opened",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Under review",
  DECIDED: "Decided",
  EXECUTED: "Refunded",
  CLOSED: "Closed",
};
