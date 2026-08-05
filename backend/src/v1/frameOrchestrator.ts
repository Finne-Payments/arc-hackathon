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
  const caseDoc = shared.case as {
    allegationFreeText?: string;
    allegationClaimType?: string;
    allegationAmountContested?: string;
    openedAt?: string;
    infoRequests?: { target?: string; text?: string; requestedAt?: string; answeredAt?: string | null }[];
  };
  const responses = shared.responses as { author?: string; authorName?: string; text?: string; submittedAt?: string }[];
  const evidence = shared.evidence as {
    _id?: string;
    caseRef?: string | null;
    submittedBy?: string;
    title?: string;
    source?: string;
    filename?: string;
    linkUrl?: string;
    mimeType?: string;
  }[];

  const clauses = await loadClauseParameters();
  const amountContested = caseDoc?.allegationAmountContested ?? payout?.amount ?? "0";

  // Real deliverables from the work order; placeholder only if none.
  const deliverables =
    workOrder?.deliverables?.length
      ? workOrder.deliverables.map((d) => ({ name: d.name, due: d.due, acceptanceCriteria: d.acceptanceCriteria }))
      : [{ name: "Contested deliverable", due: caseDoc?.openedAt ?? new Date().toISOString(), acceptanceCriteria: "" }];

  // --- Document summaries: look up agent annotations for this case's evidence +
  // the work order's contract documents. These let the model reason over the
  // actual contract / PDF content rather than just an evidence count. ---
  let evidenceAnnotationMap = new Map<string, string>();
  let contractAnnotationMap = new Map<string, string>();
  try {
    const { EvidenceAnnotation } = await import("../models/index.ts");
    const evAnns = await EvidenceAnnotation.find({
      ownerRef: { $regex: `^case:${caseNumber}:` },
    }).lean();
    for (const a of evAnns) evidenceAnnotationMap.set(a.evidenceId, (a as { summary?: string }).summary ?? "");
    if (workOrder?.paymentId) {
      const docAnns = await EvidenceAnnotation.find({
        ownerRef: { $regex: `^workorder:${workOrder.paymentId}:` },
      }).lean();
      for (const a of docAnns) contractAnnotationMap.set(a.evidenceId, (a as { summary?: string }).summary ?? "");
    }
  } catch {
    /* annotations unavailable — fall through to the count-only view */
  }

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

  // --- Conversation transcript (responses + the arbiter's info requests).
  // Merge both into a single time-ordered, author-attributed thread so the
  // model reasons over who said what (and what the arbiter asked), instead of
  // the old behaviour which flattened everything into an author-less
  // "RECIPIENT REPLY" blob and dropped info requests entirely.
  type Turn = { t: number; label: string; text: string };
  const turns: Turn[] = [];
  for (const r of responses) {
    if (!r.text?.trim()) continue;
    const who = r.author === "recipient" ? "Customer" : r.author === "platform" ? "Merchant" : (r.authorName ?? "Party");
    turns.push({ t: Date.parse(r.submittedAt ?? "") || 0, label: who, text: r.text.trim() });
  }
  for (const ir of caseDoc?.infoRequests ?? []) {
    if (!ir.text?.trim()) continue;
    const to = ir.target === "recipient" ? "Customer" : "Merchant";
    turns.push({ t: Date.parse(ir.requestedAt ?? "") || 0, label: `Arbiter → ${to}`, text: ir.text.trim() });
  }
  turns.sort((a, b) => a.t - b.t);
  const conversationBlock = turns.length
    ? turns.map((x) => `- [${x.label}] ${x.text}`).join("\n")
    : "(no messages on file — the response window may still be open)";

  // Per-evidence summaries (or the title/type when no annotation exists yet).
  const evidenceLines = evidence.map((e) => {
    const id = e._id ?? "";
    const summary = evidenceAnnotationMap.get(String(id));
    const side = e.submittedBy === "recipient" ? "customer" : "merchant";
    if (summary) return `- "${e.title ?? "(untitled)"}" (submitted by ${side}; source: agent summary of ${e.source ?? "evidence"}):\n  ${summary}`;
    if (e.source === "link" && e.linkUrl) return `- "${e.title}" — video link: ${e.linkUrl} (submitted by ${side}; source: evidence)`;
    if (e.source === "upload") return `- "${e.title}" (${e.filename ?? "file"}, ${e.mimeType ?? "?"}; submitted by ${side}; source: evidence — document on file, summary pending)`;
    return `- "${e.title ?? "(untitled)"}" (submitted by ${side}; source: evidence)`;
  });

  // Work-order contract documents + their summaries.
  const contractDocs = workOrder?.documents ?? [];
  const contractLines = contractDocs.map((d) => {
    const summary = contractAnnotationMap.get(d.documentId);
    if (summary) return `- "${d.filename}" (${d.mimeType}; source: agent summary of payment contract):\n  ${summary}`;
    return `- "${d.filename}" (${d.mimeType}, ${d.sizeBytes} bytes; source: payment contract — document on file, summary pending)`;
  });

  const caseContext = [
    "CASE CONTEXT (each fact labelled with its source)",
    "",
    `Dispute: ${caseDoc?.allegationFreeText ?? "(no allegation text)"}`,
    `Claim type: ${caseDoc?.allegationClaimType ?? "non_delivery"}. Challenged amount: ${amountContested} micro-USDC.`,
    payout ? `Payment: ${payout.amount} USDC to ${payout.recipientWallet}, refundable to ${payout.refundTo}. Paid at ${payout.paidAt}. (source: payout record)` : "Payment: not on file.",
    workOrder ? `Work order: ${workOrder.description}. Amount ${workOrder.amount} USDC. (source: work order)` : "Work order: not on file.",
    "DELIVERABLES (source: " + (workOrder ? "work order" : "placeholder") + ")",
    deliverableLines,
    `CONVERSATION (source: responses + arbiter info requests; ${turns.length} message(s))`,
    conversationBlock,
    contractDocs.length > 0 ? `PAYMENT CONTRACTS / DOCUMENTS (${contractDocs.length} on file)\n${contractLines.join("\n")}` : "PAYMENT CONTRACTS: none on file.",
    evidence.length > 0 ? `EVIDENCE ON FILE (${evidence.length} item(s))\n${evidenceLines.join("\n")}` : "EVIDENCE: none on file.",
  ].join("\n");

  return {
    caseId: caseNumber, // key on caseNumber so the GET handler finds the frame
    claimType: (caseDoc?.allegationClaimType ?? "non_delivery") as "non_delivery",
    caseContext,
    checkInput,
    unresolvedInput,
  };
}
