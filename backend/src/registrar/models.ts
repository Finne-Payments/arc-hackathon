/* ============================================================================
   Registrar models (BE-02) — the production Mongo schema for the registrar model.
   No escrow/debt/lockup/withdrawal fields. Amounts as validated micro-USDC strings.
   Immutable content hashes. Atomic counters for collision-safe numbering.
   ========================================================================== */

import mongoose, { Schema, type Document } from "mongoose";
import { appendOnly } from "../models/appendOnly.ts";

/* -------------------------------------------------------------------------- */
/* Tenant + user                                                              */
/* -------------------------------------------------------------------------- */

export interface TenantDoc extends Document {
  key: string; // e.g. "northstar"
  name: string;
  payWallet: string;
  refundAddress: string;
  createdAt: string;
}

const tenantSchema = new Schema<TenantDoc>({
  key: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  payWallet: { type: String, required: true },
  refundAddress: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

/* -------------------------------------------------------------------------- */
/* Payments (registrar model: OBSERVED → VERIFIED → ANCHORED → DISPUTED → …)  */
/* -------------------------------------------------------------------------- */

export interface PaymentDoc extends Document {
  paymentId: string; // opaque (pay_xxx)
  tenantKey: string;
  state: string; // PaymentState from @finne/domain
  chainId: number;
  txHash: string;
  payer: string;
  recipient: string;
  token: string;
  amountMicroUsdc: string; // canonical micro-USDC string
  paidAt: string;
  blockNumber: number;
  finalized: boolean;
  items: Array<{ label: string; amountMicroUsdc: string }>;
  policyVersion: string;
  policyHash: string;
  receiptHash: string | null;
  proofRunHash: string | null;
  anchorTxHash: string | null;
  sourceLabel: string; // OFFCHAIN_FIXTURE until a real verified transfer
  schemaVersion: number;
}

const PAYMENT_IMMUTABLE = [
  "paymentId", "tenantKey", "chainId", "txHash", "payer", "recipient",
  "token", "amountMicroUsdc", "paidAt", "blockNumber", "items",
  "policyVersion", "policyHash",
];

const paymentSchema = new Schema<PaymentDoc>({
  paymentId: { type: String, required: true, unique: true, index: true },
  tenantKey: { type: String, required: true, index: true },
  state: { type: String, required: true, default: "OBSERVED" },
  chainId: { type: Number, required: true },
  txHash: { type: String, required: true, unique: true, index: true },
  payer: { type: String, required: true },
  recipient: { type: String, required: true, index: true },
  token: { type: String, required: true },
  amountMicroUsdc: { type: String, required: true },
  paidAt: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  finalized: { type: Boolean, default: false },
  items: [{ label: String, amountMicroUsdc: String }],
  policyVersion: String,
  policyHash: String,
  receiptHash: String,
  proofRunHash: String,
  anchorTxHash: String,
  sourceLabel: { type: String, default: "OFFCHAIN_FIXTURE" },
  schemaVersion: { type: Number, default: 1 },
});
appendOnly(paymentSchema, "Payment", PAYMENT_IMMUTABLE);

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

export interface CaseDoc extends Document {
  caseId: string; // opaque (case_xxx)
  caseNumber: string; // CASE-0142 display number
  paymentId: string;
  tenantKey: string;
  state: string; // CaseState from @finne/domain
  claimType: string;
  allegation: string;
  challengedAmountMicroUsdc: string;
  citedEvidenceIds: [string];
  policyVersion: string;
  claimHash: string;
  openedAt: string;
  openedBy: string;
  responseDueAt: string;
  infoRequestCount: { type: Number, default: 0 },
  anchorTxHash: string | null;
  responseHash: string | null;
  analysisHash: string | null;
  analysisVersion: number | null;
  outcome: string | null;
  correctionAmountMicroUsdc: string | null;
  decisionHash: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  correctionHash: string | null;
  closedAt: string | null;
  schemaVersion: number;
}

const caseSchema = new Schema<CaseDoc>({
  caseId: { type: String, required: true, unique: true, index: true },
  caseNumber: { type: String, required: true, unique: true },
  paymentId: { type: String, required: true, index: true },
  tenantKey: { type: String, required: true, index: true },
  state: { type: String, required: true },
  claimType: { type: String, required: true },
  allegation: { type: String, required: true },
  challengedAmountMicroUsdc: { type: String, required: true },
  citedEvidenceIds: [String],
  policyVersion: String,
  claimHash: String,
  openedAt: { type: String, required: true },
  openedBy: { type: String, required: true },
  responseDueAt: { type: String, required: true },
  infoRequestCount: { type: Number, default: 0 },
  anchorTxHash: String,
  responseHash: String,
  analysisHash: String,
  analysisVersion: Number,
  outcome: String,
  correctionAmountMicroUsdc: String,
  decisionHash: String,
  decidedBy: String,
  decidedAt: String,
  correctionHash: String,
  closedAt: String,
  schemaVersion: { type: Number, default: 1 },
});
// One active case per payment
caseSchema.index({ paymentId: 1, state: 1 });

/* -------------------------------------------------------------------------- */
/* Evidence (metadata only — bytes in S3/local store, PAY-02)                 */
/* -------------------------------------------------------------------------- */

export interface EvidenceDoc extends Document {
  evidenceId: string;
  caseId: string;
  paymentId: string;
  tenantKey: string;
  submittedBy: string;
  visibility: string; // SHARED | PLATFORM_INTERNAL | RECIPIENT_PRIVATE | SYSTEM
  title: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  objectKey: string;
  version: number;
  submittedAt: string;
}

const EVIDENCE_IMMUTABLE = [
  "evidenceId", "caseId", "paymentId", "tenantKey", "submittedBy",
  "visibility", "title", "mimeType", "sizeBytes", "sha256", "objectKey", "version",
];

const evidenceSchema = new Schema<EvidenceDoc>({
  evidenceId: { type: String, required: true, unique: true, index: true },
  caseId: { type: String, required: true, index: true },
  paymentId: { type: String, index: true },
  tenantKey: { type: String, required: true, index: true },
  submittedBy: { type: String, required: true },
  visibility: { type: String, required: true, default: "SHARED" },
  title: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  sha256: { type: String, required: true },
  objectKey: { type: String, required: true },
  version: { type: Number, required: true },
  submittedAt: { type: String, default: () => new Date().toISOString() },
});
appendOnly(evidenceSchema, "Evidence", EVIDENCE_IMMUTABLE);

/* -------------------------------------------------------------------------- */
/* Responses (recipient right of reply — one per case)                        */
/* -------------------------------------------------------------------------- */

export interface ResponseDoc extends Document {
  responseId: string;
  caseId: string;
  text: string;
  evidenceIds: [string];
  submittedBy: string;
  submittedAt: string;
  responseHash: string;
}

const responseSchema = new Schema<ResponseDoc>({
  responseId: { type: String, required: true, unique: true },
  caseId: { type: String, required: true, unique: true }, // one response per case
  text: { type: String, required: true },
  evidenceIds: [String],
  submittedBy: { type: String, required: true },
  submittedAt: { type: String, required: true },
  responseHash: { type: String, required: true },
});

/* -------------------------------------------------------------------------- */
/* Decisions (immutable — one per case)                                       */
/* -------------------------------------------------------------------------- */

export interface DecisionDoc extends Document {
  decisionId: string;
  caseId: string;
  outcome: string;
  rationale: string;
  correctionAmountMicroUsdc: string | null;
  decidedBy: string;
  decidedByWallet: string;
  decidedAt: string;
  decisionHash: string;
  anchorTxHash: string | null;
}

const DECISION_IMMUTABLE = [
  "decisionId", "caseId", "outcome", "rationale", "correctionAmountMicroUsdc",
  "decidedBy", "decidedByWallet", "decidedAt", "decisionHash",
];

const decisionSchema = new Schema<DecisionDoc>({
  decisionId: { type: String, required: true, unique: true },
  caseId: { type: String, required: true, unique: true }, // one decision per case
  outcome: { type: String, required: true },
  rationale: { type: String, required: true },
  correctionAmountMicroUsdc: String,
  decidedBy: { type: String, required: true },
  decidedByWallet: { type: String, required: true },
  decidedAt: { type: String, required: true },
  decisionHash: { type: String, required: true },
  anchorTxHash: String,
});
appendOnly(decisionSchema, "Decision", DECISION_IMMUTABLE);

/* -------------------------------------------------------------------------- */
/* Corrections (VOLUNTARY_REPAYMENT — recipient-authorized, separate tx)      */
/* -------------------------------------------------------------------------- */

export interface CorrectionDoc extends Document {
  correctionId: string;
  caseId: string;
  paymentId: string;
  decisionId: string;
  state: string; // CorrectionState from @finne/domain
  recipient: string;
  destination: string;
  token: string;
  chainId: number;
  amountMicroUsdc: string;
  instructionHash: string;
  expiresAt: string;
  userOpHash: string | null;
  providerId: string | null;
  correctionTxHash: string | null;
  declineReason: string | null;
  createdAt: string;
}

const correctionSchema = new Schema<CorrectionDoc>({
  correctionId: { type: String, required: true, unique: true, index: true },
  caseId: { type: String, required: true, unique: true, index: true },
  paymentId: { type: String, required: true },
  decisionId: { type: String, required: true },
  state: { type: String, required: true, default: "DRAFT" },
  recipient: { type: String, required: true },
  destination: { type: String, required: true },
  token: { type: String, required: true },
  chainId: { type: Number, required: true },
  amountMicroUsdc: { type: String, required: true },
  instructionHash: { type: String, required: true },
  expiresAt: { type: String, required: true },
  userOpHash: String,
  providerId: String,
  correctionTxHash: String,
  declineReason: String,
  createdAt: { type: String, default: () => new Date().toISOString() },
});

/* -------------------------------------------------------------------------- */
/* Proof runs (deterministic checks) + Agent analyses (non-verdict fact packs) */
/* -------------------------------------------------------------------------- */

export interface ProofRunDoc extends Document {
  runId: string;
  paymentId: string;
  checkVersion: string;
  inputBundleHash: string;
  outputHash: string;
  status: string; // draft | approved | anchored
  createdAt: string;
}

const proofRunSchema = new Schema<ProofRunDoc>({
  runId: { type: String, required: true, unique: true },
  paymentId: { type: String, required: true, index: true },
  checkVersion: { type: String, required: true },
  inputBundleHash: { type: String, required: true },
  outputHash: { type: String, required: true },
  status: { type: String, default: "draft" },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export interface AnalysisDoc extends Document {
  analysisId: string;
  caseId: string;
  version: number;
  status: string; // draft | approved | anchored
  factPack: Record<string, unknown>; // AgentFactPack JSON
  analysisHash: string;
  agentVersion: Record<string, string>;
  createdAt: string;
}

const ANALYSIS_IMMUTABLE = ["analysisId", "caseId", "factPack", "analysisHash", "agentVersion"];

const analysisSchema = new Schema<AnalysisDoc>({
  analysisId: { type: String, required: true, unique: true },
  caseId: { type: String, required: true, index: true },
  version: { type: Number, required: true },
  status: { type: String, default: "draft" },
  factPack: { type: Schema.Types.Mixed, required: true },
  analysisHash: { type: String, required: true },
  agentVersion: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});
analysisSchema.index({ caseId: 1, version: 1 }, { unique: true });
appendOnly(analysisSchema, "Analysis", ANALYSIS_IMMUTABLE);

/* -------------------------------------------------------------------------- */
/* Invitations (one-use recipient auth — BE-05)                               */
/* -------------------------------------------------------------------------- */

export interface InvitationDoc extends Document {
  invitationId: string;
  caseId: string;
  paymentId: string;
  tenantKey: string;
  expectedWallet: string | null;
  tokenHash: string; // hash of the one-use token; never the raw token
  consumed: boolean;
  expiresAt: string;
  createdAt: string;
}

const invitationSchema = new Schema<InvitationDoc>({
  invitationId: { type: String, required: true, unique: true },
  caseId: { type: String, required: true },
  paymentId: { type: String, required: true },
  tenantKey: { type: String, required: true },
  expectedWallet: String,
  tokenHash: { type: String, required: true },
  consumed: { type: Boolean, default: false },
  expiresAt: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

/* -------------------------------------------------------------------------- */
/* Jobs (async job tracking — BE-07)                                          */
/* -------------------------------------------------------------------------- */

export interface JobDoc extends Document {
  jobId: string;
  type: string;
  tenantKey: string;
  parentResourceId: string;
  status: string; // queued | in_flight | done | failed
  result: Record<string, unknown> | null;
  error: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

const jobSchema = new Schema<JobDoc>({
  jobId: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true },
  tenantKey: { type: String, required: true },
  parentResourceId: { type: String, required: true },
  status: { type: String, default: "queued" },
  result: Schema.Types.Mixed,
  error: String,
  idempotencyKey: { type: String, sparse: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

/* -------------------------------------------------------------------------- */
/* Counter (atomic numbering — replaces countDocuments, BE-02 step 4)         */
/* -------------------------------------------------------------------------- */

export interface CounterDoc extends Document {
  name: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

/* -------------------------------------------------------------------------- */
/* Chain events (indexer — unique by chain/tx/log/emitter)                   */
/* -------------------------------------------------------------------------- */

export interface ChainEventDoc extends Document {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  emitter: string;
  eventName: string;
  decodedArgs: Record<string, unknown>;
  seenAt: string;
}

const chainEventSchema = new Schema<ChainEventDoc>({
  chainId: { type: Number, required: true },
  txHash: { type: String, required: true },
  logIndex: { type: Number, required: true },
  blockNumber: { type: Number, required: true },
  emitter: { type: String, required: true },
  eventName: { type: String, required: true },
  decodedArgs: Schema.Types.Mixed,
  seenAt: { type: String, default: () => new Date().toISOString() },
});
chainEventSchema.index({ chainId: 1, txHash: 1, logIndex: 1 }, { unique: true });

/* -------------------------------------------------------------------------- */
/* Meta (cursor, heartbeat)                                                   */
/* -------------------------------------------------------------------------- */

export interface MetaDoc extends Document {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
}

const metaSchema = new Schema<MetaDoc>({
  key: { type: String, required: true, unique: true },
  value: Schema.Types.Mixed,
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

/* -------------------------------------------------------------------------- */
/* Agent layer (PRD Addendum A / FIN-110, FIN-120, FIN-131)                   */
/*                                                                            */
/* Three append-only collections: PolicyClause (authored offline, FIN-110),   */
/* DraftFrame (the verdict-free decision frame, FIN-120), and ModelCall       */
/* (the corpus log — every model call recorded for audit + replay, FIN-131).  */
/* All agent-authored payloads are strict:'throw' so smuggled fields fail.    */
/* -------------------------------------------------------------------------- */

export interface PolicyClauseDoc extends Document {
  schemaVersion: number;
  clauseId: string;
  packRef: string; // hashed EvidenceItem this clause belongs to
  clauseNumber: number; // 0 = governing-law row; 4/7/9 = numbered clauses
  text: string;
  parameters: { hours?: number; days?: number };
  lawLines?: {
    note: string;
    text: string;
    jurisdiction: string;
    author: string;
    reviewRef: string;
    version: number;
    sourceRefs: { cite: string; url: string }[];
  }[]; // the law library — on the clauseNumber 0 row (FIN-112)
  disclaimer?: string; // rendered wherever the pack is cited
  jurisdiction?: string;
  author: string;
  reviewRef: string;
  version: number;
  createdAt: string;
}
const POLICY_CLAUSE_IMMUTABLE = [
  "schemaVersion", "clauseId", "packRef", "clauseNumber", "text", "parameters", "lawLines", "disclaimer", "jurisdiction", "author", "reviewRef", "version",
];
const policyClauseSchema = new Schema<PolicyClauseDoc>(
  {
    schemaVersion: { type: Number, default: 1 },
    clauseId: { type: String, required: true, unique: true, index: true },
    packRef: { type: String, required: true, index: true },
    clauseNumber: { type: Number, required: true },
    text: { type: String, required: true },
    parameters: {
      type: new Schema(
        { hours: Number, days: Number },
        { _id: false },
      ),
      default: {},
    },
    // The law library (FIN-112). Present on the clauseNumber 0 row; omitted on
    // numbered clauses. Sub-documents are _id-less so the row reads as data.
    lawLines: {
      type: [
        new Schema(
          {
            note: { type: String, required: true },
            text: { type: String, required: true },
            jurisdiction: { type: String, required: true },
            author: { type: String, required: true },
            reviewRef: { type: String, required: true },
            version: { type: Number, required: true },
            sourceRefs: {
              type: [{ cite: { type: String, required: true }, url: { type: String, required: true } }],
              default: [],
            },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    disclaimer: { type: String, default: undefined },
    jurisdiction: String,
    author: { type: String, required: true },
    reviewRef: { type: String, required: true },
    version: { type: Number, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: "v1_policy_clauses", strict: "throw" },
);
appendOnly(policyClauseSchema, "PolicyClause", POLICY_CLAUSE_IMMUTABLE);

export interface DraftFrameDoc extends Document {
  frameId: string;
  caseId: string;
  questions: { text: string; findingRefs: string[]; provenance: string }[];
  requirements: {
    outcome: string;
    templateId: string;
    filledParams: Record<string, string>;
    provenance: string;
  }[];
  unresolved: { kind: string; refs: string[]; provenance: string }[];
  modelDigest: { model: string; id: string; digest: string } | null;
  citationDepth: { platform: number; recipient: number };
  generatedAt: string;
  degradeLevel: number; // 0=full, 1=no questions, 2=no frame
  createdAt: string;
}
const DRAFT_FRAME_IMMUTABLE = [
  "frameId", "caseId", "questions", "requirements", "unresolved", "citationDepth", "modelDigest", "generatedAt", "degradeLevel",
];
const draftFrameSchema = new Schema<DraftFrameDoc>(
  {
    frameId: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, required: true, index: true },
    questions: [{
      text: String,
      findingRefs: [String],
      provenance: { type: String, default: "model" },
    }],
    requirements: [{
      outcome: String,
      templateId: String,
      filledParams: { type: Schema.Types.Mixed, default: {} },
      provenance: { type: String, default: "template" },
    }],
    unresolved: [{
      kind: String,
      refs: [String],
      provenance: { type: String, default: "computed" },
    }],
    modelDigest: Schema.Types.Mixed, // null when degraded to templates-only
    citationDepth: {
      type: new Schema({ platform: Number, recipient: Number }, { _id: false }),
      default: { platform: 0, recipient: 0 },
    },
    generatedAt: { type: String, required: true },
    degradeLevel: { type: Number, default: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: "v1_draft_frames", strict: "throw" },
);
appendOnly(draftFrameSchema, "DraftFrame", DRAFT_FRAME_IMMUTABLE);

/**
 * Corpus log (FIN-131) — every model call records input hash, model id+digest,
 * output, validation result, and (later) the human's action reference. Append-
 * only; in-place edits rejected. This is both the audit trail now and the
 * labelled training set for fine-tuned small models later (Addendum §H).
 */
export interface ModelCallDoc extends Document {
  callId: string;
  task: string; // e.g. "frame.turning_questions", "narrative.summary"
  modelDigest: { model: string; id: string; digest: string };
  inputHash: string; // keccak256 of canonicalized input
  output: string | null; // null on degrade
  validation: "ok" | "degraded" | "blocked_by_filter" | "parse_failed" | "timeout" | "error";
  humanActionRef: string | null; // FK to the reviewer action (filled later)
  createdAt: string;
}
const MODEL_CALL_IMMUTABLE = [
  "callId", "task", "modelDigest", "inputHash", "output", "validation", "createdAt",
];
const modelCallSchema = new Schema<ModelCallDoc>(
  {
    callId: { type: String, required: true, unique: true, index: true },
    task: { type: String, required: true, index: true },
    modelDigest: {
      type: new Schema(
        { model: String, id: String, digest: String },
        { _id: false },
      ),
      required: true,
    },
    inputHash: { type: String, required: true },
    output: String,
    validation: { type: String, required: true },
    humanActionRef: String,
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: "v1_model_calls", strict: "throw" },
);
appendOnly(modelCallSchema, "ModelCall", MODEL_CALL_IMMUTABLE);

/**
 * Frame-line action log (FIN-127) — the reviewer's per-line action (accept /
 * edit / discard) on a frame line, stored with the line's provenance. For an
 * edit, the edited text is kept ALONGSIDE the original. Append-only corpus.
 */
export interface FrameActionDoc extends Document {
  actionId: string;
  caseId: string;
  callId: string | null; // the model call that produced the line, if model-origin
  lineId: string; // the frame line's ref (findingRef / templateId / unresolved kind)
  action: "accept" | "edit" | "discard";
  provenance: "template" | "computed" | "model";
  originalText: string; // the line as the agent rendered it
  editedText: string | null; // null unless action == "edit"
  createdAt: string;
}
const FRAME_ACTION_IMMUTABLE = [
  "actionId", "caseId", "callId", "lineId", "action", "provenance", "originalText", "editedText", "createdAt",
];
const frameActionSchema = new Schema<FrameActionDoc>(
  {
    actionId: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, required: true, index: true },
    callId: { type: String, default: null, index: true },
    lineId: { type: String, required: true },
    action: { type: String, required: true, enum: ["accept", "edit", "discard"] },
    provenance: { type: String, required: true, enum: ["template", "computed", "model"] },
    originalText: { type: String, required: true },
    editedText: { type: String, default: null },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { collection: "v1_frame_actions", strict: "throw" },
);
appendOnly(frameActionSchema, "FrameAction", FRAME_ACTION_IMMUTABLE);

/* -------------------------------------------------------------------------- */
/* Model registration (guard against re-registration on hot reload)          */
/* -------------------------------------------------------------------------- */

const registered = new Set<string>();
function register<T extends Document>(name: string, schema: Schema<T>): mongoose.Model<T> {
  if (registered.has(name)) return mongoose.model<T>(name);
  registered.add(name);
  return mongoose.model<T>(name, schema);
}

export const Tenant = register<TenantDoc>("v1_Tenant", tenantSchema);
export const Payment = register<PaymentDoc>("v1_Payment", paymentSchema);
export const Case = register<CaseDoc>("v1_Case", caseSchema);
export const Evidence = register<EvidenceDoc>("v1_Evidence", evidenceSchema);
export const Response = register<ResponseDoc>("v1_Response", responseSchema);
export const Decision = register<DecisionDoc>("v1_Decision", decisionSchema);
export const Correction = register<CorrectionDoc>("v1_Correction", correctionSchema);
export const ProofRun = register<ProofRunDoc>("v1_ProofRun", proofRunSchema);
export const Analysis = register<AnalysisDoc>("v1_Analysis", analysisSchema);
export const Invitation = register<InvitationDoc>("v1_Invitation", invitationSchema);
export const Job = register<JobDoc>("v1_Job", jobSchema);
export const Counter = register<CounterDoc>("v1_Counter", counterSchema);
export const ChainEvent = register<ChainEventDoc>("v1_ChainEvent", chainEventSchema);
export const Meta = register<MetaDoc>("v1_Meta", metaSchema);
// Agent layer (PRD Addendum A)
export const PolicyClause = register<PolicyClauseDoc>("v1_PolicyClause", policyClauseSchema);
export const DraftFrame = register<DraftFrameDoc>("v1_DraftFrame", draftFrameSchema);
export const ModelCall = register<ModelCallDoc>("v1_ModelCall", modelCallSchema);
export const FrameAction = register<FrameActionDoc>("v1_FrameAction", frameActionSchema);

/* -------------------------------------------------------------------------- */
/* Atomic counter helper (BE-02 step 4 — replaces countDocuments)             */
/* -------------------------------------------------------------------------- */

export async function nextSeq(name: string): Promise<number> {
  const result = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return result!.seq;
}
