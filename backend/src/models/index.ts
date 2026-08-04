import mongoose, { Schema, type Model } from "mongoose";
import { appendOnly } from "./appendOnly.ts";

/* ============================================================================
   The 12 Mongo collections (PRD §9.1). References are by business key
   (paymentId, caseNumber, platformKey, recipientKey) — not ObjectId — so
   records stay meaningful when exported. Amounts are decimal strings (§9.1);
   timestamps are ISO-8601 strings (keeps canonical hashing byte-stable).

   Schemas use explicit `new Schema<any>()` (PRD §18.4, D9: mongoose 8.9.5 —
   newer versions stack-overflow tsc on these schemas).
   ========================================================================== */

export interface PlatformDoc {
  key: string;
  name: string;
  payWallet: string;
  refundAddress: string;
  arbiterAddress: string;
  arbiterName: string;
  policySummary: string;
  policyLockupSeconds: number;
  policyResponseWindowHours: number;
}
const platformSchema = new Schema<PlatformDoc>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    payWallet: String,
    refundAddress: String,
    arbiterAddress: String,
    arbiterName: String,
    policySummary: String,
    policyLockupSeconds: Number,
    policyResponseWindowHours: Number,
  },
  { collection: "platforms", timestamps: false },
);

export interface RecipientDoc {
  key: string;
  displayName: string;
  walletAddress: string;
  platformKey: string;
}
const recipientSchema = new Schema<RecipientDoc>(
  {
    key: { type: String, required: true, unique: true },
    displayName: String,
    walletAddress: { type: String, index: true },
    platformKey: String,
  },
  { collection: "recipients" },
);

export interface WorkOrderDoc {
  platformKey: string;
  recipientKey: string;
  description: string;
  deliverables: { name: string; due: string; acceptanceCriteria: string }[];
  amount: string;
  currency: "USDC";
  status: "open" | "closed";
  /** The on-chain payment ID this work order is linked to (set after pay()
   * confirms, by the metadata endpoint). Indexed so getSharedReceipt resolves
   * it directly — no name-matching against seeded data. */
  paymentId: string | null;
}
const workOrderSchema = new Schema<WorkOrderDoc>(
  {
    platformKey: String,
    recipientKey: String,
    description: String,
    deliverables: [{ name: String, due: String, acceptanceCriteria: String }],
    amount: String,
    currency: String,
    status: String,
    paymentId: { type: String, default: null, index: true },
  },
  { collection: "workorders" },
);

export interface PayoutDoc {
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
  // mutable lifecycle appendices
  registryAnchorTx: string | null;
  refundTxHash: string | null;
  withdrawTxHash: string | null;
}
const PAYOUT_IMMUTABLE = [
  "paymentId", "chain", "contractAddress", "txHash", "amount", "refundTo",
  "platformKey", "recipientKey", "recipientWallet", "workOrderRef", "trancheIndex",
  "disputeDeadline", "lockupEnd", "receiptHash", "paidAt",
];
const payoutSchema = new Schema<PayoutDoc>(
  {
    paymentId: { type: String, required: true, unique: true, index: true },
    chain: String,
    contractAddress: String,
    txHash: String,
    amount: String,
    refundTo: String,
    platformKey: String,
    recipientKey: String,
    recipientWallet: String,
    workOrderRef: { type: Schema.Types.Mixed, default: null },
    trancheIndex: { type: Schema.Types.Mixed, default: null },
    disputeDeadline: String,
    lockupEnd: String,
    paidAt: String,
    status: { type: String, default: "ESCROWED" },
    receiptHash: String,
    registryAnchorTx: { type: String, default: null },
    refundTxHash: { type: String, default: null },
    withdrawTxHash: { type: String, default: null },
  },
  { collection: "payouts" },
);
appendOnly(payoutSchema, "Payout", PAYOUT_IMMUTABLE);

export interface EvidenceDoc {
  caseRef: string | null;
  payoutRef: string | null;
  submittedBy: "platform" | "recipient" | "agent";
  type: string;
  title: string;
  fileOrText: string;
  sha256: string;
  submittedAt: string;
  // UI helpers (not canonical-content)
  showOnlyAfterReply?: boolean;
  kind?: "doc" | "video";
}
const EVIDENCE_IMMUTABLE = [
  "caseRef", "payoutRef", "submittedBy", "type", "title", "fileOrText", "sha256", "submittedAt",
];
const evidenceSchema = new Schema<EvidenceDoc>(
  {
    caseRef: { type: String, index: true, default: null },
    payoutRef: { type: String, index: true, default: null },
    submittedBy: String,
    type: String,
    title: String,
    fileOrText: String,
    sha256: String,
    submittedAt: String,
    showOnlyAfterReply: { type: Boolean, default: false },
    kind: { type: String, default: "doc" },
  },
  { collection: "evidence" },
);
appendOnly(evidenceSchema, "Evidence", EVIDENCE_IMMUTABLE);

