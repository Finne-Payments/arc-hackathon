/* ============================================================================
   State machines — the registrar model (FND-03).
   Frozen here so backend, web, contracts, and tests share one source.

   INVARIANT: no production state implies escrow, debt, withdrawal, or
   original-payment reversal. The original 300 USDC payment is final; the only
   money that ever moves after the decision is a separate, recipient-authorized
   100 USDC voluntary correction.
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Payment states                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A payment is an *observed* Arc USDC transfer that Finné independently
 * verifies. It is never "escrowed" by Finné.
 */
export type PaymentState =
  | "OBSERVED" // indexer saw the transfer, not yet verified
  | "VERIFIED" // INT-02 verifier confirmed all transfer facts
  | "REJECTED" // verification failed (wrong sender/token/amount/chain/finality)
  | "PROOF_DRAFT" // deterministic proof run drafted, awaiting approval
  | "ANCHORED" // receipt hash anchored in FinneCaseRegistry
  | "DISPUTED" // a case is open against this payment
  | "UNDISPUTED"; // all cases closed; payment stands as final

export const PAYMENT_STATES: PaymentState[] = [
  "OBSERVED",
  "VERIFIED",
  "REJECTED",
  "PROOF_DRAFT",
  "ANCHORED",
  "DISPUTED",
  "UNDISPUTED",
];

export type PaymentEvent =
  | "verified" // OBSERVED → VERIFIED
  | "rejected" // OBSERVED → REJECTED
  | "proof_drafted" // VERIFIED → PROOF_DRAFT
  | "anchored" // PROOF_DRAFT → ANCHORED
  | "dispute_opened" // ANCHORED → DISPUTED
  | "dispute_closed" // DISPUTED → UNDISPUTED
  | "reverified"; // re-verification (stays VERIFIED)

/** Legal payment transitions. Any pair not listed is illegal (→ 409). */
export const PAYMENT_EDGES: Array<{ from: PaymentState; event: PaymentEvent; to: PaymentState }> = [
  { from: "OBSERVED", event: "verified", to: "VERIFIED" },
  { from: "OBSERVED", event: "rejected", to: "REJECTED" },
  { from: "VERIFIED", event: "proof_drafted", to: "PROOF_DRAFT" },
  { from: "PROOF_DRAFT", event: "anchored", to: "ANCHORED" },
  { from: "ANCHORED", event: "dispute_opened", to: "DISPUTED" },
  { from: "DISPUTED", event: "dispute_closed", to: "UNDISPUTED" },
  // re-verification is a no-op state transition (stays VERIFIED)
  { from: "VERIFIED", event: "reverified", to: "VERIFIED" },
];

/** UI display words for payment states (single shared mapping). */
export const PAYMENT_WORDS: Record<PaymentState, string> = {
  OBSERVED: "Observed on Arc",
  VERIFIED: "Verified",
  REJECTED: "Verification rejected",
  PROOF_DRAFT: "Proof in draft",
  ANCHORED: "Receipt anchored",
  DISPUTED: "Disputed",
  UNDISPUTED: "Final — no open dispute",
};

/* -------------------------------------------------------------------------- */
/* Case states                                                                 */
/* -------------------------------------------------------------------------- */

export type CaseState =
  | "OPEN" // case opened, notice served
  | "RESPONDED" // recipient submitted a response
  | "UNDER_REVIEW" // reviewer moved to review (may request info)
  | "EVIDENCE_REQUESTED" // reviewer asked for more info (max 2)
  | "DECIDED" // human decision recorded + anchored
  | "CORRECTION_OUTSTANDING" // correction instruction recorded
  | "CLOSED_CORRECTED" // correction verified + closed
  | "CLOSED_NO_CORRECTION"; // closed without correction (no-correction outcome)

export const CASE_STATES: CaseState[] = [
  "OPEN",
  "RESPONDED",
  "UNDER_REVIEW",
  "EVIDENCE_REQUESTED",
  "DECIDED",
  "CORRECTION_OUTSTANDING",
  "CLOSED_CORRECTED",
  "CLOSED_NO_CORRECTION",
];

