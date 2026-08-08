/* ============================================================================
   Case-context builder — assembles a structured, verdict-free summary of a
   case from every source the agent layer is allowed to read, so the model and
   the arbiter reason over the FULL case reality (on-chain + off-chain), not a
   thin DB slice.

   Sources (each degrades to null/empty on absence or RPC failure — the never-
   crash posture the frame assembly depends on, P8):
     1. Off-chain DB     — case, payment, response, evidence, clauses
     2. Off-chain DB     — WorkOrder (real deliverables/acceptance/due dates)
     3. On-chain (live)  — readPayment() + readChainFigures() via existing helpers
     4. Chain events     — recent ChainEvent rows (PaymentCreated/Refund/Withdrawal)

   Guardrails (P6–P10): facts only, no verdict/recommendation fields; every fact
   carries its source (P7 stamped-or-silent); never holds keys (FIN-132). The
   serializer `toPromptText()` produces a plain-language block the model consumes
   alongside the existing frame prompts.
   ========================================================================== */

import type { Address } from "viem";
import { WorkOrder, Payout, ChainEvent } from "../models/index.ts";
import { readPayment, readChainFigures } from "../chain/reads.ts";
import { arbiterAddress } from "../chain/client.ts";
import { fromBaseUnitsDisplay } from "../usdc.ts";

/** The detail payload from getCaseDetail(). */
type CaseDetail = Awaited<ReturnType<typeof import("./services.ts").getCaseDetail>>;

export interface ContextDeliverable {
  name: string;
  due: string | null;
  acceptanceCriteria: string | null;
  source: "work_order" | "placeholder";
}

export interface ContextEvidenceItem {
  evidenceId: string;
  title: string;
  submittedBy: string;
  sha256: string;
  mimeType: string;
  source: "evidence";
}

export interface ContextChainEvent {
  eventName: string;
  txHash: string;
  block: number | null;
  seenAt: string;
  source: "chain_event";
}

/** Live on-chain payment state (null when unreachable). */
export interface ContextPaymentOnChain {
  to: string;
  amountDisplay: string; // human-readable USDC
  releaseTimestamp: string; // ISO from the bigint epoch
  refundTo: string;
  withdrawnAmountDisplay: string;
  refunded: boolean;
  source: "on_chain";
}

export interface ContextChainFigures {
  arbiterReserve: string;
  recipientDebt: string;
  source: "on_chain";
}

/** The structured, verdict-free case context. Every field null-tolerant. */
export interface StructuredCaseContext {
  /** The dispute, in plain terms. */
  allegation: string;
  claimType: string;
  challengedAmountMicroUsdc: string;
  disputeOpenedAt: string;
  /** The off-chain payment record (DB). */
  paymentAmountMicroUsdc: string;
  payer: string;
  recipient: string;
  paidAt: string;
  paymentTxHash: string;
  /** The recipient's reply, if any. */
  response: { text: string; submittedAt: string } | null;
  /** Real deliverables from the work order (or a placeholder marker). */
  deliverables: ContextDeliverable[];
  /** Evidence on file. */
  evidence: ContextEvidenceItem[];
  /** Policy clauses in force. */
  clauses: { clauseNumber: number; text: string; parameters: Record<string, number> }[];
  /** Live on-chain payment state (null if no chain link / RPC down). */
  paymentOnChain: ContextPaymentOnChain | null;
  /** Arbiter reserve + recipient debt (null if unreadable). */
  chainFigures: ContextChainFigures | null;
  /** Recent decoded chain events for this payment's chronology. */
  chainEvents: ContextChainEvent[];
  /** True when any on-chain read was attempted but unavailable. */
  onChainUnavailable: boolean;
}

/**
 * Build the structured case context. Pure data assembly — no model calls, never
 * throws. Missing data becomes null/empty rather than a guess.
 */
