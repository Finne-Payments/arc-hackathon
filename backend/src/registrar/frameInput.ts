/* ============================================================================
   Frame-input builder — the single source of truth for translating a case
   record into the shape `assembleFrame` consumes.

   Extracted so that both the manual refresh route AND the auto-trigger on
   case-open share one builder. Degrades gracefully when payment/work-order
   data is incomplete — the checks return "missing" findings rather than throwing.

   The case context fed to the model is the structured, sourced summary from
   caseContext.ts (on-chain + off-chain facts), so the Bedrock turning-questions
   and narrative are grounded in the full case reality, not a thin DB slice.
   ========================================================================== */

import type { assembleFrame } from "../agent/frame-assembly.ts";
import { loadClauseParameters } from "../seed/policy-pack.ts";
import { buildCaseContext, contextToPromptText, type StructuredCaseContext } from "./caseContext.ts";

/** The detail payload from getCaseDetail(). */
type CaseDetail = Awaited<ReturnType<typeof import("./services.ts").getCaseDetail>>;

/** Optional request-body overrides (deliverables, timestamps, context). */
export interface FrameInputOverrides {
  deliverables?: Array<{ name: string; due: string; acceptanceCriteria: string }>;
  deliveryTimestamps?: Record<string, string | null>;
  rejectionTimestamps?: Record<string, string | null>;
  /** Written-acceptance timestamps per deliverable — drives the order-of-
   * performance check (payment must follow acceptance). Optional. */
  acceptanceTimestamps?: Record<string, string | null>;
  deliverableAmountsMicroUsdc?: string[];
  caseContext?: string;
}

/**
 * Build the assembleFrame input from a case detail payload. When a pre-built
 * StructuredCaseContext is passed (from getCaseDetail), it is reused so the
 * chain is read once per request, not twice.
 */
export async function buildFrameInput(
  detail: CaseDetail,
  overrides: FrameInputOverrides = {},
  prebuiltContext?: StructuredCaseContext | null,
) {
  const c = detail.case;

  // Build (or reuse) the structured case context — the sourced facts the model
  // and the checks reason over.
  const ctx = prebuiltContext ?? (await buildCaseContext(detail));

  const clauses = await loadClauseParameters();

  // Deliverables: request override > work-order (from context) > placeholder.
  const deliverables =
    overrides.deliverables ??
    (ctx.deliverables.length > 0 && ctx.deliverables[0].source === "work_order"
      ? ctx.deliverables.map((d) => ({
          name: d.name,
          due: d.due ?? c.openedAt,
          acceptanceCriteria: d.acceptanceCriteria ?? "",
        }))
      : [{ name: "Contested deliverable", due: c.openedAt, acceptanceCriteria: "" }]);

  const checkInput = {
    payment: {
      amountMicroUsdc: detail.payment?.amountMicroUsdc ?? c.challengedAmountMicroUsdc,
      recipient: detail.payment?.recipient ?? "",
      payer: detail.payment?.payer ?? "",
      paidAt: detail.payment?.paidAt ?? c.openedAt,
    },
    challengedAmountMicroUsdc: c.challengedAmountMicroUsdc,
    claimType: c.claimType ?? "non_delivery",
    allegation: c.allegation ?? "",
    disputeOpenedAt: c.openedAt,
    deliverables,
    deliveryTimestamps: overrides.deliveryTimestamps ?? {},
    rejectionTimestamps: overrides.rejectionTimestamps ?? {},
    acceptanceTimestamps: overrides.acceptanceTimestamps,
    clauses,
  };

  const unresolvedInput = {
    hasResponse: !!detail.response,
    evidenceBySide: {
      customer: detail.evidence.filter((e) => e.submittedBy !== "merchant").length,
      merchant: detail.evidence.filter((e) => e.submittedBy === "merchant").length,
    },
    contestedAmountMicroUsdc: c.challengedAmountMicroUsdc,
    deliverableAmountsMicroUsdc: overrides.deliverableAmountsMicroUsdc ?? [],
    deliverablesWithoutCriteria: deliverables.filter((d) => !d.acceptanceCriteria).map((d) => d.name),
    // Filled by assembly after checks run; unresolved recomputes from its own inputs.
    findings: [],
  };

  // caseContext: the rich, sourced summary (on-chain + off-chain) when no
  // explicit override is provided. This is what grounds the Bedrock calls.
  const caseContext = overrides.caseContext ?? contextToPromptText(ctx);

  return {
    caseId: c.caseId,
    claimType: (c.claimType ?? "non_delivery") as Parameters<typeof assembleFrame>[0]["claimType"],
    caseContext,
    checkInput,
    unresolvedInput,
  };
}
