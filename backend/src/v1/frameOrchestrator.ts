/* ============================================================================
   Frame orchestrator — the shared "run the agents for a case" entry point.

   Used by:
     - openCase()            → auto-trigger (fire-and-forget) on dispute open
     - POST /v1/cases/:id/frame → manual "Prepare frame" re-run

   Coordinates: getCaseDetail → buildFrameInput → assembleFrame, with per-stage
   status recorded to frameStatus so the case room can render an "agents running"
   indicator while the Bedrock calls are in flight (a few seconds).
   ========================================================================== */

import { assembleFrame, type FrameAssemblyResult } from "../agent/frame-assembly.ts";
import { getCaseDetail } from "./services.ts";
import { buildFrameInput, type FrameInputOverrides } from "./frameInput.ts";
import { markRunning, markStage, markDone, markFailed } from "./frameStatus.ts";
import { buildCaseContext } from "./caseContext.ts";
import { getSharedCase, type SharedCaseBody } from "../services.ts";
import { loadClauseParameters } from "../seed/policy-pack.ts";
import type { PayoutDoc, WorkOrderDoc } from "../models/index.ts";

/**
 * Run the full agent pipeline for a case and persist the resulting frame.
 * Records per-stage status so the UI can show progress. Never throws — on
 * failure, marks the run failed and returns a rung-2 (null) result.
 *
 * The structured case context (on-chain + off-chain sourced facts) is built
 * once and reused as the model's caseContext, so the Bedrock calls reason over
 * the full case reality and the chain is read at most once per run.
 */
export async function assembleForCase(
  caseId: string,
  overrides: FrameInputOverrides = {},
): Promise<FrameAssemblyResult> {
  markRunning(caseId);
  try {
    const detail = await getCaseDetail(caseId);
    // Build the sourced case context once; pass to the frame builder so the
    // chain reads happen here, not again inside buildFrameInput.
    const ctx = await buildCaseContext(detail).catch((e) => {
      console.warn(`[frame-orchestrator] case context build failed for ${caseId}, continuing with thin context:`, e instanceof Error ? e.message : e);
      return null;
    });
    const input = await buildFrameInput(detail, overrides, ctx);

    const result = await assembleFrame({
      ...input,
      onStage: (stage, status) => markStage(caseId, stage, status),
    });

    markDone(caseId);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[frame-orchestrator] failed for case ${caseId}:`, msg);
    markFailed(caseId, msg);
    // Match the rung-2 contract: no frame, never blocks the case.
    return { frame: null, frameId: null, degradeLevel: 2, narrative: null };
  }
}

/**
 * Run the agent pipeline for a case keyed by caseNumber — the identifier in the
 * URL and the one shared across the legacy + v1 layers. Builds the frame input
 * directly from the legacy shared case body (real payout, work order with
 * deliverables, evidence, responses), so it works for cases that exist ONLY in
 * the legacy layer (e.g. CASE-0143) with no v1 Case row. The frame is persisted
 * keyed on the caseNumber, so the GET /cases/:id handler finds it.
 */
export async function assembleForCaseByNumber(
  caseNumber: string,
): Promise<FrameAssemblyResult> {
  markRunning(caseNumber);
  try {
    const shared = await getSharedCase(caseNumber);
    const input = await buildFrameInputFromShared(caseNumber, shared);

    const result = await assembleFrame({
      ...input,
      onStage: (stage, status) => markStage(caseNumber, stage, status),
    });

    markDone(caseNumber);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[frame-orchestrator] failed for case ${caseNumber}:`, msg);
    markFailed(caseNumber, msg);
    return { frame: null, frameId: null, degradeLevel: 2, narrative: null };
  }
}

/**
 * Build the assembleFrame input from a legacy SharedCaseBody. Uses the REAL
 * deliverables from the work order (instead of the placeholder), the payout
 * amount/parties, the recipient's response, and a sourced caseContext summary
 * built from the same data. Degrades gracefully when the work order or payout
 * is missing — the checks return "missing" findings.
 */