export type CaseEvent =
  | "response_received" // OPEN → RESPONDED
  | "moved_to_review" // OPEN/RESPONDED → UNDER_REVIEW (deadline can force OPEN→UNDER_REVIEW)
  | "info_requested" // UNDER_REVIEW → EVIDENCE_REQUESTED (count < 2)
  | "info_answered" // EVIDENCE_REQUESTED → UNDER_REVIEW
  | "deadline_passed" // OPEN → UNDER_REVIEW (recipient didn't respond)
  | "decision_recorded" // UNDER_REVIEW → DECIDED
  | "correction_instructed" // DECIDED → CORRECTION_OUTSTANDING (only for correction outcomes)
  | "correction_verified" // CORRECTION_OUTSTANDING → CLOSED_CORRECTED
  | "closed_no_correction" // DECIDED → CLOSED_NO_CORRECTION (no-correction outcomes)
  | "recipient_declined_correction"; // CORRECTION_OUTSTANDING stays (decline recorded, case stays open)

export const CASE_EDGES: Array<{ from: CaseState; event: CaseEvent; to: CaseState; guard?: string }> = [
  { from: "OPEN", event: "response_received", to: "RESPONDED" },
  { from: "OPEN", event: "deadline_passed", to: "UNDER_REVIEW" },
  { from: "OPEN", event: "moved_to_review", to: "UNDER_REVIEW" },
  { from: "RESPONDED", event: "moved_to_review", to: "UNDER_REVIEW" },
  { from: "UNDER_REVIEW", event: "info_requested", to: "EVIDENCE_REQUESTED", guard: "infoRequestCount < 2" },
  { from: "EVIDENCE_REQUESTED", event: "info_answered", to: "UNDER_REVIEW" },
  { from: "EVIDENCE_REQUESTED", event: "info_requested", to: "EVIDENCE_REQUESTED", guard: "infoRequestCount < 2" },
  { from: "UNDER_REVIEW", event: "decision_recorded", to: "DECIDED" },
  // correction outcomes (platform/partial) → outstanding correction
  { from: "DECIDED", event: "correction_instructed", to: "CORRECTION_OUTSTANDING" },
  { from: "CORRECTION_OUTSTANDING", event: "correction_verified", to: "CLOSED_CORRECTED" },
  // no-correction outcomes (recipient-upheld / dismissed) → close directly
  { from: "DECIDED", event: "closed_no_correction", to: "CLOSED_NO_CORRECTION" },
  // recipient can decline; case stays outstanding (no state change)
  { from: "CORRECTION_OUTSTANDING", event: "recipient_declined_correction", to: "CORRECTION_OUTSTANDING" },
];

/** Max info requests per case (BE-06). */
export const MAX_INFO_REQUESTS = 2;

/** UI display words for case states (single shared mapping). */
export const CASE_WORDS: Record<CaseState, string> = {
  OPEN: "Open — awaiting response",
  RESPONDED: "Responded",
  UNDER_REVIEW: "Under review",
  EVIDENCE_REQUESTED: "More information requested",
  DECIDED: "Decided",
  CORRECTION_OUTSTANDING: "Correction outstanding",
  CLOSED_CORRECTED: "Closed — corrected",
  CLOSED_NO_CORRECTION: "Closed — no correction",
};

/** Terminal case states (no further transitions). */
export const TERMINAL_CASE_STATES: CaseState[] = ["CLOSED_CORRECTED", "CLOSED_NO_CORRECTION"];

/* -------------------------------------------------------------------------- */
/* Decision outcomes                                                           */
/* -------------------------------------------------------------------------- */

export type DecisionOutcome =
  | "RECIPIENT_UPHELD" // recipient wins; no correction
  | "PLATFORM_UPHELD" // platform wins; correction = full challenged amount
  | "PARTIAL_PLATFORM_UPHELD" // split; correction ≤ challenged amount
  | "DISMISSED_INSUFFICIENT_EVIDENCE"; // no correction

export const DECISION_OUTCOMES: DecisionOutcome[] = [
  "RECIPIENT_UPHELD",
  "PLATFORM_UPHELD",
  "PARTIAL_PLATFORM_UPHELD",
  "DISMISSED_INSUFFICIENT_EVIDENCE",
];

/** Whether a decision outcome requires a correction. */
export function outcomeRequiresCorrection(o: DecisionOutcome): boolean {
  return o === "PLATFORM_UPHELD" || o === "PARTIAL_PLATFORM_UPHELD";
}

