import type {
  CaseRow,
  ConfigBody,
  EvidenceRow,
  PayoutRow,
  SharedCase,
  StatusBody,
  WorkOrderRow,
} from "./api";
import type { CaseStage, LedgerState, Role } from "./types";

/* ============================================================================
   Mappers — translate API responses into the shapes the screens render.
   This keeps the screens unchanged: they keep importing from data.ts types,
   but the *content* now comes from the live backend. Status words + dots are
   derived here so the UI stays in sync with the server's state machines.
   ========================================================================== */

const PAYMENT_DOT: Record<string, "warn" | "brand" | "ok" | "risk" | "ink"> = {
  ESCROWED: "brand",
  DISPUTED: "warn",
  REFUNDED: "risk",
  CLEARED: "ok",
  WITHDRAWABLE: "ok",
  WITHDRAWN: "ink",
  DEBT_OUTSTANDING: "risk",
  DEBT_SETTLED: "ok",
};

const PAYMENT_WORD: Record<string, string> = {
  ESCROWED: "Protected",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  CLEARED: "Cleared",
  WITHDRAWABLE: "Ready to withdraw",
  WITHDRAWN: "Withdrawn",
  DEBT_OUTSTANDING: "Debt outstanding",
  DEBT_SETTLED: "Debt settled",
};

/** Map a backend case status to the frontend's CaseStage union (demo control). */
export function caseStatusToStage(status: string): CaseStage {
  switch (status) {
    case "AWAITING_RESPONSE":
      return "awaiting_response";
    case "UNDER_REVIEW":
      return "under_review";
    case "CLOSED":
    case "EXECUTED":
      return "decided";
    default:
      return "under_review";
  }
}

export interface LedgerView {
  recipient: string;
  amount: string;
  purpose: string;
  paid: string;
  status: { label: string; dot: "warn" | "brand" | "ok" | "risk" };
  deadline: string;
  paymentId: string;
}

const RECIPIENT_LABEL: Record<string, string> = {
  maya: "Maya Reyes",
  jonah: "Jonah Park",
  priya: "Priya Nair",
  tomas: "Tomás Rivera",
  alex: "Alex Chen",
};

export function payoutToLedgerView(p: PayoutRow, workOrderDesc: string | null): LedgerView {
  const disputed = p.status === "DISPUTED";
  return {
    recipient: RECIPIENT_LABEL[p.recipientKey] ?? p.recipientKey,
    amount: `${p.amount} USDC`,
    purpose: workOrderDesc ?? "—",
    paid: formatPaidDate(p.paidAt),
    status: { label: PAYMENT_WORD[p.status] ?? p.status, dot: (PAYMENT_DOT[p.status] ?? "brand") as "warn" | "brand" | "ok" | "risk" },
    deadline: disputed
      ? ""
      : p.status === "ESCROWED"
        ? `Unlocks ${formatShortDate(p.lockupEnd)}`
        : "—",
    paymentId: p.paymentId,
  };
}

export interface CaseListView {
  caseId: string;
  parties: string;
  contested: string;
  status: { label: string; dot: "warn" | "brand" | "ok" | "risk" };
  deadline: string;
  paymentId: string;
}

export function caseToListView(c: CaseRow, payout: PayoutRow | undefined): CaseListView {
  const stage = caseStatusToStage(c.status);
  const dot: "warn" | "brand" | "ok" | "risk" =
    stage === "decided" ? "risk" : stage === "more_info" ? "brand" : "warn";
  const label =
    c.status === "CLOSED" || c.status === "EXECUTED"
      ? "Refunded"
      : c.infoRequestCount > 0 && stage !== "decided"
        ? "More information requested"
        : "Under review";
  const merchant = payout ? platformName(payout.platformKey) : "Northbeam Studios";
  const customer = payout ? RECIPIENT_LABEL[payout.recipientKey] ?? "Maya Reyes" : "Maya Reyes";
  return {
    caseId: c.caseNumber,
    parties: `${merchant} ↔ ${customer}`,
    contested: `${c.allegationAmountContested || "33"} USDC`,
    status: { label, dot },
    deadline: c.status === "CLOSED" ? "Closed" : "",
    paymentId: c.payoutRef,
  };
}

export interface EvidenceView {
  name: string;
  side: "Merchant" | "Customer" | "Agent";
  date: string;
  fp: string;
  kind: "doc" | "video";
  agent?: boolean;
  showOnlyAfterReply?: boolean;
}

const SIDE_LABEL: Record<string, "Merchant" | "Customer" | "Agent"> = {
  platform: "Merchant",
  recipient: "Customer",
  agent: "Agent",
};

export function evidenceToView(e: EvidenceRow): EvidenceView {
  return {
    name: e.title,
    side: SIDE_LABEL[e.submittedBy] ?? "Merchant",
    date: formatShortDate(e.submittedAt),
    fp: e.sha256 ? `${e.sha256.slice(0, 4)}…${e.sha256.slice(-4)}` : "—",
    kind: (e.kind as "doc" | "video") ?? "doc",
    agent: e.submittedBy === "agent",
    showOnlyAfterReply: e.showOnlyAfterReply,
  };
}

