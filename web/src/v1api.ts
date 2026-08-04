/* ============================================================================
   v1 API client — calls the 36-operation registrar API (UI-01).
   All endpoints are under /v1. JWT Bearer auth. Idempotency-Key on writes.
   ========================================================================== */

import { getToken } from "./api.ts";

const API_BASE = "/api";

export class V1ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
    this.name = "V1ApiError";
  }
}

async function v1request<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({ error: "Non-JSON response" }));
  if (!res.ok) {
    throw new V1ApiError(res.status, body.code ?? "UNKNOWN", body.message ?? `HTTP ${res.status}`, body.requestId);
  }
  return body as T;
}

/* -------------------------------------------------------------------------- */
/* Types (matching the v1 backend models + OpenAPI)                           */
/* -------------------------------------------------------------------------- */

export interface V1Payment {
  paymentId: string;
  tenantKey: string;
  state: "OBSERVED" | "VERIFIED" | "REJECTED" | "PROOF_DRAFT" | "ANCHORED" | "DISPUTED" | "UNDISPUTED";
  chainId: number;
  txHash: string;
  payer: string;
  recipient: string;
  token: string;
  amountMicroUsdc: string;
  paidAt: string;
  blockNumber: number;
  finalized: boolean;
  items: Array<{ label: string; amountMicroUsdc: string }>;
  receiptHash: string | null;
  anchorTxHash: string | null;
  sourceLabel: string;
}

export interface V1Case {
  caseId: string;
  caseNumber: string;
  paymentId: string;
  tenantKey: string;
  state: "OPEN" | "RESPONDED" | "UNDER_REVIEW" | "EVIDENCE_REQUESTED" | "DECIDED" | "CORRECTION_OUTSTANDING" | "CLOSED_CORRECTED" | "CLOSED_NO_CORRECTION";
  claimType: string;
  allegation: string;
  challengedAmountMicroUsdc: string;
  claimHash: string;
  openedAt: string;
  openedBy: string;
  responseDueAt: string;
  infoRequestCount: number;
  responseHash: string | null;
  analysisHash: string | null;
  outcome: string | null;
  correctionAmountMicroUsdc: string | null;
  decisionHash: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  closedAt: string | null;
}

export interface V1Evidence {
  evidenceId: string;
  caseId: string;
  submittedBy: string;
  visibility: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  version: number;
}

export interface V1Decision {
  decisionId: string;
  caseId: string;
  outcome: "RECIPIENT_UPHELD" | "PLATFORM_UPHELD" | "PARTIAL_PLATFORM_UPHELD" | "DISMISSED_INSUFFICIENT_EVIDENCE";
  rationale: string;
  correctionAmountMicroUsdc: string | null;
  decidedBy: string;
  decidedByWallet: string;
  decidedAt: string;
  decisionHash: string;
}

export interface V1Correction {
  correctionId: string;
  caseId: string;
  state: "DRAFT" | "AWAITING_SIGNATURE" | "SUBMITTED" | "VERIFIED" | "MISMATCH" | "FAILED" | "DECLINED";
  recipient: string;
  destination: string;
  token: string;
  chainId: number;
  amountMicroUsdc: string;
  instructionHash: string;
  expiresAt: string;
}

export interface V1CaseDetail {
  case: V1Case;
  payment: V1Payment | null;
  response: { responseId: string; text: string; submittedBy: string; submittedAt: string; responseHash: string } | null;
  evidence: V1Evidence[];
  decision: V1Decision | null;
  analyses: Array<{ analysisId: string; version: number; status: string; analysisHash: string }>;
  correction: V1Correction | null;
}

export interface V1Meta {
  apiVersion: string;
  chainId: number;
  chainName: string;
  registryAddress: string | null;
  demoMode: boolean;
}

export interface V1Dashboard {
  paymentCount: number;
  openCases: number;
  pendingDecisions: number;
}

export interface V1JobRef {
  jobId: string;
  statusUrl: string;
}

export interface V1Session {
  role: string;
  tenantKey: string;
  displayName: string;
  walletAddress: string | null;
}

/* -------------------------------------------------------------------------- */
/* API functions                                                              */
/* -------------------------------------------------------------------------- */