export async function buildCaseContext(detail: CaseDetail): Promise<StructuredCaseContext> {
  const c = detail.case;
  const payment = detail.payment;

  // --- 2. Off-chain legacy: WorkOrder (real deliverables) ---
  let deliverables: ContextDeliverable[] = [];
  try {
    const workOrder = await WorkOrder.findOne({ paymentId: c.paymentId }).lean();
    if (workOrder && workOrder.deliverables?.length) {
      deliverables = workOrder.deliverables.map((d) => ({
        name: d.name,
        due: d.due || null,
        acceptanceCriteria: d.acceptanceCriteria || null,
        source: "work_order" as const,
      }));
    }
  } catch {
    /* no work order — fall through to placeholder */
  }
  if (deliverables.length === 0) {
    deliverables = [{ name: "Contested deliverable", due: null, acceptanceCriteria: null, source: "placeholder" }];
  }

  // --- Evidence + clauses (already in detail) ---
  const evidence: ContextEvidenceItem[] = (detail.evidence ?? []).map((e) => ({
    evidenceId: e.evidenceId,
    title: e.title ?? "(untitled)",
    submittedBy: e.submittedBy ?? "unknown",
    sha256: e.sha256 ?? "",
    mimeType: e.mimeType ?? "",
    source: "evidence" as const,
  }));

  const clauses = (detail.clauses ?? []).map((cl) => ({
    clauseNumber: cl.clauseNumber,
    text: cl.text,
    parameters: (cl.parameters ?? {}) as Record<string, number>,
  }));

  // --- 3 + 4. On-chain: resolve the numeric payment id, then live reads ---
  let paymentOnChain: ContextPaymentOnChain | null = null;
  let chainFigures: ContextChainFigures | null = null;
  let chainEvents: ContextChainEvent[] = [];
  let onChainUnavailable = false;

  const recipient = (payment?.recipient ?? "") as Address | "";
  const txHash = payment?.txHash ?? "";

  // The on-chain numeric payment id lives on the legacy Payout (set by the
  // indexer from the PaymentCreated event). Resolve via txHash.
  let onChainPaymentId: bigint | null = null;
  if (txHash) {
    try {
      const payout = await Payout.findOne({ txHash }).lean();
      if (payout?.paymentId && /^\d+$/.test(payout.paymentId)) {
        onChainPaymentId = BigInt(payout.paymentId);
      }
    } catch {
      /* no payout row — on-chain read skipped */
    }
  }

  if (onChainPaymentId) {
    const [onChain, figures] = await Promise.all([
      readPayment(onChainPaymentId),
      readChainFigures(arbiterAddress(), (recipient || null) as Address | null),
    ]);
    if (onChain) {
      paymentOnChain = {
        to: onChain.to,
        amountDisplay: fromBaseUnitsDisplay(onChain.amount),
        releaseTimestamp: new Date(Number(onChain.releaseTimestamp) * 1000).toISOString(),
        refundTo: onChain.refundTo,
        withdrawnAmountDisplay: fromBaseUnitsDisplay(onChain.withdrawnAmount),
        refunded: onChain.refunded,
        source: "on_chain",
      };
    } else {
      onChainUnavailable = true; // id resolved but read failed (RPC down / not deployed)
    }
    if (figures) {
      chainFigures = { ...figures, source: "on_chain" };
    }
  } else if (txHash) {
    // A tx hash exists but no numeric id could be resolved — flag so the UI can
    // show "on-chain state not indexed yet" rather than a silent gap.
    onChainUnavailable = true;
  }

  // Recent chain events for chronology (by txHash match — the indexer keys on it).
  if (txHash) {
    try {
      const events = await ChainEvent.find({ txHash }).sort({ block: 1 }).limit(20).lean();
      chainEvents = events.map((e) => ({
        eventName: e.eventName,
        txHash: e.txHash,
        block: e.block ?? null,
        seenAt: e.seenAt,
        source: "chain_event" as const,
      }));
    } catch {
      /* chainevents collection absent in some test setups — skip */
    }
  }

  return {
    allegation: c.allegation ?? "",
    claimType: c.claimType ?? "non_delivery",
    challengedAmountMicroUsdc: c.challengedAmountMicroUsdc,
    disputeOpenedAt: c.openedAt,
    paymentAmountMicroUsdc: payment?.amountMicroUsdc ?? c.challengedAmountMicroUsdc,
    payer: payment?.payer ?? "",
    recipient: recipient ?? "",
    paidAt: payment?.paidAt ?? c.openedAt,
    paymentTxHash: txHash,
    response: detail.response
      ? { text: detail.response.text, submittedAt: detail.response.submittedAt }
      : null,
    deliverables,
    evidence,
    clauses,
    paymentOnChain,
    chainFigures,
    chainEvents,
    onChainUnavailable,
  };
}

