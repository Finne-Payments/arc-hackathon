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
  /** Work order description (joined from the work order by paymentId). */
  description: string | null;
}

export interface WorkOrderRow {
  platformKey: string;
  recipientKey: string;
  description: string;
  deliverables: { name: string; due: string; acceptanceCriteria: string }[];
  amount: string;
  currency: string;
  status: string;
  /** Payment-time contract documents (arbiter-only downloads). */
  documents?: WorkOrderDocument[];
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
  /** Mongo _id — used to request the arbiter-only download. */
  _id?: string;
  /** Where the evidence came from. */
  source?: "text" | "upload" | "link";
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  linkUrl?: string;
  visibility?: "SHARED" | "ARBITER_ONLY";
}

/** A payment-time contract document attached to a work order. */
export interface WorkOrderDocument {
  documentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  objectKey: string;
  uploadedAt: string;
}

/** An agent's summary of a document (sha-stamped). */
export interface EvidenceAnnotation {
  annotationId: string;
  evidenceId: string;
  ownerRef: string;
  sourceSha256: string;
  summary: string;
  readerType: "pdf" | "link" | "text";
  degraded: boolean;
  generatedAt: string;
}

/** Renderable content for the inline preview modal. */
export interface PreviewResult {
  kind: "text" | "video" | "link";
  content: string;
  mimeType: string;
  filename: string;
  sha256: string;
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

export interface FrameQuestion {
  text: string;
  findingRefs: string[];
  provenance: "template" | "computed" | "model";
}
export interface FrameUnresolvedItem {
  kind: string;
  refs: string[];
  provenance: "computed";
}
export interface AgentFrame {
  frameId: string;
  caseId: string;
  questions: FrameQuestion[];
  requirements: { outcome: string; templateId: string; filledParams: Record<string, string>; provenance: "template" }[];
  unresolved: FrameUnresolvedItem[];
  citationDepth: { platform: number; recipient: number };
  degradeLevel: number; // 0=full, 1=no questions, 2=no frame
  generatedAt: string;
}
export interface AgentFrameStatus {
  running: boolean;
  stages: { name: string; status: "running" | "done" | "degraded" }[];
  error: string | null;
}

/** A governing-law note (FIN-112) — lives on the clauseNumber 0 row's lawLines[]. */
export interface LawLineRow {
  note: string;
  text: string;
  jurisdiction: string;
  author: string;
  reviewRef: string;
  version: number;
  sourceRefs: { cite: string; url: string }[];
}

/** A policy-clause row from the seeded pack (FIN-110/115). clauseNumber 0 is the
 *  governing-law row carrying lawLines[] + disclaimer; 4/7/9 are numbered clauses. */
export interface PolicyClauseRow {
  clauseId: string;
  packRef?: string;
  clauseNumber: number;
  text: string;
  parameters: { hours?: number; days?: number };
  lawLines?: LawLineRow[];
  disclaimer?: string;
  jurisdiction?: string;
  author?: string;
  reviewRef?: string;
  version?: number;
}

/** Structured, verdict-free case context — sourced on-chain + off-chain facts
 *  the agents reasoned over (ported from v1's V1CaseContext). Every field null-
 *  tolerant; onChainUnavailable flags an RPC/indexing gap. */
export interface CaseContextRow {
  allegation: string;
  claimType: string;
  challengedAmountMicroUsdc: string;
  disputeOpenedAt: string;
  paymentAmountMicroUsdc: string;
  payer: string;
  recipient: string;
  paidAt: string;
  paymentTxHash: string;
  response: { text: string; submittedAt: string } | null;
  deliverables: { name: string; due: string | null; acceptanceCriteria: string | null; source: string }[];
  evidence: { evidenceId: string; title: string; submittedBy: string; sha256: string; mimeType: string; source: string }[];
  clauses: { clauseNumber: number; text: string; parameters: Record<string, number> }[];
  paymentOnChain: {
    to: string; amountDisplay: string; releaseTimestamp: string; refundTo: string;
    withdrawnAmountDisplay: string; refunded: boolean; source: string;
  } | null;
  chainFigures: { arbiterReserve: string; recipientDebt: string; source: string } | null;
  chainEvents: { eventName: string; txHash: string; block: number | null; seenAt: string; source: string }[];
  onChainUnavailable: boolean;
}

export interface SharedCase {
  payout: PayoutRow;
  workOrder: WorkOrderRow | null;
  case: CaseRow;
  /** Policy clauses in force + the governing-law notes (clauseNumber 0). */
  clauses: PolicyClauseRow[];
  responses: { author: string; authorName: string; text: string; submittedAt: string }[];
  evidence: EvidenceRow[];
  brief: { latest: BriefRow; versions: number } | null;
  decision: DecisionRow | null;
  /** The v1 agent frame (turning questions + findings) — null until the agents run. */
  frame: AgentFrame | null;
  /** Non-null while the agent pipeline is running (drives the "agents running" card). */
  frameStatus: AgentFrameStatus | null;
  /** Structured, verdict-free case context (sourced on-chain + off-chain facts). */
  caseContext: CaseContextRow | null;
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
  // No createPayout endpoint: a Payout row is created ONLY by the indexer when
  // it detects an on-chain pay(). The payer signs approve()+pay() in the browser
  // (wallet.ts approveAndPay); the indexer builds the receipt row from real
  // chain data. There is no off-chain payout path.
  receipt: (paymentId: string) => request<SharedReceipt>(`/payouts/${paymentId}/receipt`),