async function buildFrameInputFromShared(caseNumber: string, shared: SharedCaseBody) {
  const payout = shared.payout as PayoutDoc | null;
  const workOrder = shared.workOrder as WorkOrderDoc | null;
  const caseDoc = shared.case as { allegationFreeText?: string; allegationClaimType?: string; allegationAmountContested?: string; openedAt?: string };
  const responses = shared.responses as { text?: string }[];
  const evidence = shared.evidence as { submittedBy?: string }[];

  const clauses = await loadClauseParameters();
  const amountContested = caseDoc?.allegationAmountContested ?? payout?.amount ?? "0";

  // Real deliverables from the work order; placeholder only if none.
  const deliverables =
    workOrder?.deliverables?.length
      ? workOrder.deliverables.map((d) => ({ name: d.name, due: d.due, acceptanceCriteria: d.acceptanceCriteria }))
      : [{ name: "Contested deliverable", due: caseDoc?.openedAt ?? new Date().toISOString(), acceptanceCriteria: "" }];

  const checkInput = {
    payment: {
      amountMicroUsdc: payout?.amount ?? amountContested,
      recipient: payout?.recipientWallet ?? "",
      payer: payout?.refundTo ?? "",
      paidAt: payout?.paidAt ?? caseDoc?.openedAt ?? new Date().toISOString(),
    },
    challengedAmountMicroUsdc: amountContested,
    claimType: (caseDoc?.allegationClaimType ?? "non_delivery") as "non_delivery",
    allegation: caseDoc?.allegationFreeText ?? "",
    disputeOpenedAt: caseDoc?.openedAt ?? new Date().toISOString(),
    deliverables,
    deliveryTimestamps: {},
    rejectionTimestamps: {},
    clauses,
  };

  const unresolvedInput = {
    hasResponse: responses.length > 0,
    evidenceBySide: {
      platform: evidence.filter((e) => e.submittedBy !== "recipient").length,
      recipient: evidence.filter((e) => e.submittedBy === "recipient").length,
    },
    contestedAmountMicroUsdc: amountContested,
    deliverableAmountsMicroUsdc: [],
    deliverablesWithoutCriteria: deliverables.filter((d) => !d.acceptanceCriteria).map((d) => d.name),
    findings: [],
  };

  // Sourced caseContext: a plain-language summary of the real facts on file.
  const deliverableLines = deliverables.map((d) => `- ${d.name}${d.due ? ` (due ${d.due})` : ""}${d.acceptanceCriteria ? `; acceptance: ${d.acceptanceCriteria}` : ""}`).join("\n");
  const responseLines = responses.map((r) => r.text).filter(Boolean).join("\n");
  const caseContext = [
    "CASE CONTEXT (each fact labelled with its source)",
    "",
    `Dispute: ${caseDoc?.allegationFreeText ?? "(no allegation text)"}`,
    `Claim type: ${caseDoc?.allegationClaimType ?? "non_delivery"}. Challenged amount: ${amountContested} micro-USDC.`,
    payout ? `Payment: ${payout.amount} USDC to ${payout.recipientWallet}, refundable to ${payout.refundTo}. Paid at ${payout.paidAt}. (source: payout record)` : "Payment: not on file.",
    workOrder ? `Work order: ${workOrder.description}. Amount ${workOrder.amount} USDC. (source: work order)` : "Work order: not on file.",
    "DELIVERABLES (source: " + (workOrder ? "work order" : "placeholder") + ")",
    deliverableLines,
    responseLines ? `RECIPIENT REPLY (source: response)\n${responseLines}` : "RECIPIENT REPLY: none on file.",
    evidence.length ? `EVIDENCE ON FILE: ${evidence.length} item(s).` : "EVIDENCE: none on file.",
  ].join("\n");

  return {
    caseId: caseNumber, // key on caseNumber so the GET handler finds the frame
    claimType: (caseDoc?.allegationClaimType ?? "non_delivery") as "non_delivery",
    caseContext,
    checkInput,
    unresolvedInput,
  };
}