export interface CaseDoc {
  caseNumber: string;
  caseCode: string; // readable, auto-derived: e.g. NORT-MAYA-001 (display/search friendly)
  payoutRef: string;
  openedBy: "platform" | "recipient";
  allegationClaimType: string;
  allegationFreeText: string;
  allegationAmountContested: string;
  status: string;
  infoRequestCount: number;
  infoRequests: { target: string; text: string; requestedAt: string; answeredAt: string | null }[];
  responseDeadline: string;
  caseHash: string;
  openedAt: string;
  registryAnchorTx: string | null;
}
const caseSchema = new Schema<CaseDoc>(
  {
    caseNumber: { type: String, required: true, unique: true, index: true },
    caseCode: { type: String, index: true, default: "" },
    payoutRef: { type: String, index: true },
    openedBy: String,
    allegationClaimType: String,
    allegationFreeText: String,
    allegationAmountContested: String,
    status: { type: String, default: "OPEN" },
    infoRequestCount: { type: Number, default: 0 },
    infoRequests: [{ target: String, text: String, requestedAt: String, answeredAt: { type: String, default: null } }],
    responseDeadline: String,
    caseHash: String,
    openedAt: String,
    registryAnchorTx: { type: String, default: null },
  },
  { collection: "cases" },
);

export interface ResponseDoc {
  caseRef: string;
  author: "recipient" | "platform";
  authorName: string;
  text: string;
  evidenceRefs: string[];
  submittedAt: string;
}
const responseSchema = new Schema<ResponseDoc>(
  {
    caseRef: { type: String, index: true },
    author: String,
    authorName: String,
    text: String,
    evidenceRefs: [String],
    submittedAt: String,
  },
  { collection: "responses" },
);

export interface BriefDoc {
  caseRef: string | null;
  payoutRef: string;
  version: number;
  checks: { check: string; expected: string; found: string; result: string }[];
  inconsistencies: string[];
  missingItems: string[];
  generatedAt: string;
  agentVersion: string;
}
const briefSchema = new Schema<BriefDoc>(
  {
    caseRef: { type: String, index: true, default: null },
    payoutRef: { type: String, index: true },
    version: { type: Number, required: true },
    checks: [{ check: String, expected: String, found: String, result: String }],
    inconsistencies: [String],
    missingItems: [String],
    generatedAt: String,
    agentVersion: String,
  },
  { collection: "briefs", strict: "throw" }, // P1 second layer: rejects unknown fields
);