  // Attach work-order metadata (description, deliverables) to an EXISTING
  // on-chain payout — called only after approveAndPay confirms. The backend
  // 404s if the payout doesn't exist yet, so metadata can never precede the
  // chain commitment.
  savePayoutMetadata: (paymentId: string, body: { description?: string; deliverables?: { name: string; due?: string; acceptanceCriteria?: string }[]; settleImmediately?: boolean }) =>
    request<{ payout: PayoutRow }>(`/payouts/${paymentId}/metadata`, { method: "POST", body: JSON.stringify(body) }),

  cases: () => request<{ cases: CaseRow[] }>("/cases"),
  case: (caseNumber: string) => request<SharedCase>(`/cases/${caseNumber}`),

  /** Re-fetch on-chain + off-chain data and re-run the agent pipeline. */
  refreshCase: (caseNumber: string) =>
    request<{ frameId: string; frame: AgentFrame | null; narrative: string | null; degradeLevel: number }>(`/cases/${caseNumber}/refresh`, { method: "POST", body: JSON.stringify({}) }),

  openDispute: (paymentId: string, body: { claimType: string; freeText: string; amountContested: string }) =>
    request<{ caseNumber: string; status: string }>(`/payouts/${paymentId}/disputes`, { method: "POST", body: JSON.stringify(body) }),

  respond: (caseNumber: string, body: { text: string; evidence?: { type: string; title: string; fileOrText: string }[] }) =>
    request<{ caseNumber: string; status: string }>(`/cases/${caseNumber}/responses`, { method: "POST", body: JSON.stringify(body) }),

  addEvidence: (caseNumber: string, body: { type: string; title: string; fileOrText: string }) =>
    request<{ caseNumber: string }>(`/cases/${caseNumber}/evidence`, { method: "POST", body: JSON.stringify(body) }),

  // --- Evidence documents (uploaded files, arbiter-only) + links ---
  /** Allocate a presigned PUT URL for a case evidence file. */
  allocateEvidenceUpload: (caseNumber: string, body: { filename: string; mimeType: string; declaredSizeBytes: number }) =>
    request<{ uploadId: string; objectKey: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresAt: string }>(`/cases/${caseNumber}/evidence/uploads`, { method: "POST", body: JSON.stringify(body) }),
  /** Finalize an evidence file upload: verify bytes, record metadata, trigger the agent summary. */
  completeEvidenceUpload: (caseNumber: string, uploadId: string, body: { title: string; filename: string }) =>
    request<{ evidenceId: string; sha256: string; mimeType: string; sizeBytes: number }>(`/cases/${caseNumber}/evidence/uploads/${uploadId}/complete`, { method: "POST", body: JSON.stringify(body) }),
  /** Add a link (e.g. YouTube) as evidence — shared visibility. */
  addEvidenceLink: (caseNumber: string, body: { title: string; linkUrl: string }) =>
    request<{ evidenceId: string }>(`/cases/${caseNumber}/evidence/links`, { method: "POST", body: JSON.stringify(body) }),
  /** Case parties: get a short-lived presigned download URL for an evidence file. */
  downloadEvidence: (caseNumber: string, evidenceId: string) =>
    request<{ url: string; expiresAt: string }>(`/cases/${caseNumber}/evidence/${evidenceId}/download`),
  /** Case parties: renderable content for the inline preview modal. */
  previewEvidence: (caseNumber: string, evidenceId: string) =>
    request<PreviewResult>(`/cases/${caseNumber}/evidence/${evidenceId}/preview`),
  /** Agent document summaries for a case (the arbiter sees these as cards). */
  caseAnnotations: (caseNumber: string) =>
    request<{ annotations: EvidenceAnnotation[] }>(`/cases/${caseNumber}/annotations`),

  // --- Work order documents (payment-time contracts) ---
  allocateWorkOrderDocument: (paymentId: string, body: { filename: string; mimeType: string; declaredSizeBytes: number }) =>
    request<{ uploadId: string; objectKey: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresAt: string }>(`/payouts/${paymentId}/documents/uploads`, { method: "POST", body: JSON.stringify(body) }),
  completeWorkOrderDocument: (paymentId: string, uploadId: string, body: { filename: string }) =>
    request<{ documentId: string; sha256: string; mimeType: string; sizeBytes: number }>(`/payouts/${paymentId}/documents/uploads/${uploadId}/complete`, { method: "POST", body: JSON.stringify(body) }),
  downloadWorkOrderDocument: (paymentId: string, documentId: string) =>
    request<{ url: string; expiresAt: string }>(`/payouts/${paymentId}/documents/${documentId}/download`),
  previewWorkOrderDocument: (paymentId: string, documentId: string) =>
    request<PreviewResult>(`/payouts/${paymentId}/documents/${documentId}/preview`),
  workOrderAnnotations: (paymentId: string) =>
    request<{ annotations: EvidenceAnnotation[] }>(`/payouts/${paymentId}/documents/annotations`),

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
