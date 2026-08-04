/* ============================================================================
   @finne/domain tests — covers state machines (FND-03), USDC helpers, IDs,
   RBAC matrix, and schema validation (including verdict-guard).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  // roles
  type Role, can, RBAC_MATRIX,
  // states
  type PaymentState, type CaseState, type PaymentEvent, type CaseEvent, type CorrectionState,
  applyPaymentEvent, applyCaseEvent, applyCorrectionEvent,
  legalPaymentEvents, legalCaseEvents,
  PAYMENT_EDGES, CASE_EDGES,
  PAYMENT_STATES, CASE_STATES, CORRECTION_STATES,
  TERMINAL_CASE_STATES,
  IllegalTransitionError,
  // ids
  generateId, isOpaqueId, caseDisplayNumber,
  // usdc
  toMicroUsdc, fromMicroUsdc, isChallengeWithinBounds, subUsdc,
  // schemas
  microUsdcSchema, validateNoVerdictKeys,
  reasonSchema,
} from "../src/index.ts";

/* -------------------------------------------------------------------------- */
/* State machines                                                              */
/* -------------------------------------------------------------------------- */

describe("payment state machine", () => {
  it("follows the happy path OBSERVED → UNDISPUTED", () => {
    let s: PaymentState = "OBSERVED";
    s = applyPaymentEvent(s, "verified");
    expect(s).toBe("VERIFIED");
    s = applyPaymentEvent(s, "proof_drafted");
    expect(s).toBe("PROOF_DRAFT");
    s = applyPaymentEvent(s, "anchored");
    expect(s).toBe("ANCHORED");
    s = applyPaymentEvent(s, "dispute_opened");
    expect(s).toBe("DISPUTED");
    s = applyPaymentEvent(s, "dispute_closed");
    expect(s).toBe("UNDISPUTED");
  });

  it("rejects illegal transitions", () => {
    expect(() => applyPaymentEvent("OBSERVED", "anchored")).toThrow(IllegalTransitionError);
    expect(() => applyPaymentEvent("ANCHORED", "verified")).toThrow(IllegalTransitionError);
    expect(() => applyPaymentEvent("UNDISPUTED", "dispute_opened")).toThrow(IllegalTransitionError);
  });

  it("reports legal events per state", () => {
    expect(legalPaymentEvents("OBSERVED").sort()).toEqual(["rejected", "verified"].sort());
    expect(legalPaymentEvents("VERIFIED")).toEqual(["proof_drafted", "reverified"]);
    expect(legalPaymentEvents("UNDISPUTED")).toEqual([]);
  });

  it("has exactly 7 payment states and no escrow/debt/withdrawal state", () => {
    expect(PAYMENT_STATES).toHaveLength(7);
    const allStates = PAYMENT_STATES.join(",");
    expect(allStates).not.toMatch(/ESCROW|DEBT|WITHDRAW|REFUND/);
  });
});

describe("case state machine", () => {
  it("follows the correction path to CLOSED_CORRECTED", () => {
    let s: CaseState = "OPEN";
    s = applyCaseEvent(s, "response_received");
    expect(s).toBe("RESPONDED");
    s = applyCaseEvent(s, "moved_to_review");
    expect(s).toBe("UNDER_REVIEW");
    s = applyCaseEvent(s, "decision_recorded");
    expect(s).toBe("DECIDED");
    s = applyCaseEvent(s, "correction_instructed");
    expect(s).toBe("CORRECTION_OUTSTANDING");
    s = applyCaseEvent(s, "correction_verified");
    expect(s).toBe("CLOSED_CORRECTED");
  });

  it("follows the no-correction path to CLOSED_NO_CORRECTION", () => {
    let s: CaseState = "OPEN";
    s = applyCaseEvent(s, "deadline_passed");
    expect(s).toBe("UNDER_REVIEW");
    s = applyCaseEvent(s, "decision_recorded");
    expect(s).toBe("DECIDED");
    s = applyCaseEvent(s, "closed_no_correction");
    expect(s).toBe("CLOSED_NO_CORRECTION");
  });

  it("enforces max-2 info requests", () => {
    let s: CaseState = "OPEN";
    s = applyCaseEvent(s, "deadline_passed"); // → UNDER_REVIEW
    s = applyCaseEvent(s, "info_requested", 0); // → EVIDENCE_REQUESTED, count now 1
    expect(s).toBe("EVIDENCE_REQUESTED");
    s = applyCaseEvent(s, "info_answered", 1); // → UNDER_REVIEW
    expect(s).toBe("UNDER_REVIEW");
    s = applyCaseEvent(s, "info_requested", 1); // → EVIDENCE_REQUESTED, count now 2
    expect(s).toBe("EVIDENCE_REQUESTED");
    s = applyCaseEvent(s, "info_answered", 2);
    expect(s).toBe("UNDER_REVIEW");
    // third request should fail
    expect(() => applyCaseEvent(s, "info_requested", 2)).toThrow(IllegalTransitionError);
  });

  it("does not allow decision before response or deadline", () => {
    expect(() => applyCaseEvent("OPEN", "decision_recorded")).toThrow(IllegalTransitionError);
  });

  it("terminal states have no outgoing transitions", () => {
    for (const terminal of TERMINAL_CASE_STATES) {
      expect(legalCaseEvents(terminal)).toEqual([]);
    }
  });

  it("has 8 case states with no EXECUTED/REFUNDED", () => {
    expect(CASE_STATES).toHaveLength(8);
    expect(CASE_STATES.join(",")).not.toMatch(/EXECUTED|REFUND/);
  });
});