export const v1api = {
  /* Meta + auth */
  meta: () => v1request<V1Meta>("/v1/meta"),
  me: () => v1request<V1Session>("/v1/me"),

  /* Payments */
  listPayments: () => v1request<V1Payment[]>("/v1/payments"),
  getPayment: (paymentId: string) => v1request<V1Payment>(`/v1/payments/${paymentId}`),
  importPayment: (txHash: string, idempotencyKey: string) =>
    v1request<V1JobRef>("/v1/payments/import", {
      method: "POST",
      body: JSON.stringify({ txHash }),
      idempotencyKey,
    }),
  demoPayout: (recipient: string, amountMicroUsdc: string, idempotencyKey: string) =>
    v1request<V1JobRef>("/v1/demo/payouts", {
      method: "POST",
      body: JSON.stringify({ recipient, amountMicroUsdc }),
      idempotencyKey,
    }),
  anchorReceipt: (paymentId: string, idempotencyKey: string) =>
    v1request<V1JobRef>(`/v1/payments/${paymentId}/anchors`, {
      method: "POST",
      idempotencyKey,
    }),

  /* Cases */
  listCases: () => v1request<V1Case[]>("/v1/cases"),
  getCase: (caseId: string) => v1request<V1CaseDetail>(`/v1/cases/${caseId}`),
  openCase: (
    paymentId: string,
    body: { claimType: string; allegation: string; challengedAmountMicroUsdc: string; citedEvidenceIds?: string[] },
    idempotencyKey: string,
  ) =>
    v1request<{ caseId: string; caseNumber: string; claimHash: string }>(`/v1/payments/${paymentId}/cases`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  /* Responses */
  respond: (caseId: string, text: string, evidenceIds: string[], idempotencyKey: string) =>
    v1request<{ responseId: string }>(`/v1/cases/${caseId}/responses`, {
      method: "POST",
      body: JSON.stringify({ text, evidenceIds }),
      idempotencyKey,
    }),

  /* Analysis */
  runAnalysis: (caseId: string, idempotencyKey: string) =>
    v1request<V1JobRef>(`/v1/cases/${caseId}/analysis-runs`, {
      method: "POST",
      idempotencyKey,
    }),
  approveAnalysis: (caseId: string, idempotencyKey: string) =>
    v1request<{ analysisId: string; status: string }>(`/v1/cases/${caseId}/analysis-approvals`, {
      method: "POST",
      idempotencyKey,
    }),

  /* Decisions */
  decide: (
    caseId: string,
    body: { outcome: string; rationale: string; correctionAmountMicroUsdc?: string },
    idempotencyKey: string,
  ) =>
    v1request<{ decisionId: string; decisionHash: string }>(`/v1/cases/${caseId}/decisions`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  /* Corrections */
  createCorrectionInstruction: (caseId: string, idempotencyKey: string) =>
    v1request<{ correctionId: string; instructionHash: string }>(`/v1/cases/${caseId}/correction-instructions`, {
      method: "POST",
      idempotencyKey,
    }),
  getCorrection: (correctionId: string) => v1request<V1Correction>(`/v1/corrections/${correctionId}`),
  walletIntent: (correctionId: string, idempotencyKey: string) =>
    v1request<V1Correction & { destination: string; token: string; amountMicroUsdc: string; chainId: number }>(
      `/v1/corrections/${correctionId}/wallet-intents`,
      { method: "POST", idempotencyKey },
    ),
  submitCorrectionTx: (correctionId: string, userOpHash: string, providerId: string, idempotencyKey: string) =>
    v1request<{ correctionId: string; state: string }>(`/v1/corrections/${correctionId}/transactions`, {
      method: "POST",
      body: JSON.stringify({ userOpHash, providerId }),
      idempotencyKey,
    }),
  declineCorrection: (correctionId: string, reason: string, idempotencyKey: string) =>
    v1request<{ correctionId: string; state: string }>(`/v1/corrections/${correctionId}/decline`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      idempotencyKey,
    }),
  verifyCorrection: (correctionId: string, correctionTxHash: string, idempotencyKey: string) =>
    v1request<{ caseId: string; state: string }>(`/v1/corrections/${correctionId}/verify`, {
      method: "POST",
      body: JSON.stringify({ correctionTxHash }),
      idempotencyKey,
    }),

  /* Evidence */
  allocateUpload: (
    caseId: string,
    filename: string,
    mimeType: string,
    declaredSizeBytes: number,
    idempotencyKey: string,
  ) =>
    v1request<{
      uploadId: string;
      uploadUrl: string;
      method: string;
      headers: Record<string, string>;
      expiresAt: string;
    }>("/v1/evidence/uploads", {
      method: "POST",
      body: JSON.stringify({ caseId, filename, mimeType, declaredSizeBytes }),
      idempotencyKey,
    }),
  completeUpload: (uploadId: string, caseId: string, title: string, idempotencyKey: string) =>
    v1request<V1Evidence>(`/v1/evidence/uploads/${uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify({ caseId, title }),
      idempotencyKey,
    }),

  /* Dashboard */
  dashboard: () => v1request<V1Dashboard>("/v1/dashboard"),

  /* Public proof */
  publicProof: (proofId: string) =>
    v1request<{ paymentId: string; receiptHash: string; anchorTxHash: string; state: string; amountMicroUsdc: string }>(
      `/v1/public/proofs/${proofId}`,
    ),

  /* Health */
  healthLive: () => v1request<{ ok: boolean }>("/health/live"),
  healthReady: () => v1request<{ ready: boolean; checks: Record<string, boolean> }>("/health/ready"),
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Generate a client-side idempotency key for writes. */
export function idemKey(prefix = "ui"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Format micro-USDC string as a human display string. */
export function formatUsdc(micro: string, decimals = 2): string {
  const n = BigInt(micro);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, decimals);
  return decimals > 0 ? `${whole}.${fracStr}` : whole.toString();
}

/** Short address display: 0x4B21…9d3E */
export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
