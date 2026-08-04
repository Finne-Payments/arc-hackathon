/* ============================================================================
   FIN-122 — unresolved-items computation.

   Pure functions over the record. No model. The frame's third part lists the
   gaps the reviewer must be aware of: an unanswered reply, uncountered
   evidence, a contested amount that doesn't match a tranche, absent acceptance
   criteria, a missing written rejection where clause 4 is live.
   ========================================================================== */

import type { CheckResult } from "../proof/checks.ts";

export interface UnresolvedItem {
  kind:
    | "unanswered_reply"
    | "uncountered_evidence"
    | "contested_amount_mismatch"
    | "absent_acceptance_criteria"
    | "missing_written_rejection";
  refs: string[];
  provenance: "computed";
}

export interface UnresolvedInput {
  /** Whether the recipient has responded to the dispute. */
  hasResponse: boolean;
  /** Evidence submitted by each side. Counted per side. */
  evidenceBySide: { platform: number; recipient: number };
  /** The contested amount (micro-USDC) vs the deliverable amounts. */
  contestedAmountMicroUsdc: string;
  deliverableAmountsMicroUsdc: string[];
  /** Deliverables missing acceptance criteria. */
  deliverablesWithoutCriteria: string[];
  /** Findings — to detect a missing written rejection where clause 4 is live. */
  findings: CheckResult[];
}

/**
 * Compute the unresolved items. Pure — same input, same output. The demo case
 * yields the three agreed items per FIN-122 acceptance criteria.
 */
export function computeUnresolved(input: UnresolvedInput): UnresolvedItem[] {
  const items: UnresolvedItem[] = [];

  if (!input.hasResponse) {
    items.push({
      kind: "unanswered_reply",
      refs: ["response"],
      provenance: "computed",
    });
  }

  // Uncountered evidence: one side submitted evidence the other did not address.
  const { platform, recipient } = input.evidenceBySide;
  if (platform > 0 && recipient === 0) {
    items.push({
      kind: "uncountered_evidence",
      refs: [`platform:${platform}`, `recipient:${recipient}`],
      provenance: "computed",
    });
  } else if (recipient > 0 && platform === 0) {
    items.push({
      kind: "uncountered_evidence",
      refs: [`platform:${platform}`, `recipient:${recipient}`],
      provenance: "computed",
    });
  }

  // Contested amount not matching a deliverable tranche.
  const contested = BigInt(input.contestedAmountMicroUsdc);
  const matchesTranche = input.deliverableAmountsMicroUsdc.some(
    (amt) => BigInt(amt) === contested,
  );
  if (!matchesTranche && input.deliverableAmountsMicroUsdc.length > 0) {
    items.push({
      kind: "contested_amount_mismatch",
      refs: [`contested:${contested}`, `tranches:${input.deliverableAmountsMicroUsdc.join(",")}`],
      provenance: "computed",
    });
  }

  // Absent acceptance criteria on any deliverable.
  if (input.deliverablesWithoutCriteria.length > 0) {
    items.push({
      kind: "absent_acceptance_criteria",
      refs: input.deliverablesWithoutCriteria,
      provenance: "computed",
    });
  }

  // Missing written rejection where clause 4 is live: a grace-window check
  // passed, meaning the deliverable was late-but-inside-window, but no rejection
  // was recorded. The reviewer should know a rejection could have changed it.
  const gracePassedNoRejection = input.findings.filter(
    (f) => f.checkId.startsWith("grace_window:") && f.result === "pass",
  );
  if (gracePassedNoRejection.length > 0) {
    items.push({
      kind: "missing_written_rejection",
      refs: gracePassedNoRejection.map((f) => f.checkId),
      provenance: "computed",
    });
  }

  return items;
}
