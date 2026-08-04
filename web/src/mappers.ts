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
import { PAYMENT_DOT, PAYMENT_WORD } from "./domain/statusVocabulary";

/* ============================================================================
   Mappers — translate API responses into the shapes the screens render.
   This keeps the screens unchanged: they keep importing from data.ts types,
   but the *content* now comes from the live backend. Status words + dots come
   from the shared statusVocabulary module (PRD §10.3, GAP-W1).
   ========================================================================== */

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
  maya: "Maya Santos",
  jonah: "Jonah Park",
  priya: "Priya Nair",
  tomas: "Tomás Rivera",
  alex: "Alex Chen",
};

export function recipientDisplayName(recipientKey: string | undefined | null, recipientWallet: string | undefined | null): string {
  // Try the friendly name map first (for legacy seeded data), then a short
  // wallet address, then the key. New payouts have address-derived keys, so
  // they show as a shortened wallet address — which is the real identifier.
  if (recipientKey && RECIPIENT_LABEL[recipientKey]) return RECIPIENT_LABEL[recipientKey];
  if (recipientWallet && recipientWallet.length > 10) return shortHex(recipientWallet);
  if (recipientKey && recipientKey.length > 6) return shortHex(recipientKey);
  return "Recipient";
}

export function payoutToLedgerView(p: PayoutRow, workOrderDesc: string | null): LedgerView {
  const disputed = p.status === "DISPUTED";
  return {
    recipient: recipientDisplayName(p.recipientKey, p.recipientWallet),
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

/** Same shape as the merchant ledger, but from the recipient's perspective — the
 *  party column is "from" (the platform/merchant) instead of "recipient". Keeps
 *  the two payouts tables visually congruent (same columns, dates, statuses). */
export interface RecipientLedgerView {
  from: string;
  amount: string;
  purpose: string;
  paid: string;
  status: { label: string; dot: "warn" | "brand" | "ok" | "risk" | "ink" };
  deadline: string;
  highlight: boolean;
  paymentId: string;
  /** True when the lockup has passed and the recipient can withdraw now. */
  withdrawable: boolean;
}

/** Human label for how long until lockup ends: "2h 14m", "now", "in 3 days". */
export function lockupCountdown(lockupEndIso: string): { label: string; ready: boolean } {
  try {
    const ms = new Date(lockupEndIso).getTime() - Date.now();
    if (ms <= 0) return { label: "Ready to withdraw", ready: true };
    const mins = Math.round(ms / 60000);
    if (mins < 60) return { label: `Unlocks in ${mins}m`, ready: false };
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 48) return { label: `Unlocks in ${h}h ${String(m).padStart(2, "0")}m`, ready: false };
    const days = Math.round(mins / (60 * 24));
    return { label: `Unlocks in ${days} day${days === 1 ? "" : "s"}`, ready: false };
  } catch {
    return { label: "—", ready: false };
  }
}

export function payoutToRecipientView(p: PayoutRow, workOrderDesc: string | null): RecipientLedgerView {
  const disputed = p.status === "DISPUTED";
  const settled = p.status === "WITHDRAWN" || p.status === "CLEARED" || p.status === "DEBT_SETTLED";
  // For an ESCROWED (non-disputed) payout, the lockup countdown tells the
  // recipient exactly when the funds unlock — and whether they can withdraw now.
  const lc = p.status === "ESCROWED" ? lockupCountdown(p.lockupEnd) : { label: "", ready: false };
  const deadline = disputed
    ? "Disputed — case open"
    : settled
      ? "Withdrawn"
      : p.status === "REFUNDED"
        ? "Refunded"
        : lc.label;
  return {
    from: platformName(p.platformKey),
    amount: `${p.amount} USDC`,
    purpose: workOrderDesc ?? "—",
    paid: formatPaidDate(p.paidAt),
    status: { label: PAYMENT_WORD[p.status] ?? p.status, dot: (PAYMENT_DOT[p.status] ?? "brand") as "warn" | "brand" | "ok" | "risk" | "ink" },
    deadline,
    highlight: disputed,
    paymentId: p.paymentId,
    withdrawable: p.status === "ESCROWED" && lc.ready,
  };
}

/** Headline stats for the recipient's "Your payouts" view — mirrors ledgerStats
 *  but framed from the recipient's side (protected FOR them, ready to withdraw). */
export function recipientStats(payouts: PayoutRow[]) {
  const sum = (arr: PayoutRow[]) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const escrowed = payouts.filter((p) => p.status === "ESCROWED" || p.status === "DISPUTED");
  const withdrawable = payouts.filter((p) => p.status === "WITHDRAWABLE");
  const withdrawn = payouts.filter((p) => p.status === "WITHDRAWN" || p.status === "CLEARED" || p.status === "DEBT_SETTLED");
  const disputed = payouts.filter((p) => p.status === "DISPUTED").length;
  return {
    protectedTotal: `${sum(escrowed)} USDC`,
    protectedCount: `${escrowed.length} ${escrowed.length === 1 ? "payment" : "payments"}`,
    withdrawableCount: withdrawable.length,
    withdrawableTotal: `${sum(withdrawable)} USDC`,
    openDisputes: disputed,
    withdrawnTotal: `${sum(withdrawn)} USDC`,
    withdrawnCount: `${withdrawn.length} ${withdrawn.length === 1 ? "payment" : "payments"}`,
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
  const merchant = payout ? platformName(payout.platformKey) : "Northstar Creators";
  const customer = payout ? RECIPIENT_LABEL[payout.recipientKey] ?? "Maya Santos" : "Maya Santos";
  return {
    caseId: c.caseNumber,
    parties: `${merchant} ↔ ${customer}`,
    contested: c.allegationAmountContested ? `${c.allegationAmountContested} USDC` : "—",
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
    case "northstar":
    case "northbeam": // legacy key — still resolves for older records
      return "Northstar Creators";
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

/** Build a block-explorer URL for a transaction hash (undefined if no base URL). */
export function explorerTx(base: string | null | undefined, hash: string | null | undefined): string | undefined {
  return base && hash ? `${base.replace(/\/+$/, "")}/tx/${hash}` : undefined;
}

/** Build a block-explorer URL for an address (undefined if no base URL). */
export function explorerAddr(base: string | null | undefined, addr: string | null | undefined): string | undefined {
  return base && addr ? `${base.replace(/\/+$/, "")}/address/${addr}` : undefined;
}

/**
 * Receipt header status, derived from the payout's real status — NOT the demo
 * caseStage. A freshly-protected (ESCROWED) payout now reads "Protected" instead
 * of the old hardcoded "Disputed"; the dispute banner only shows when the payout
 * is actually DISPUTED.
 */
export function receiptStatusView(payout: { status: string }): {
  chipLabel: string;
  chipDot: "warn" | "brand" | "ok" | "risk";
  showBanner: boolean;
} {
  return {
    chipLabel: PAYMENT_WORD[payout.status] ?? payout.status,
    chipDot: (PAYMENT_DOT[payout.status] ?? "brand") as "warn" | "brand" | "ok" | "risk",
    showBanner: payout.status === "DISPUTED",
  };
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
  const now = new Date();
  const inCurrentMonth = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } catch {
      return false;
    }
  };
  const escrowed = payouts.filter((p) => p.status === "ESCROWED" || p.status === "DISPUTED");
  const escrowTotal = escrowed.reduce((s, p) => s + Number(p.amount || 0), 0);
  const disputed = payouts.filter((p) => p.status === "DISPUTED").length;
  const resolvedStatuses = ["REFUNDED", "CLEARED", "WITHDRAWN", "DEBT_SETTLED"];
  const resolvedAll = payouts.filter((p) => resolvedStatuses.includes(p.status));
  // "Resolved this month" — approximated by paidAt, the closest date on the row.
  const resolvedThisMonth = resolvedAll.filter((p) => inCurrentMonth(p.paidAt));
  const refunded = resolvedAll.filter((p) => p.status === "REFUNDED" || p.status === "DEBT_OUTSTANDING").length;
  const cleared = resolvedAll.filter((p) => p.status === "CLEARED" || p.status === "WITHDRAWN").length;
  return {
    protectedCount: escrowed.length,
    escrowTotal: `${escrowTotal} USDC in escrow`,
    openDisputes: disputed,
    resolved: resolvedThisMonth.length,
    resolvedSub: resolvedThisMonth.length
      ? `${resolvedThisMonth.filter((p) => p.status === "REFUNDED").length} refunded · ${resolvedThisMonth.filter((p) => p.status === "CLEARED" || p.status === "WITHDRAWN").length} cleared`
      : `${refunded} refunded · ${cleared} cleared all-time`,
  };
}

/** Marketplace stats for the platform view — fully derived from the payout list. */
export function platformStats(payouts: PayoutRow[]) {
  const volume = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const escrowed = payouts.filter((p) => p.status === "ESCROWED" || p.status === "DISPUTED");
  const escrowTotal = escrowed.reduce((s, p) => s + Number(p.amount || 0), 0);
  const disputed = payouts.filter((p) => p.status === "DISPUTED").length;
  const merchants = new Set(payouts.map((p) => p.platformKey).filter(Boolean)).size;
  const resolvedStatuses = ["REFUNDED", "CLEARED", "WITHDRAWN", "DEBT_SETTLED"];
  const resolved = payouts.filter((p) => resolvedStatuses.includes(p.status)).length;
  const refunded = payouts.filter((p) => p.status === "REFUNDED" || p.status === "DEBT_OUTSTANDING").length;
  const refundRate = resolved > 0 ? `${Math.round((refunded / resolved) * 1000) / 10}%` : "—";
  return {
    volume: `${volume.toLocaleString()} USDC`,
    escrowTotal: `${escrowTotal} USDC`,
    escrowCount: `${escrowed.length} ${escrowed.length === 1 ? "payment" : "payments"}`,
    openDisputes: disputed,
    refundRate,
    merchantCount: `${merchants} ${merchants === 1 ? "merchant" : "merchants"}`,
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
      return { label: "Arbiter · Dana Whitfield · Northstar Creators", dot: "var(--brand-500)" };
    case "merchant":
      return { label: "Merchant · Northstar Creators", dot: "var(--warn-500)" };
    case "platform":
      return { label: "Platform · Parkline Market · view access", dot: "var(--brand-400)" };
    default:
      return { label: "Customer · Maya Santos", dot: "var(--ok-500)" };
  }
}

/** Short, capitalized role title for identity displays (header pill, sidebar). */
export function roleLabel(role: Role): string {
  switch (role) {
    case "arbiter":
      return "Arbiter";
    case "merchant":
      return "Merchant";
    case "customer":
      return "Customer";
    case "platform":
      return "Platform";
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
