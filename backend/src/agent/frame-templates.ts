/* ============================================================================
   FIN-121 — outcome-requirement templates.

   The frame's "outcome requirements" are template-authored, NOT model-
   generated. This is the load-bearing safety property (Addendum §E.1): because
   no model wrote these lines, it is safe for them to NAME outcomes. The model
   only phrases turning questions; outcome requirements come from authored
   templates filled from findings by code.

   Each template is parameterised by clause refs and findings. The demo set
   covers the non-delivery claim type across the four Screen-4 outcomes. Adding
   a claim type = adding templates here, reviewed by a person (P10).
   ========================================================================== */

import type { DecisionOutcome } from "@finne/domain";
import { DECISION_OUTCOMES } from "@finne/domain";
import type { CheckResult } from "../proof/checks.ts";

export interface FilledRequirement {
  outcome: DecisionOutcome;
  templateId: string;
  filledParams: Record<string, string>;
  provenance: "template";
}

/**
 * A template body — a function of the findings. Pure. The body names what would
 * have to be true for this outcome, citing clauses + failed/passed checks.
 * Verdict-free by construction: it states conditions, never that they hold.
 */
type TemplateBody = (findings: CheckResult[]) => { text: string; params: Record<string, string> };

const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  RECIPIENT_UPHELD: "Recipient upheld (no correction)",
  PLATFORM_UPHELD: "Platform upheld (full correction)",
  PARTIAL_PLATFORM_UPHELD: "Platform partially upheld (partial correction)",
  DISMISSED_INSUFFICIENT_EVIDENCE: "Dismissed — insufficient evidence",
};

/** Find the first failed check citing a given clause, if any. */
function failedCheckForClause(findings: CheckResult[], clause: number): CheckResult | undefined {
  return findings.find((f) => f.clauseRef === clause && f.result === "fail");
}

/** Non-delivery claim-type templates (the demo scenario). */
const NON_DELIVERY_TEMPLATES: Partial<Record<DecisionOutcome, { id: string; body: TemplateBody }>> = {
  RECIPIENT_UPHELD: {
    id: "non_delivery.recipient_upheld",
    body: (f) => {
      // Recipient upheld = contested work was properly delivered / accepted.
      const grace = f.find((x) => x.checkId.startsWith("grace_window:") && x.result === "pass");
      const acceptance = failedCheckForClause(f, 7);
      return {
        text: `Upholding the recipient requires the contested deliverable to have been delivered within the clause-4 grace window AND not yet deemed accepted under clause 7 at the time of dispute.`,
        params: {
          graceFinding: grace?.checkId ?? "none-passed",
          acceptanceFinding: acceptance?.checkId ?? "none-failed",
        },
      };
    },
  },
  PLATFORM_UPHELD: {
    id: "non_delivery.platform_upheld",
    body: (f) => {
      // Platform upheld = delivery failed or was outside acceptance window for the full amount.
      const noDelivery = f.find((x) => x.checkId.startsWith("delivery_recorded:") && x.result === "missing");
      const graceFail = f.find((x) => x.checkId.startsWith("grace_window:") && x.result === "fail");
      return {
        text: `Upholding the platform for the full contested amount requires the deliverable to be undelivered, or delivered outside the clause-4 grace window with a written rejection, AND disputed before clause-7 deemed acceptance where clause 9 applies.`,
        params: {
          deliveryMissing: noDelivery?.checkId ?? "none",
          graceFailed: graceFail?.checkId ?? "none",
        },
      };
    },
  },
  PARTIAL_PLATFORM_UPHELD: {
    id: "non_delivery.partial_platform_upheld",
    body: () => ({
      text: `A partial correction applies where some but not all contested deliverables fail their clause-4 or clause-7 checks, and the contested amount matches only those deliverables.`,
      params: { rationale: "subset-of-deliverables-failed" },
    }),
  },
  DISMISSED_INSUFFICIENT_EVIDENCE: {
    id: "non_delivery.dismissed",
    body: (f) => ({
      text: `Dismissing for insufficient evidence requires delivery status to be unresolved — no delivery timestamp, and no clause-4 or clause-7 finding can be computed for the contested deliverable.`,
      params: {
        missingCount: String(f.filter((x) => x.result === "missing").length),
      },
    }),
  },
};

const TEMPLATES_BY_CLAIM_TYPE: Record<string, Partial<Record<DecisionOutcome, { id: string; body: TemplateBody }>>> = {
  non_delivery: NON_DELIVERY_TEMPLATES,
};

/**
 * Fill the four outcome-requirement lines for a case. Pure, no model. Falls
 * back to a generic template per outcome if the claim type has no specific one.
 */
export function fillOutcomeRequirements(
  claimType: string,
  findings: CheckResult[],
): FilledRequirement[] {
  const set = TEMPLATES_BY_CLAIM_TYPE[claimType] ?? {};
  return DECISION_OUTCOMES.map((outcome) => {
    const tmpl = set[outcome];
    let text: string;
    let params: Record<string, string>;
    if (tmpl) {
      const filled = tmpl.body(findings);
      text = filled.text;
      params = filled.params;
    } else {
      text = `For "${OUTCOME_LABEL[outcome]}": the record must support this outcome under the cited clauses and findings. (No claim-type-specific template; reviewer applies the standard directly.)`;
      params = { fallback: "true" };
    }
    return {
      outcome,
      templateId: tmpl?.id ?? "generic.fallback",
      filledParams: { text, ...params },
      provenance: "template" as const,
    };
  });
}