describe("correction state machine", () => {
  it("follows the verified path", () => {
    let s: CorrectionState = "DRAFT";
    s = applyCorrectionEvent(s, "wallet_intent_created");
    expect(s).toBe("AWAITING_SIGNATURE");
    s = applyCorrectionEvent(s, "submitted");
    expect(s).toBe("SUBMITTED");
    s = applyCorrectionEvent(s, "verified");
    expect(s).toBe("VERIFIED");
  });

  it("supports decline", () => {
    let s: CorrectionState = "AWAITING_SIGNATURE";
    s = applyCorrectionEvent(s, "declined");
    expect(s).toBe("DECLINED");
  });

  it("has 7 correction states", () => {
    expect(CORRECTION_STATES).toHaveLength(7);
  });
});

/* -------------------------------------------------------------------------- */
/* RBAC                                                                        */
/* -------------------------------------------------------------------------- */

describe("RBAC matrix", () => {
  it("reviewer cannot respond to a case", () => {
    expect(can("reviewer", "case:respond")).toBe(false);
  });

  it("agent cannot decide, respond, or add evidence", () => {
    expect(can("agent", "case:decide")).toBe(false);
    expect(can("agent", "case:respond")).toBe(false);
    expect(can("agent", "case:add-evidence")).toBe(false);
  });

  it("operations cannot decide or respond", () => {
    expect(can("operations", "case:decide")).toBe(false);
    expect(can("operations", "case:respond")).toBe(false);
  });

  it("recipient cannot open a case or run analysis", () => {
    expect(can("recipient", "case:open")).toBe(false);
    expect(can("recipient", "analysis:run")).toBe(false);
  });

  it("only reviewer can decide", () => {
    const roles: Role[] = ["operations", "recipient", "agent", "system"];
    for (const r of roles) {
      expect(can(r, "case:decide")).toBe(false);
    }
    expect(can("reviewer", "case:decide")).toBe(true);
  });

  it("every role has at least one permission", () => {
    for (const role of Object.keys(RBAC_MATRIX) as Role[]) {
      expect(RBAC_MATRIX[role].length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* USDC helpers                                                                */
/* -------------------------------------------------------------------------- */

describe("micro-USDC helpers", () => {
  it("parses whole numbers", () => {
    expect(toMicroUsdc("300")).toBe(300000000n);
    expect(toMicroUsdc("100")).toBe(100000000n);
  });

  it("parses decimals", () => {
    expect(toMicroUsdc("100.5")).toBe(100500000n);
    expect(toMicroUsdc("33.34")).toBe(33_340000n);
  });

  it("rejects negative, too-many-decimals, and non-numeric", () => {
    expect(() => toMicroUsdc("-100")).toThrow();
    expect(() => toMicroUsdc("100.1234567")).toThrow();
    expect(() => toMicroUsdc("abc")).toThrow();
    expect(() => toMicroUsdc("")).toThrow();
  });

  it("formats back to display strings", () => {
    expect(fromMicroUsdc(300000000n)).toBe("300.00");
    expect(fromMicroUsdc(100500000n)).toBe("100.50");
  });

  it("checks challenge bounds", () => {
    expect(isChallengeWithinBounds(100000000n, 300000000n)).toBe(true); // 100 ≤ 300
    expect(isChallengeWithinBounds(0n, 300000000n)).toBe(false); // 0
    expect(isChallengeWithinBounds(300000001n, 300000000n)).toBe(false); // > total
  });

  it("subtracts without underflow", () => {
    expect(subUsdc(300000000n, 100000000n)).toBe(200000000n);
    expect(() => subUsdc(100000000n, 200000000n)).toThrow();
  });

  it("microUsdcSchema validates digit strings", () => {
    expect(microUsdcSchema.safeParse("300000000").success).toBe(true);
    expect(microUsdcSchema.safeParse("300.5").success).toBe(false);
    expect(microUsdcSchema.safeParse("").success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* IDs                                                                         */
/* -------------------------------------------------------------------------- */

describe("opaque IDs", () => {
  it("generates prefixed IDs", () => {
    const id = generateId("case");
    expect(id).toMatch(/^case_[a-z0-9]+_[a-z0-9]+$/);
    expect(isOpaqueId(id, "case")).toBe(true);
  });

  it("caseDisplayNumber pads to 4 digits", () => {
    expect(caseDisplayNumber(142)).toBe("CASE-0142");
    expect(caseDisplayNumber(1)).toBe("CASE-0001");
  });
});

/* -------------------------------------------------------------------------- */
/* Verdict guard (AGENT-01)                                                    */
/* -------------------------------------------------------------------------- */

describe("verdict guard", () => {
  it("rejects verdict-shaped keys at root", () => {
    expect(() => validateNoVerdictKeys({ verdict: "platform wins" })).toThrow(/Forbidden verdict-shaped key/);
    expect(() => validateNoVerdictKeys({ recommendedOutcome: "refund" })).toThrow(/Forbidden/);
  });

  it("rejects verdict-shaped keys at depth", () => {
    expect(() =>
      validateNoVerdictKeys({ nested: { deep: { liability: "recipient" } } }),
    ).toThrow(/Forbidden verdict-shaped key "liability"/);
  });

  it("rejects verdict directives in string values", () => {
    expect(() =>
      validateNoVerdictKeys({ statement: "I find in favor of the platform" }),
    ).toThrow(/Forbidden verdict language/);
  });

  it("accepts clean fact packs", () => {
    expect(() =>
      validateNoVerdictKeys({ verifiedFacts: [{ statement: "Payment verified", citations: [] }] }),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Schema validation                                                           */
/* -------------------------------------------------------------------------- */

describe("reason schema", () => {
  it("requires 20+ chars", () => {
    expect(reasonSchema.safeParse("too short").success).toBe(false);
    expect(reasonSchema.safeParse("this reason is long enough to pass").success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Exhaustive illegal-pair coverage                                           */
/* -------------------------------------------------------------------------- */

describe("exhaustive illegal transition coverage", () => {
  it("every payment state×event not in EDGES throws", () => {
    const events: PaymentEvent[] = ["verified", "rejected", "proof_drafted", "anchored", "dispute_opened", "dispute_closed", "reverified"];
    let illegalCount = 0;
    for (const state of PAYMENT_STATES) {
      for (const event of events) {
        const isLegal = PAYMENT_EDGES.some((e) => e.from === state && e.event === event);
        if (!isLegal) {
          expect(() => applyPaymentEvent(state, event)).toThrow(IllegalTransitionError);
          illegalCount++;
        }
      }
    }
    expect(illegalCount).toBeGreaterThan(0); // sanity: there ARE illegal pairs
  });

  it("every case state×event not in EDGES throws", () => {
    const events: CaseEvent[] = [
      "response_received", "moved_to_review", "info_requested", "info_answered",
      "deadline_passed", "decision_recorded", "correction_instructed",
      "correction_verified", "closed_no_correction", "recipient_declined_correction",
    ];
    for (const state of CASE_STATES) {
      for (const event of events) {
        const isLegal = CASE_EDGES.some((e) => e.from === state && e.event === event);
        if (!isLegal) {
          expect(() => applyCaseEvent(state, event, 0)).toThrow(IllegalTransitionError);
        }
      }
    }
  });
});
