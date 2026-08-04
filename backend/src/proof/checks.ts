/* ============================================================================
   Deterministic checks engine (PRD Addendum A §F.3 / FIN-113, FIN-114).

   The PRD references "the existing seven checks" — those do not exist as
   runnable code. This module is the harness: a registry of pure functions that
   take the case record and return findings. Checks 8 (grace window) and 9
   (acceptance status) are fully implemented per the Addendum; a small set of
   demo-needed checks (amount match, etc.) gives the decision frame real
   findings to phrase turning questions from.

   Every check is a PURE function over its input — same input, same output,
   re-runnable by anyone. That is what makes findings auditable (P7): a finding
   cites the check that produced it, and the check can be re-run.
   ========================================================================== */

/** A single finding — matches the legacy brief shape (findings.ts). */
export interface CheckResult {
  check: string; // human label, e.g. "Grace window (clause 4)"
  expected: string; // what the clause/record requires
  found: string; // what the record shows
  result: "pass" | "fail" | "missing";
  clauseRef?: number; // clause number cited (links to the policy pack)
  checkId: string; // stable id for frame question findingRefs
}

/** Everything a deterministic check can read. Pure input — no side effects. */
export interface CheckInput {
  /** The payment the dispute is about. */
  payment: {
    amountMicroUsdc: string;
    recipient: string;
    payer: string;
    paidAt: string; // ISO
  };
  /** The contested amount alleged in the dispute (micro-USDC). */
  challengedAmountMicroUsdc: string;
  claimType: string;
  allegation: string;
  /** When the dispute was opened (ISO). Drives acceptance-status (clause 7). */
  disputeOpenedAt: string;
  /** The work order's deliverables — the things that were owed. */
  deliverables: Array<{
    name: string;
    due: string; // ISO date the deliverable was due
    acceptanceCriteria: string;
  }>;
  /**
   * Delivery evidence: for each deliverable, the earliest timestamp a delivery
   * message/artefact was recorded (ISO), or null if none. Mapped by name.
   * This is what check 8 measures submission-vs-due against.
   */
  deliveryTimestamps: Record<string, string | null>;
  /**
   * Written-rejection evidence: for each deliverable, the timestamp of a
   * written rejection from the platform (ISO), or null. Clause 4 requires the
   * platform reject in writing within the grace window, else deemed on time.
   */
  rejectionTimestamps: Record<string, string | null>;
  /** Clause parameters from the seeded policy pack. */
  clauses: {
    graceWindowHours: number; // clause 4
    acceptancePeriodDays: number; // clause 7
  };
}

type Check = (input: CheckInput) => CheckResult[];

/** The registry — deterministic, no model. New checks are added here. */
const REGISTRY: Check[] = [];

export function registerCheck(fn: Check): void {
  REGISTRY.push(fn);
}