export function platformName(key: string): string {
  switch (key) {
    case "northbeam":
      return "Northbeam Studios";
    case "halcyon":
      return "Halcyon Press";
    case "copperline":
      return "Copperline Audio";
    default:
      return key;
  }
}

/** Derive the demo ledgerState from the live /status response. */
export function statusToLedgerState(status: StatusBody | null): LedgerState {
  if (!status) return "loading";
  if (status.indexer.stale) return "chain_stale";
  return "normal";
}

/** Derive a short wallet/tx label from a full hex string. */
export function shortHex(full: string | null | undefined): string {
  if (!full) return "—";
  if (full.length <= 12) return full;
  return `${full.slice(0, 6)}…${full.slice(-4)}`;
}

function formatPaidDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  } catch {
    return "—";
  }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  } catch {
    return "—";
  }
}

/** The demo world's headline stats, computed from the payout list. */
export function ledgerStats(payouts: PayoutRow[]) {
  const escrowed = payouts.filter((p) => p.status === "ESCROWED" || p.status === "DISPUTED");
  const escrowTotal = escrowed.reduce((s, p) => s + Number(p.amount || 0), 0);
  const disputed = payouts.filter((p) => p.status === "DISPUTED").length;
  const resolved = payouts.filter((p) => p.status === "REFUNDED" || p.status === "CLEARED" || p.status === "WITHDRAWN").length;
  const refunded = payouts.filter((p) => p.status === "REFUNDED" || p.status === "DEBT_OUTSTANDING").length;
  const cleared = payouts.filter((p) => p.status === "CLEARED" || p.status === "WITHDRAWN").length;
  return {
    protectedCount: escrowed.length,
    escrowTotal: `${escrowTotal} USDC in escrow`,
    openDisputes: disputed,
    resolved,
    resolvedSub: `${refunded} refunded · ${cleared} cleared`,
  };
}

/** The platform view's marketplace stats (demo uses seeded volume). */
export function platformStats(payouts: PayoutRow[]) {
  const volume = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const escrowed = payouts.filter((p) => p.status === "ESCROWED" || p.status === "DISPUTED");
  const escrowTotal = escrowed.reduce((s, p) => s + Number(p.amount || 0), 0);
  const disputed = payouts.filter((p) => p.status === "DISPUTED").length;
  return {
    volume: `${volume.toLocaleString()} USDC`,
    escrowTotal: `${escrowTotal} USDC`,
    escrowCount: `${escrowed.length} payments`,
    openDisputes: disputed,
    refundRate: "2.1%",
  };
}

/** Work-order deliverables as the receipt's checklist renders them. */
export function deliverablesFromWorkOrder(
  wo: WorkOrderRow | null,
  evidence: EvidenceRow[],
): { name: string; due: string; status: "delivered" | "missing"; deliveredOn?: string }[] {
  if (!wo) return [];
  return wo.deliverables.map((d) => {
    // a deliverable is "delivered" if matching evidence exists
    const match = evidence.find((e) => e.type === "deliverable" && e.title.toLowerCase().includes(d.name.toLowerCase().split("—")[0].trim().split(" ")[1] ?? ""));
    return {
      name: d.name,
      due: d.due,
      status: match ? "delivered" : "missing",
      deliveredOn: match ? formatShortDate(match.submittedAt) : undefined,
    };
  });
}

/** Resolve which caseStage a shared case is in, for the demo controls + chips. */
export function stageFromCase(c: SharedCase | null): CaseStage {
  if (!c) return "under_review";
  return caseStatusToStage(c.case.status);
}

/** Role label helpers for the session switcher + top bar (kept in sync with backend). */
export function roleBadge(role: Role): { label: string; dot: string } {
  switch (role) {
    case "arbiter":
      return { label: "Arbiter · Dana Whitfield · Northbeam Studios", dot: "var(--brand-500)" };
    case "merchant":
      return { label: "Merchant · Northbeam Studios", dot: "var(--warn-500)" };
    case "platform":
      return { label: "Platform · Parkline Market · view access", dot: "var(--brand-400)" };
    default:
      return { label: "Customer · Maya Reyes", dot: "var(--ok-500)" };
  }
}

export { PAYMENT_DOT, PAYMENT_WORD };

/** Config passthrough for the chain wiring the receipt/decision screens show. */
export function chainIdsFromConfig(cfg: ConfigBody | null) {
  return {
    refundProtocolAddress: cfg?.refundProtocolAddress ?? null,
    caseRegistryAddress: cfg?.caseRegistryAddress ?? null,
    chainId: cfg?.chainId ?? 31338,
    chainName: cfg?.chainName ?? "arc-local",
  };
}