export interface DecisionDoc {
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
const DECISION_IMMUTABLE = [
  "caseRef", "outcome", "decidedByName", "decidedByWallet", "reason", "decidedAt", "decisionHash",
];
const decisionSchema = new Schema<DecisionDoc>(
  {
    caseRef: { type: String, index: true },
    outcome: String,
    decidedByName: String,
    decidedByWallet: String,
    reason: { type: String, required: true, minlength: 20 },
    decidedAt: String,
    decisionHash: String,
    refundTxHash: { type: String, default: null },
    executedAt: { type: String, default: null },
    registryAnchorTx: { type: String, default: null },
  },
  { collection: "decisions" },
);
appendOnly(decisionSchema, "Decision", DECISION_IMMUTABLE);

export interface ChainEventDoc {
  txHash: string;
  logIndex: number;
  block: number;
  contract: string;
  eventName: string;
  decodedArgs: Record<string, unknown>;
  seenAt: string;
}
const chainEventSchema = new Schema<ChainEventDoc>(
  {
    txHash: { type: String, required: true },
    logIndex: Number,
    block: Number,
    contract: String,
    eventName: String,
    decodedArgs: Schema.Types.Mixed,
    seenAt: String,
  },
  { collection: "chainevents" },
);
chainEventSchema.index({ txHash: 1, logIndex: 1 }, { unique: true });

export interface AnchorJobDoc {
  kind: "receipt" | "case" | "decision";
  entityId: string;
  paymentId: string;
  hash: string;
  disputeDeadline: number;
  outcome: number;
  status: "queued" | "in_flight" | "done" | "failed";
  attempts: number;
  lastError: string | null;
  anchorTx: string | null;
  // Reliability fields (GAP-B5): leasing prevents two replicas double-anchoring;
  // nextAttemptAt implements exponential backoff on failure.
  leaseOwner: string | null;
  leasedUntil: string | null;
  nextAttemptAt: string | null;
}
const anchorJobSchema = new Schema<AnchorJobDoc>(
  {
    kind: String,
    entityId: String,
    paymentId: String,
    hash: String,
    disputeDeadline: Number,
    outcome: { type: Number, default: 0 },
    status: { type: String, default: "queued" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    anchorTx: { type: String, default: null },
    leaseOwner: { type: String, default: null },
    leasedUntil: { type: String, default: null },
    nextAttemptAt: { type: String, default: null },
  },
  { collection: "anchorjobs" },
);

export interface MetaDoc {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
}
const metaSchema = new Schema<MetaDoc>(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
    updatedAt: String,
  },
  { collection: "metas" },
);

export interface UserDoc {
  email: string;
  passwordHash?: string; // optional: wallet-login users have no password
  role: "reviewer" | "recipient" | "platform_viewer";
  // The UI seat this wallet is bound to (arbiter/merchant/customer/platform).
  // Distinct from `role`: arbiter and merchant both map to backend `reviewer`,
  // so without `seat` the same wallet could be reused across those two seats.
  seat: string | null;
  displayName: string;
  platformKey: string;
  walletAddress: string | null;
}
const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: false },
    role: { type: String, required: true },
    seat: { type: String, default: null },
    displayName: String,
    platformKey: String,
    walletAddress: { type: String, default: null },
  },
  { collection: "users" },
);
// A wallet address uniquely owns one user account — but only when a wallet is
// actually linked. A partial unique index (vs `unique + sparse`) excludes null
// entirely, so many wallet-less users can coexist while one wallet still maps
// to exactly one user.
userSchema.index(
  { walletAddress: 1 },
  { unique: true, partialFilterExpression: { walletAddress: { $type: "string" } } },
);

export interface NotificationDoc {
  type: string;
  title: string;
  body: string;
  caseNumber: string | null;
  paymentId: string | null;
  audienceRole: string;
  platformKey: string | null;
  recipientWallet: string | null;
  readAt: string | null;
  createdAt: string;
}
const notificationSchema = new Schema<NotificationDoc>(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    caseNumber: { type: String, default: null },
    paymentId: { type: String, default: null },
    audienceRole: { type: String, required: true },
    platformKey: { type: String, default: null },
    recipientWallet: { type: String, default: null },
    readAt: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { collection: "notifications" },
);
notificationSchema.index({ audienceRole: 1, readAt: 1, createdAt: -1 });

/* ---- address book (per-user saved wallets for the New Payout flow) ---- */
export interface AddressBookEntryDoc {
  ownerUserId: string; // the user who saved this entry (User._id as string)
  side: "from" | "to"; // from = refund/treasury wallet, to = recipient
  label: string;
  address: string;
  createdAt: string;
}
const addressBookEntrySchema = new Schema<AddressBookEntryDoc>(
  {
    ownerUserId: { type: String, required: true },
    side: { type: String, required: true, enum: ["from", "to"] },
    label: { type: String, default: "" },
    address: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "address_book" },
);
addressBookEntrySchema.index({ ownerUserId: 1, side: 1 });

/* ---- model registry (guard against re-registration across hot reloads / test imports) ---- */
function register<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}
export const Platform = register<PlatformDoc>("Platform", platformSchema);
export const Recipient = register<RecipientDoc>("Recipient", recipientSchema);
export const WorkOrder = register<WorkOrderDoc>("WorkOrder", workOrderSchema);
export const Payout = register<PayoutDoc>("Payout", payoutSchema);
export const Evidence = register<EvidenceDoc>("Evidence", evidenceSchema);
export const Case = register<CaseDoc>("Case", caseSchema);
export const Response = register<ResponseDoc>("Response", responseSchema);
export const Brief = register<BriefDoc>("Brief", briefSchema);
export const Decision = register<DecisionDoc>("Decision", decisionSchema);
export const ChainEvent = register<ChainEventDoc>("ChainEvent", chainEventSchema);
export const AnchorJob = register<AnchorJobDoc>("AnchorJob", anchorJobSchema);
export const Meta = register<MetaDoc>("Meta", metaSchema);
export const User = register<UserDoc>("User", userSchema);
export const Notification = register<NotificationDoc>("Notification", notificationSchema);
export const AddressBookEntry = register<AddressBookEntryDoc>("AddressBookEntry", addressBookEntrySchema);
