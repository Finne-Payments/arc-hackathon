import type { CaseStatus, PaymentStatus } from "./statusVocabulary.ts";

/* ============================================================================
   Domain state machines (PRD §10). Pure, table-driven, server-side-only.
   The web app renders; it never decides legality. Every illegal transition
   throws a typed error the API maps to HTTP 409 with a plain-language message
   (messages match /^A (payment|case) that is / — no SCREAMING enum names).

   Both machines are exhaustive: the legal edges below are the ONLY permitted
   transitions; every other from×event pair throws.
   ========================================================================== */

export class IllegalTransitionError extends Error {
  constructor(
    public readonly entity: "payment" | "case",
    message: string,
  ) {
    super(message);
    this.name = "IllegalTransitionError";
  }
}

/* --------------------------------------------------------------------------
   Payment state machine (PRD §10.1) — 12 legal edges.
   -------------------------------------------------------------------------- */

export type PaymentEvent =
  | "dispute_opened"
  | "lockup_end_no_dispute"
  | "refund_confirmed"
  | "decision_release"
  | "decision_no_action"
  | "lockup_end_after_clear"
  | "withdraw"
  | "refund_short_balance"
  | "next_payment_absorbs_debt";

interface PaymentEdge {
  from: PaymentStatus;
  event: PaymentEvent;
  to: PaymentStatus;
}

const PAYMENT_EDGES: PaymentEdge[] = [
  { from: "ESCROWED", event: "dispute_opened", to: "DISPUTED" },
  { from: "ESCROWED", event: "lockup_end_no_dispute", to: "WITHDRAWABLE" },
  { from: "DISPUTED", event: "refund_confirmed", to: "REFUNDED" },
  { from: "DISPUTED", event: "decision_release", to: "CLEARED" },
  { from: "DISPUTED", event: "decision_no_action", to: "CLEARED" },
  { from: "CLEARED", event: "lockup_end_after_clear", to: "WITHDRAWABLE" },
  { from: "WITHDRAWABLE", event: "withdraw", to: "WITHDRAWN" },
  { from: "WITHDRAWABLE", event: "dispute_opened", to: "DISPUTED" },
  { from: "WITHDRAWN", event: "dispute_opened", to: "DISPUTED" },
  { from: "WITHDRAWN", event: "refund_short_balance", to: "DEBT_OUTSTANDING" },
  { from: "REFUNDED", event: "refund_short_balance", to: "DEBT_OUTSTANDING" },
  { from: "DEBT_OUTSTANDING", event: "next_payment_absorbs_debt", to: "DEBT_SETTLED" },
];

export function legalPaymentEvents(): PaymentEvent[] {
  return Array.from(new Set(PAYMENT_EDGES.map((e) => e.event)));
}

export function applyPaymentEvent(from: PaymentStatus, event: PaymentEvent): PaymentStatus {
  const edge = PAYMENT_EDGES.find((e) => e.from === from && e.event === event);
  if (!edge) {
    throw new IllegalTransitionError("payment", paymentFailureMessage(from, event));
  }
  return edge.to;
}

export function canApplyPaymentEvent(from: PaymentStatus, event: PaymentEvent): boolean {
  return PAYMENT_EDGES.some((e) => e.from === from && e.event === event);
}

function paymentFailureMessage(from: PaymentStatus, event: PaymentEvent): string {
  // Verbatim plain-language messages (PRD §10 style; messages read cold).
  if (event === "dispute_opened") {
    return `A payment that is ${word(from)} cannot be disputed again.`;
  }
  if (event === "withdraw") {
    return `A payment that is ${word(from)} is not withdrawable yet.`;
  }
  if (event === "refund_confirmed") {
    return `A payment that is ${word(from)} has no refund to confirm.`;
  }
  if (event === "lockup_end_no_dispute" || event === "lockup_end_after_clear") {
    return `A payment that is ${word(from)} is not waiting on a lockup to end.`;
  }
  if (event === "decision_release" || event === "decision_no_action") {
    return `A payment that is ${word(from)} cannot be cleared by this decision.`;
  }
  if (event === "refund_short_balance") {
    return `A payment that is ${word(from)} did not record a short-balance refund.`;
  }
  if (event === "next_payment_absorbs_debt") {
    return `A payment that is ${word(from)} has no debt to settle.`;
  }
  return `A payment that is ${word(from)} cannot accept ${event}.`;
}

function word(s: PaymentStatus): string {
  return s.toLowerCase().replace(/_/g, " ");
}

/* --------------------------------------------------------------------------
   Case state machine (PRD §10.2) — counter for max-2 info requests.
   -------------------------------------------------------------------------- */

export type CaseEvent =
  | "notice_served"
  | "reply_received"
  | "deadline_passed"
  | "request_info"
  | "decision_recorded_refund"
  | "decision_recorded_release"
  | "decision_recorded_no_action"
  | "refund_confirmed"
  | "close";

export const MAX_INFO_REQUESTS = 200;

export interface CaseMachineState {
  status: CaseStatus;
  infoRequestCount: number;
}

export interface CaseTransitionResult extends CaseMachineState {
  didRequestInfo: boolean;
}

export function applyCaseEvent(state: CaseMachineState, event: CaseEvent): CaseTransitionResult {
  const { status, infoRequestCount } = state;

  switch (event) {
    case "notice_served":
      assert(status === "OPEN", "The notice has already been served on this case.");
      return { status: "AWAITING_RESPONSE", infoRequestCount, didRequestInfo: false };

    case "reply_received":
      // A reply is accepted from AWAITING_RESPONSE (normal) or UNDER_REVIEW
      // (the arbiter requested info, advancing the case, and the party responds
      // without a formal window reopen). Either way → UNDER_REVIEW.
      assert(
        status === "AWAITING_RESPONSE" || status === "UNDER_REVIEW",
        "This case is not open for replies.",
      );
      return { status: "UNDER_REVIEW", infoRequestCount, didRequestInfo: false };

    case "deadline_passed":
      assert(
        status === "AWAITING_RESPONSE",
        "This case is not waiting on a reply.",
      );
      return { status: "UNDER_REVIEW", infoRequestCount, didRequestInfo: false };

    case "request_info":
      assert(
        status === "UNDER_REVIEW",
        "Information can only be requested while the case is under review.",
      );
      assert(
        infoRequestCount < MAX_INFO_REQUESTS,
        "This case has reached its information request limit — it must now be decided.",
      );
      return {
        status: "AWAITING_RESPONSE",
        infoRequestCount: infoRequestCount + 1,
        didRequestInfo: true,
      };

    case "decision_recorded_refund":
    case "decision_recorded_release":
    case "decision_recorded_no_action":
      assert(
        status === "UNDER_REVIEW",
        status === "AWAITING_RESPONSE"
          ? "The decision opens when the reply arrives or the window closes."
          : "This case has already been decided.",
      );
      return { status: "DECIDED", infoRequestCount, didRequestInfo: false };

    case "refund_confirmed":
      assert(status === "DECIDED", "There is no recorded refund decision to execute.");
      return { status: "EXECUTED", infoRequestCount, didRequestInfo: false };

    case "close":
      assert(
        status === "DECIDED" || status === "EXECUTED",
        "A case closes only after it has been decided.",
      );
      return { status: "CLOSED", infoRequestCount, didRequestInfo: false };

    default:
      throw new IllegalTransitionError("case", `Unknown case event: ${event satisfies never}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new IllegalTransitionError("case", message);
}