/* -------------------------------------------------------------------------- */
/* Correction states                                                           */
/* -------------------------------------------------------------------------- */

export type CorrectionState =
  | "DRAFT" // instruction created, not yet submitted
  | "AWAITING_SIGNATURE" // wallet-intent generated, awaiting Maya's passkey
  | "SUBMITTED" // submitted via Gas Station; userOpHash stored, not yet verified
  | "VERIFIED" // INT-02 verifier confirmed the correction transfer on Arc
  | "MISMATCH" // verification failed (wrong sender/amount/token/chain)
  | "FAILED" // submission failed (sponsorship denied, timeout, etc.)
  | "DECLINED"; // recipient explicitly declined

export const CORRECTION_STATES: CorrectionState[] = [
  "DRAFT",
  "AWAITING_SIGNATURE",
  "SUBMITTED",
  "VERIFIED",
  "MISMATCH",
  "FAILED",
  "DECLINED",
];

export type CorrectionEvent =
  | "wallet_intent_created"
  | "submitted"
  | "verified"
  | "mismatch"
  | "failed"
  | "declined";

export const CORRECTION_EDGES: Array<{ from: CorrectionState; event: CorrectionEvent; to: CorrectionState }> = [
  { from: "DRAFT", event: "wallet_intent_created", to: "AWAITING_SIGNATURE" },
  { from: "AWAITING_SIGNATURE", event: "submitted", to: "SUBMITTED" },
  { from: "AWAITING_SIGNATURE", event: "declined", to: "DECLINED" },
  { from: "AWAITING_SIGNATURE", event: "failed", to: "FAILED" },
  { from: "SUBMITTED", event: "verified", to: "VERIFIED" },
  { from: "SUBMITTED", event: "mismatch", to: "MISMATCH" },
  { from: "SUBMITTED", event: "failed", to: "FAILED" },
];

/* -------------------------------------------------------------------------- */
/* Transition engine                                                           */
/* -------------------------------------------------------------------------- */

/** Typed error for an illegal transition (backend maps this to HTTP 409). */
export class IllegalTransitionError extends Error {
  constructor(
    public readonly entity: "payment" | "case" | "correction",
    public readonly from: string,
    public readonly event: string,
    message?: string,
  ) {
    super(message ?? `A ${entity} that is ${from} cannot process ${event}.`);
    this.name = "IllegalTransitionError";
  }
}

/** All legal events for a given entity + current state. */
export function legalPaymentEvents(from: PaymentState): PaymentEvent[] {
  return PAYMENT_EDGES.filter((e) => e.from === from).map((e) => e.event);
}

export function legalCaseEvents(from: CaseState): CaseEvent[] {
  return CASE_EDGES.filter((e) => e.from === from).map((e) => e.event);
}

export function legalCorrectionEvents(from: CorrectionState): CorrectionEvent[] {
  return CORRECTION_EDGES.filter((e) => e.from === from).map((e) => e.event);
}

/** Apply a payment event, throwing IllegalTransitionError on illegal pairs. */
export function applyPaymentEvent(from: PaymentState, event: PaymentEvent): PaymentState {
  const edge = PAYMENT_EDGES.find((e) => e.from === from && e.event === event);
  if (!edge) throw new IllegalTransitionError("payment", from, event);
  return edge.to;
}

/**
 * Apply a case event. Pass the current info-request count for the guard.
 * Throws IllegalTransitionError on illegal/guarded pairs.
 */
export function applyCaseEvent(from: CaseState, event: CaseEvent, infoRequestCount = 0): CaseState {
  const edge = CASE_EDGES.find((e) => e.from === from && e.event === event);
  if (!edge) throw new IllegalTransitionError("case", from, event);
  if (edge.guard === "infoRequestCount < 2" && infoRequestCount >= MAX_INFO_REQUESTS) {
    throw new IllegalTransitionError("case", from, event, `This case has already used its ${MAX_INFO_REQUESTS} information requests — it must now be decided.`);
  }
  return edge.to;
}

export function applyCorrectionEvent(from: CorrectionState, event: CorrectionEvent): CorrectionState {
  const edge = CORRECTION_EDGES.find((e) => e.from === from && e.event === event);
  if (!edge) throw new IllegalTransitionError("correction", from, event);
  return edge.to;
}
