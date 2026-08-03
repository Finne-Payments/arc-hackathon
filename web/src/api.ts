import type { Role } from "./types";

/* ============================================================================
   Typed fetch client for the Finné backend (PRD §14.1).
   The Vite dev server proxies /api → localhost:4000 (vite.config.ts).
   Authentication uses a JWT Bearer token (password login). The token is stored
   in localStorage and sent on every request via the Authorization header.
   ========================================================================== */

const API_BASE = "/api";
const TOKEN_KEY = "finne-token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return authToken;
}
export function setToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Map the frontend's Role union to the transport seat. */
export function roleToSeat(role: Role): "reviewer" | "recipient" | "platform" {
  switch (role) {
    case "arbiter":
      return "reviewer";
    case "merchant":
      return "reviewer";
    case "customer":
      return "recipient";
    case "platform":
      return "platform";
  }
}

/** Map the frontend's Role union to the backend's stored role. */
export function roleToBackendRole(role: Role): "reviewer" | "recipient" | "platform_viewer" {
  switch (role) {
    case "arbiter":
    case "merchant":
      return "reviewer";
    case "customer":
      return "recipient";
    case "platform":
      return "platform_viewer";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---- typed response shapes (mirror the backend's shared bodies) ---- */
export interface PayoutRow {
  paymentId: string;
  chain: string;
  contractAddress: string;
  txHash: string;
  amount: string;
  refundTo: string;
  platformKey: string;
  recipientKey: string;
  recipientWallet: string;
  workOrderRef: string | null;
  trancheIndex: number | null;
  disputeDeadline: string;
  lockupEnd: string;
  paidAt: string;
  status: string;
  receiptHash: string;
  registryAnchorTx: string | null;
  refundTxHash: string | null;
  withdrawTxHash: string | null;
}

export interface WorkOrderRow {
  platformKey: string;
  recipientKey: string;
  description: string;
  deliverables: { name: string; due: string; acceptanceCriteria: string }[];
  amount: string;
  currency: string;
  status: string;
}

export interface EvidenceRow {
  caseRef: string | null;
  payoutRef: string | null;
  submittedBy: string;
  type: string;
  title: string;
  sha256: string;
  submittedAt: string;
  showOnlyAfterReply?: boolean;
  kind?: string;
  fileOrText?: never; // never exposed by the API (P3 — fingerprints only)
}

export interface CaseRow {
  caseNumber: string;
  caseCode?: string;
  payoutRef: string;
  openedBy: string;
  allegationClaimType: string;
  allegationFreeText: string;
  allegationAmountContested: string;
  status: string;
  infoRequestCount: number;
  infoRequests: { target: string; text: string; requestedAt: string; answeredAt: string | null }[];
  responseDeadline: string;
  caseHash: string;
  openedAt: string;
}

export interface BriefRow {
  caseRef: string | null;
  payoutRef: string;
  version: number;
  checks: { check: string; expected: string; found: string; result: string }[];
  inconsistencies: string[];
  missingItems: string[];
  generatedAt: string;
}

export interface DecisionRow {
  caseRef: string;
  outcome: string;
  decidedByName: string;
  decidedByWallet: string;
  reason: string;
  decidedAt: string;
  decisionHash: string;
  refundTxHash: string | null;
  executedAt: string | null;
  registryAnchorTx: string | null;
}

export interface SharedCase {
  payout: PayoutRow;
  workOrder: WorkOrderRow | null;
  case: CaseRow;
  responses: { author: string; authorName: string; text: string; submittedAt: string }[];
  evidence: EvidenceRow[];
  brief: { latest: BriefRow; versions: number } | null;
  decision: DecisionRow | null;
}

export interface SharedReceipt {
  payout: PayoutRow;
  workOrder: WorkOrderRow | null;
  case: CaseRow | null;
  decision: DecisionRow | null;
  evidence: EvidenceRow[];
}

export interface StatusBody {
  indexer: { lastSeenAt: string | null; lastBlock: number; stale: boolean };
  chain: { arbiterReserve: string; recipientDebt: string } | null;
  chainReady?: { refundProtocolDeployed: boolean; caseRegistryDeployed: boolean };
  demoMode: boolean;
}

export interface ConfigBody {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  chainName: string;
  refundProtocolAddress: string | null;
  caseRegistryAddress: string | null;
  usdcAddress: string | null;
  chainReady?: { refundProtocolDeployed: boolean; caseRegistryDeployed: boolean };
  demoMode: boolean;
  platform: {
    name: string;
    arbiterAddress: string;
    arbiterName: string;
    refundAddress: string;
    policy: { summary: string; lockupSeconds: number; responseWindowHours: number };
  } | null;
  recipient: { key: string; displayName: string; walletAddress: string } | null;
}

export interface UnsignedTx {
  to: string;
  chainId: number;
  functionName: string;
  args: (string | number)[];
  abi: unknown[];
  abiName: string;
}

/* ---- endpoint wrappers ---- */
export const api = {
  healthz: () => request<{ ok: boolean }>("/healthz"),
  config: () => request<ConfigBody>("/config"),
  status: () => request<StatusBody>("/status"),
  chainEvents: () => request<{ txHash: string; eventName: string; contract: string; block: number }[]>("/chain/events"),

  payouts: () => request<{ payouts: PayoutRow[] }>("/payouts"),
  // No createPayout endpoint: payouts are created ONLY by the indexer when it
  // detects an on-chain pay(). The merchant signs approve()+pay() in the browser
  // (wallet.ts approveAndPay); the indexer builds the receipt row.
  receipt: (paymentId: string) => request<SharedReceipt>(`/payouts/${paymentId}/receipt`),

  cases: () => request<{ cases: CaseRow[] }>("/cases"),
  case: (caseNumber: string) => request<SharedCase>(`/cases/${caseNumber}`),

  openDispute: (paymentId: string, body: { claimType: string; freeText: string; amountContested: string }) =>
    request<{ caseNumber: string; status: string }>(`/payouts/${paymentId}/disputes`, { method: "POST", body: JSON.stringify(body) }),

  respond: (caseNumber: string, body: { text: string; evidence?: { type: string; title: string; fileOrText: string }[] }) =>
    request<{ caseNumber: string; status: string }>(`/cases/${caseNumber}/responses`, { method: "POST", body: JSON.stringify(body) }),

  addEvidence: (caseNumber: string, body: { type: string; title: string; fileOrText: string }) =>
    request<{ caseNumber: string }>(`/cases/${caseNumber}/evidence`, { method: "POST", body: JSON.stringify(body) }),

  requestInfo: (caseNumber: string, body: { target: "platform" | "recipient"; text: string }) =>
    request<{ caseNumber: string; status: string; infoRequestCount: number }>(`/cases/${caseNumber}/requests`, { method: "POST", body: JSON.stringify(body) }),

  decide: (caseNumber: string, body: { outcome: "refund" | "release" | "no_action"; reason: string }) =>
    request<{ decision: DecisionRow; unsignedTx: UnsignedTx | null }>(`/cases/${caseNumber}/decisions`, { method: "POST", body: JSON.stringify(body) }),

  timeline: (caseNumber: string) =>
    request<{ events: { time: string; type: string; label: string; txHash?: string }[] }>(`/cases/${caseNumber}/timeline`),

  decisionPreview: (caseNumber: string, outcome: string) =>
    request<{ preview: string }>(`/cases/${caseNumber}/decision-preview`, { method: "POST", body: JSON.stringify({ outcome }) }),

  // auth
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (body: { email: string; password: string; role: string; displayName: string; platformKey: string }) =>
    request<{ token: string; user: PublicUser }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  getMe: () => request<{ user: PublicUser }>("/auth/me"),
  linkWallet: (walletAddress: string) =>
    request<{ user: PublicUser }>("/auth/link-wallet", { method: "POST", body: JSON.stringify({ walletAddress }) }),

  // notifications
  notifications: () =>
    request<{ notifications: NotificationRow[]; unreadCount: number }>("/notifications"),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),

  // address book (per-user saved wallets for the New Payout flow)
  listAddressBook: () => request<{ entries: AddressBookEntry[] }>("/address-book"),
  addAddressBook: (body: { side: "from" | "to"; label: string; address: string }) =>
    request<{ entry: AddressBookEntry }>("/address-book", { method: "POST", body: JSON.stringify(body) }),
  removeAddressBook: (id: string) =>
    request<{ ok: boolean }>(`/address-book/${id}`, { method: "DELETE" }),

  // wallet balance (live USDC + RefundProtocol balances/debts for the user's wallet)
  walletBalance: () => request<WalletBalance>("/wallet/balance"),
};

export interface WalletBalance {
  walletAddress: string | null;
  usdc: string | null;
  protected: string | null;
  debt: string | null;
}

export interface AddressBookEntry {
  id: string;
  side: "from" | "to";
  label: string;
  address: string;
}

export interface NotificationRow {
  _id: string;
  type: string;
  title: string;
  body: string;
  caseNumber: string | null;
  paymentId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Wallet login (no password, no external service). The browser wallet (MetaMask
 * via window.ethereum) connects through wallet.ts; its address is sent here and
 * the backend find-or-creates a user keyed by that address, assigns the chosen
 * role on first login, and returns a Finné JWT. The address itself is the
 * identity — the wallet still signs every on-chain action, so no server-side
 * key material is involved.
 */
export async function walletLogin(body: { walletAddress: string; role?: Role }): Promise<{ token: string; user: PublicUser }> {
  return request<{ token: string; user: PublicUser }>("/auth/wallet", {
    method: "POST",
    body: JSON.stringify({
      walletAddress: body.walletAddress,
      // Send the frontend seat (arbiter/merchant/customer/platform). The backend
      // derives the stored role from it and enforces one-wallet-one-seat, so the
      // same wallet can't sign in as a different seat (incl. arbiter vs merchant,
      // which share the backend `reviewer` role).
      seat: body.role,
    }),
  });
}

export interface PublicUser {
  id: string;
  email: string;
  role: "reviewer" | "recipient" | "platform_viewer";
  seat: string | null;
  displayName: string;
  platformKey: string;
  walletAddress: string | null;
}