/**
 * Serialize the context to a plain-language block for the model. Every fact is
 * labelled with its source (P7 stamped-or-silent). Verdict-free by construction
 * — describes what's on file, never what should happen.
 */
export function contextToPromptText(ctx: StructuredCaseContext): string {
  const lines: string[] = [];

  lines.push("CASE CONTEXT (each fact is labelled with its source)");
  lines.push("");
  lines.push(`Dispute: ${ctx.allegation || "(no allegation text)"}`);
  lines.push(`Claim type: ${ctx.claimType}. Challenged amount: ${ctx.challengedAmountMicroUsdc} micro-USDC.`);
  lines.push(`Dispute opened at: ${ctx.disputeOpenedAt}`);

  lines.push("");
  lines.push("PAYMENT (off-chain record)");
  lines.push(`Amount: ${ctx.paymentAmountMicroUsdc} micro-USDC. Payer: ${ctx.payer || "unknown"}. Recipient: ${ctx.recipient || "unknown"}.`);
  lines.push(`Paid at: ${ctx.paidAt}. Funding tx: ${ctx.paymentTxHash || "not recorded"}`);

  if (ctx.paymentOnChain) {
    lines.push("");
    lines.push("PAYMENT STATE (on-chain read)");
    lines.push(`Recipient: ${ctx.paymentOnChain.to}. Amount: ${ctx.paymentOnChain.amountDisplay} USDC.`);
    lines.push(`Withdrawn so far: ${ctx.paymentOnChain.withdrawnAmountDisplay} USDC. Refunded: ${ctx.paymentOnChain.refunded ? "yes" : "no"}.`);
    lines.push(`Funds release at: ${ctx.paymentOnChain.releaseTimestamp}. Refund address: ${ctx.paymentOnChain.refundTo}`);
  } else if (ctx.onChainUnavailable) {
    lines.push("");
    lines.push("PAYMENT STATE (on-chain): not available — the on-chain payment could not be read (RPC unreachable or payment not indexed).");
  }

  if (ctx.chainFigures) {
    lines.push("");
    lines.push("CHAIN FIGURES (on-chain read)");
    lines.push(`Arbiter reserve: ${ctx.chainFigures.arbiterReserve} USDC. Recipient debt: ${ctx.chainFigures.recipientDebt} USDC.`);
  }

  lines.push("");
  lines.push("DELIVERABLES (source: " + (ctx.deliverables[0]?.source ?? "none") + ")");
  for (const d of ctx.deliverables) {
    lines.push(`- ${d.name}${d.due ? ` (due ${d.due})` : ""}${d.acceptanceCriteria ? `; acceptance: ${d.acceptanceCriteria}` : ""}`);
  }

  if (ctx.response) {
    lines.push("");
    lines.push("RECIPIENT REPLY (off-chain record)");
    lines.push(`Submitted at ${ctx.response.submittedAt}: ${ctx.response.text}`);
  } else {
    lines.push("");
    lines.push("RECIPIENT REPLY: none on file (the response window may still be open).");
  }

  if (ctx.evidence.length > 0) {
    lines.push("");
    lines.push("EVIDENCE ON FILE (off-chain record)");
    for (const e of ctx.evidence) {
      lines.push(`- ${e.title} (submitted by ${e.submittedBy}; sha256 ${e.sha256.slice(0, 16) || "none"}; ${e.mimeType})`);
    }
  }

  if (ctx.clauses.length > 0) {
    lines.push("");
    lines.push("POLICY CLAUSES IN FORCE");
    for (const cl of ctx.clauses) {
      lines.push(`- Clause ${cl.clauseNumber}: ${cl.text}`);
    }
  }

  if (ctx.chainEvents.length > 0) {
    lines.push("");
    lines.push("RECENT CHAIN EVENTS (chronology)");
    for (const e of ctx.chainEvents) {
      lines.push(`- ${e.eventName} at block ${e.block ?? "?"} (tx ${e.txHash.slice(0, 18)}…)`);
    }
  }

  return lines.join("\n");
}