/** Run every registered check against a case record. Pure — safe to re-run. */
export function runChecks(input: CheckInput): CheckResult[] {
  return REGISTRY.flatMap((fn) => {
    try {
      return fn(input);
    } catch (e) {
      // A check throwing is a "missing" finding, not a crash. The loop never
      // depends on any single check (P8 spirit applied to determinism too).
      return [{
        check: fn.name || "unknown",
        expected: "check to complete",
        found: e instanceof Error ? e.message : String(e),
        result: "missing" as const,
        checkId: fn.name || "unknown",
      }];
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Demo-needed checks — give the frame real findings                          */
/* -------------------------------------------------------------------------- */

/** Check that the challenged amount does not exceed the payment amount. */
registerCheck(function amountNotExceedsPayment(input: CheckInput): CheckResult[] {
  const paid = BigInt(input.payment.amountMicroUsdc);
  const challenged = BigInt(input.challengedAmountMicroUsdc);
  const ok = challenged <= paid;
  return [{
    check: "Contested amount within payment",
    expected: `contested ≤ paid (${paid} micro-USDC)`,
    found: `contested = ${challenged} micro-USDC`,
    result: ok ? "pass" : "fail",
    checkId: "amount_within_payment",
  }];
});

/** Check that each deliverable has a recorded delivery timestamp. */
registerCheck(function deliverablesHaveDelivery(input: CheckInput): CheckResult[] {
  return input.deliverables.map((d) => {
    const ts = input.deliveryTimestamps[d.name];
    return {
      check: `Delivery recorded: ${d.name}`,
      expected: "a delivery timestamp on record",
      found: ts ? `delivered ${ts}` : "no delivery timestamp recorded",
      result: ts ? "pass" : "missing",
      checkId: `delivery_recorded:${d.name}`,
    } satisfies CheckResult;
  });
});

/* -------------------------------------------------------------------------- */
/* Check 8 — grace window (FIN-113, clause 4)                                 */
/* -------------------------------------------------------------------------- */

/**
 * A deliverable submitted within 48h (clause 4) after its due date is treated
 * as on time, UNLESS the platform rejected it in writing within that window.
 * Pure function over timestamps + clause parameters.
 *
 * Result is per-deliverable, with dates and the clause cited. The demo
 * scenario resolves as "one day late but inside clause 4" (pass).
 */
registerCheck(function graceWindow(input: CheckInput): CheckResult[] {
  const graceMs = input.clauses.graceWindowHours * 3600_000;
  return input.deliverables.map((d) => {
    const submitted = input.deliveryTimestamps[d.name];
    if (!submitted) {
      return {
        check: `Grace window (clause 4): ${d.name}`,
        expected: `delivery within ${input.clauses.graceWindowHours}h of due, or platform rejects in writing`,
        found: "no delivery timestamp — cannot assess",
        result: "missing",
        clauseRef: 4,
        checkId: `grace_window:${d.name}`,
      } satisfies CheckResult;
    }
    const dueMs = new Date(d.due).getTime();
    const submittedMs = new Date(submitted).getTime();
    const lateMs = submittedMs - dueMs;
    const insideWindow = lateMs <= graceMs;

    // Even if inside the window, a written rejection inside the window fails it.
    const rejection = input.rejectionTimestamps[d.name];
    if (rejection) {
      const rejMs = new Date(rejection).getTime();
      const rejectionInsideWindow = rejMs >= dueMs && rejMs <= dueMs + graceMs;
      if (rejectionInsideWindow) {
        return {
          check: `Grace window (clause 4): ${d.name}`,
          expected: `delivery within ${input.clauses.graceWindowHours}h, not rejected in writing`,
          found: `delivered ${submitted}, but rejected in writing ${rejection} (inside window)`,
          result: "fail",
          clauseRef: 4,
          checkId: `grace_window:${d.name}`,
        } satisfies CheckResult;
      }
    }

    const lateHours = lateMs > 0 ? Math.round(lateMs / 3600_000) : 0;
    return {
      check: `Grace window (clause 4): ${d.name}`,
      expected: `delivery within ${input.clauses.graceWindowHours}h of due (${d.due}), no written rejection`,
      found: insideWindow
        ? `delivered ${submitted} (${lateHours}h late, inside window)`
        : `delivered ${submitted} (${lateHours}h late, outside window)`,
      result: insideWindow ? "pass" : "fail",
      clauseRef: 4,
      checkId: `grace_window:${d.name}`,
    } satisfies CheckResult;
  });
});

/* -------------------------------------------------------------------------- */
/* Check 9 — acceptance status (FIN-114, clause 7)                            */
/* -------------------------------------------------------------------------- */

/**
 * A deliverable not disputed within 14 days (clause 7) of submission is deemed
 * accepted; accepted work is payable. Outputs the deemed-accepted date, the
 * dispute date, and pass|fail with the clause cited.
 *
 * Demo scenario: deemed accepted 16 June (submission 2 June + 14 days), dispute
 * 20 June → fail for the platform (disputed after acceptance).
 */
registerCheck(function acceptanceStatus(input: CheckInput): CheckResult[] {
  const periodMs = input.clauses.acceptancePeriodDays * 86_400_000;
  return input.deliverables.map((d) => {
    const submitted = input.deliveryTimestamps[d.name];
    if (!submitted) {
      return {
        check: `Acceptance status (clause 7): ${d.name}`,
        expected: `dispute within ${input.clauses.acceptancePeriodDays} days of submission`,
        found: "no submission timestamp — cannot compute deemed acceptance",
        result: "missing",
        clauseRef: 7,
        checkId: `acceptance_status:${d.name}`,
      } satisfies CheckResult;
    }
    const submittedMs = new Date(submitted).getTime();
    const deemedAccepted = new Date(submittedMs + periodMs).toISOString();
    const disputeMs = new Date(input.disputeOpenedAt).getTime();
    const disputedBeforeAcceptance = disputeMs <= submittedMs + periodMs;
    return {
      check: `Acceptance status (clause 7): ${d.name}`,
      expected: `dispute before deemed acceptance (${deemedAccepted})`,
      found: `deemed accepted ${deemedAccepted.slice(0, 10)}, dispute ${input.disputeOpenedAt.slice(0, 10)}`,
      result: disputedBeforeAcceptance ? "pass" : "fail",
      clauseRef: 7,
      checkId: `acceptance_status:${d.name}`,
    } satisfies CheckResult;
  });
});
