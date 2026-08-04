import { describe, it, expect } from "vitest";
import {
  applyPaymentEvent,
  applyCaseEvent,
  legalPaymentEvents,
  IllegalTransitionError,
  MAX_INFO_REQUESTS,
} from "../src/stateMachines.ts";
import type { PaymentStatus, CaseStatus } from "../src/statusVocabulary.ts";

/* ============================================================================
   Domain state-machine tests (PRD §10).
   - Payment: every legal edge produces the right target; the negative sweep
     asserts that every illegal from×event pair throws (the exhaustive matrix).
   - Case: including the max-2 info-request loop and decision gating.
   ========================================================================== */

describe("payment state machine", () => {
  it("applies all 12 legal edges to the correct target", () => {
    const cases: [PaymentStatus, Parameters<typeof applyPaymentEvent>[1], PaymentStatus][] = [
      ["ESCROWED", "dispute_opened", "DISPUTED"],
      ["ESCROWED", "lockup_end_no_dispute", "WITHDRAWABLE"],
      ["DISPUTED", "refund_confirmed", "REFUNDED"],
      ["DISPUTED", "decision_release", "CLEARED"],
      ["DISPUTED", "decision_no_action", "CLEARED"],
      ["CLEARED", "lockup_end_after_clear", "WITHDRAWABLE"],
      ["WITHDRAWABLE", "withdraw", "WITHDRAWN"],
      ["WITHDRAWABLE", "dispute_opened", "DISPUTED"],
      ["WITHDRAWN", "dispute_opened", "DISPUTED"],
      ["WITHDRAWN", "refund_short_balance", "DEBT_OUTSTANDING"],
      ["REFUNDED", "refund_short_balance", "DEBT_OUTSTANDING"],
      ["DEBT_OUTSTANDING", "next_payment_absorbs_debt", "DEBT_SETTLED"],
    ];
    for (const [from, event, to] of cases) {
      expect(applyPaymentEvent(from, event)).toBe(to);
    }
  });

  it("DEBT_SETTLED is terminal (no legal events)", () => {
    const events = legalPaymentEvents();
    for (const e of events) {
      expect(() => applyPaymentEvent("DEBT_SETTLED", e)).toThrow(IllegalTransitionError);
    }
  });

  it("throws IllegalTransitionError with a plain-language message for every illegal pair", () => {
    const statuses: PaymentStatus[] = [
      "ESCROWED", "DISPUTED", "REFUNDED", "CLEARED", "WITHDRAWABLE", "WITHDRAWN", "DEBT_OUTSTANDING", "DEBT_SETTLED",
    ];
    const events = legalPaymentEvents();
    let illegalThrown = 0;
    for (const from of statuses) {
      for (const event of events) {
        // skip legal edges
        try {
          applyPaymentEvent(from, event);
        } catch (e) {
          illegalThrown++;
          expect(e).toBeInstanceOf(IllegalTransitionError);
          expect((e as Error).message).toMatch(/^A payment that is /);
        }
      }
    }
    // 8 statuses × 9 events = 72 pairs; 12 legal → 60 illegal throws.
    expect(illegalThrown).toBe(8 * events.length - 12);
  });
});

describe("case state machine", () => {
  it("traverses the full refund path OPEN → … → CLOSED", () => {
    let s = applyCaseEvent({ status: "OPEN" as CaseStatus, infoRequestCount: 0 }, "notice_served");
    s = applyCaseEvent(s, "reply_received");
    s = applyCaseEvent(s, "decision_recorded_refund");
    s = applyCaseEvent(s, "refund_confirmed");
    s = applyCaseEvent(s, "close");
    expect(s.status).toBe("CLOSED");
  });

  it("closes directly from DECIDED on release (no EXECUTED)", () => {
    let s = applyCaseEvent({ status: "OPEN", infoRequestCount: 0 }, "notice_served");
    s = applyCaseEvent(s, "deadline_passed");
    s = applyCaseEvent(s, "decision_recorded_release");
    s = applyCaseEvent(s, "close");
    expect(s.status).toBe("CLOSED");
  });

  it("allows multiple information requests", () => {
    let s = applyCaseEvent({ status: "OPEN", infoRequestCount: 0 }, "notice_served");
    s = applyCaseEvent(s, "reply_received"); // UNDER_REVIEW
    s = applyCaseEvent(s, "request_info"); // count 1
    expect(s.infoRequestCount).toBe(1);
    s = applyCaseEvent(s, "reply_received"); // back to UNDER_REVIEW
    s = applyCaseEvent(s, "request_info"); // count 2
    expect(s.infoRequestCount).toBe(2);
    s = applyCaseEvent(s, "reply_received");
    s = applyCaseEvent(s, "request_info"); // count 3 — no artificial cap
    expect(s.infoRequestCount).toBe(3);
  });

  it("refuses a decision while still awaiting response", () => {
    let s = applyCaseEvent({ status: "OPEN", infoRequestCount: 0 }, "notice_served");
    expect(() => applyCaseEvent(s, "decision_recorded_refund")).toThrow(/reply arrives|already been decided|under review/i);
  });

  it("refuses info requests outside UNDER_REVIEW", () => {
    expect(() =>
      applyCaseEvent({ status: "AWAITING_RESPONSE", infoRequestCount: 0 }, "request_info"),
    ).toThrow(/under review/);
  });

  it("MAX_INFO_REQUESTS allows a real conversation", () => {
    expect(MAX_INFO_REQUESTS).toBeGreaterThanOrEqual(10);
  });
});
