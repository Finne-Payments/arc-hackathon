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

/* Agent layer — decision frame + policy clauses (PRD Addendum A / FIN-120, FIN-115).
   The frame is verdict-free: questions (model-phrased) + requirements (templates)
   + unresolved (computed). Provenance flag per line so model lines are marked. */
export interface V1FrameQuestion {
  text: string;
  findingRefs: string[];
  provenance: "template" | "computed" | "model";
}
export interface V1FrameRequirement {
  outcome: "RECIPIENT_UPHELD" | "PLATFORM_UPHELD" | "PARTIAL_PLATFORM_UPHELD" | "DISMISSED_INSUFFICIENT_EVIDENCE";
  templateId: string;
  filledParams: Record<string, string>;
  provenance: "template";
}
export interface V1FrameUnresolved {
  kind: "unanswered_reply" | "uncountered_evidence" | "contested_amount_mismatch" | "absent_acceptance_criteria" | "missing_written_rejection";
  refs: string[];
  provenance: "computed";
}
export interface V1Frame {
  frameId: string;
  caseId: string;
  questions: V1FrameQuestion[];
  requirements: V1FrameRequirement[];
  unresolved: V1FrameUnresolved[];
  citationDepth: { platform: number; recipient: number };
  modelDigest: { model: string; id: string; digest: string } | null;
  generatedAt: string;
  degradeLevel: number; // 0=full, 1=no questions, 2=no frame
}
export interface V1Clause {
  clauseId: string;
  packRef: string;
  clauseNumber: number;
  text: string;
  parameters: { hours?: number; days?: number };
  jurisdiction?: string;
  author: string;
  reviewRef: string;
  version: number;
}

/* Agent pipeline status — non-null while the agents are running for a case
   (or briefly after). Lets the case room show an "agents running" card with
   per-stage progress instead of a blank "no frame" state. */
export interface V1FrameStage {
  name: "proof_checks" | "turning_questions" | "narrative" | "assemble";
  status: "running" | "done" | "degraded";
}
export interface V1FrameStatus {
  running: boolean;
  startedAt: string;
  stages: V1FrameStage[];
  finishedAt: string | null;
  error: string | null;
}

/* Structured case context — the sourced on-chain + off-chain facts the agents
   reasoned over. Rendered in the case room so the arbiter sees the same facts
   the model used. Every fact carries a source label (P7). */
export interface V1ContextDeliverable {
  name: string;
  due: string | null;
  acceptanceCriteria: string | null;
  source: "work_order" | "placeholder";
}
export interface V1ContextEvidence {
  evidenceId: string;
  title: string;
  submittedBy: string;
  sha256: string;
  mimeType: string;
}
export interface V1ContextChainEvent {
  eventName: string;
  txHash: string;
  block: number | null;
  seenAt: string;
}
export interface V1ContextPaymentOnChain {
  to: string;
  amountDisplay: string;
  releaseTimestamp: string;
  refundTo: string;
  withdrawnAmountDisplay: string;
  refunded: boolean;
}
export interface V1CaseContext {
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
  deliverables: V1ContextDeliverable[];
  evidence: V1ContextEvidence[];
  clauses: { clauseNumber: number; text: string; parameters: Record<string, number> }[];
  paymentOnChain: V1ContextPaymentOnChain | null;
  chainFigures: { arbiterReserve: string; recipientDebt: string } | null;
  chainEvents: V1ContextChainEvent[];
  onChainUnavailable: boolean;
}

export interface V1CaseDetail {
  case: V1Case;
  payment: V1Payment | null;
  response: { responseId: string; text: string; submittedBy: string; submittedAt: string; responseHash: string } | null;
  evidence: V1Evidence[];
  decision: V1Decision | null;
  analyses: Array<{ analysisId: string; version: number; status: string; analysisHash: string }>;
  correction: V1Correction | null;
  frame: V1Frame | null;
  frameStatus: V1FrameStatus | null;
  caseContext: V1CaseContext | null;
  clauses: V1Clause[];
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

  /* Decision frame (PRD Addendum A4) — verdict-free, degrade-safe */
  getFrame: (caseId: string) =>
    v1request<{ frame: V1Frame | null }>(`/v1/cases/${caseId}/frame`),
  runFrame: (
    caseId: string,
    body: { deliverables?: unknown[]; deliveryTimestamps?: Record<string, string | null>; deliverableAmountsMicroUsdc?: string[]; caseContext?: string },
    idempotencyKey: string,
  ) =>
    v1request<{ frameId: string; frame: V1Frame; narrative: string | null; degradeLevel: number }>(`/v1/cases/${caseId}/frame`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),
  /** Re-fetch on-chain + off-chain data and re-run the agents (the explicit
      "refresh case data" action). Returns the freshly assembled frame. */
  refreshCase: (caseId: string, idempotencyKey: string) =>
    v1request<{ frameId: string; frame: V1Frame; narrative: string | null; degradeLevel: number }>(`/v1/cases/${caseId}/refresh`, {
      method: "POST",
      body: JSON.stringify({}),
      idempotencyKey,
    }),
  logFrameAction: (caseId: string, callId: string, action: string, idempotencyKey: string) =>
    v1request<void>(`/v1/cases/${caseId}/frame/actions`, {
      method: "POST",
      body: JSON.stringify({ callId, action }),
      idempotencyKey,
    }),
  getPolicyClauses: () => v1request<{ clauses: V1Clause[] }>(`/v1/policy-clauses`),

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
