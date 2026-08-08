/* ============================================================================
   v1 service layer — the business logic for the registrar product loop.
   Drives the @finne/domain state machines, builds canonical envelopes, and
   enqueues registry writes + jobs. Routes stay thin.
   ========================================================================== */

import {
  applyPaymentEvent, applyCaseEvent,
  type PaymentState, type CaseState,
  type DecisionOutcome, outcomeRequiresCorrection,
  IllegalTransitionError,
  generateId, caseDisplayNumber,
  isChallengeWithinBounds,
} from "@finne/domain";
import {
  Payment, Case, Evidence, Response as ResponseModel, Decision, Correction,
  Analysis, Counter, PolicyClause,
} from "./models.ts";
import { AnchorJob, type AnchorJobKind } from "../models/index.ts";
import { getLatestFrame } from "../agent/frame-assembly.ts";
import { DEMO_PACK_REF } from "../seed/policy-pack.ts";
import { NORTHWIND_PACK_REF } from "../seed/northwind-pack.ts";
import { getFrameStatus } from "./frameStatus.ts";
import { buildCaseContext } from "./caseContext.ts";

/** Load the demo policy-pack clauses (for the case-room evidence list, FIN-115). */
async function getDemoClauses() {
  try {
    const rows = await PolicyClause.find({ packRef: DEMO_PACK_REF }).sort({ clauseNumber: 1 }).lean();
    return rows;
  } catch {
    return [];
  }
}

/**
 * Load the policy clauses applicable to a case. Packs are isolated by packRef
 * (clause numbers are unique within a pack and disjoint across packs, so a
 * finding's clauseRef + pack together name exactly one clause).
 *
 * Resolution: prefer the Northwind × Kestrel scenario pack when present; fall
 * back to the demo Northstar pack otherwise. This surfaces the scenario's ToS
 * clauses + its top-3 governing-law pointers (the clauseNumber===0 law-line
 * family) without a per-case pack-ref field on the Case document. If the
 * scenario pack isn't seeded, behaviour is unchanged (demo clauses render).
 */
async function getCaseClauses(): Promise<
  Array<{ clauseId: string; clauseNumber: number; text: string; parameters: Record<string, unknown>; jurisdiction?: string }>
> {
  try {
    const scenarioRows = await PolicyClause.find({ packRef: NORTHWIND_PACK_REF }).sort({ clauseNumber: 1 }).lean();
    if (scenarioRows.length > 0) return scenarioRows as Array<{ clauseId: string; clauseNumber: number; text: string; parameters: Record<string, unknown>; jurisdiction?: string }>;
    return await getDemoClauses();
  } catch {
    return await getDemoClauses();
  }
}
import {
  buildReceiptEnvelope, buildClaimEnvelope, buildResponseEnvelope,
  buildDecisionEnvelope, buildCorrectionInstructionEnvelope,
} from "./canonical.ts";
import {
  ApiError, illegalTransition, notFound, validationError, idempotencyConflict,
} from "./errors.ts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function asStateError(e: unknown): ApiError {
  if (e instanceof IllegalTransitionError) return illegalTransition(e.message);
  if (e instanceof ApiError) return e;
  return illegalTransition(e instanceof Error ? e.message : "Illegal transition.");
}

/** Allocate a collision-safe case number via the atomic counter. */
export async function allocateCaseNumber(): Promise<string> {
  const seq = await nextSeq("case_number");
  return caseDisplayNumber(141 + seq); // first case = CASE-0142
}

export async function nextSeq(name: string): Promise<number> {
  return Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).then((r) => r!.seq);
}

/* -------------------------------------------------------------------------- */
/* Registry anchor queue (CON-01→04)                                          */
/* -------------------------------------------------------------------------- */
/*
 * Enqueues a hash-anchor job for the anchor worker to post to FinneCaseRegistry.
 * The worker (backend/src/anchorWorker.ts) drains the queue and signs each tx
 * with the registry operator key (PLATFORM_ROLE + REVIEWER_ROLE + AGENT_ROLE).
 * Idempotent-ish: duplicate enqueues for the same {kind, entityId} are tolerated
 * — the contract rejects the second (e.g. ReceiptAlreadyRegistered) and the job
 * dead-letters without affecting the canonical record, which is already on chain.
 *
 * NOTE: payments and cases use opaque string ids internally (pay_…, case_…). The
 * registry keys on uint256 ids. We derive a stable uint256 from the string via a
 * lossless keccak-based fold (string → bytes32 → uint256) so the same paymentId
 * always maps to the same on-chain id. The hash already carries the canonical
 * content; this id is only a collision-free lookup key.
 */
import { keccak256, stringToBytes } from "viem";

/** Map an opaque string id to a stable uint256 the registry can key on. */
function idToUint256(id: string): string {
  // keccak256 of the utf-8 id → uint256. Stable + collision-resistant. The
  // contract stores it as a plain mapping key; content integrity comes from the
  // anchored hash, not this id.
  return BigInt(keccak256(stringToBytes(id))).toString();
}

/**
 * Map the domain DecisionOutcome string to the on-chain Outcome enum (1–4).
 * The order matches FinneCaseRegistry.sol exactly (CON-01):
 *   1 RECIPIENT_UPHELD · 2 PLATFORM_UPHELD · 3 PARTIAL_PLATFORM_UPHELD · 4 DISMISSED
 */
const OUTCOME_CODE: Record<DecisionOutcome, number> = {
  RECIPIENT_UPHELD: 1,
  PLATFORM_UPHELD: 2,
  PARTIAL_PLATFORM_UPHELD: 3,
  DISMISSED_INSUFFICIENT_EVIDENCE: 4,
};

async function enqueueAnchor(
  kind: AnchorJobKind,
  entityId: string,
  hash: string,
  args: Record<string, unknown> = {},
): Promise<void> {
  await AnchorJob.create({
    kind,
    entityId,
    paymentId: (args.paymentId as string) ?? entityId,
    hash,
    disputeDeadline: 0,
    outcome: (args.outcome as number) ?? 0,
    args,
    status: "queued",
    attempts: 0,
    lastError: null,
    anchorTx: null,
  }).catch((e) => {
    // Enqueue must never break the product flow — the hash is already in the DB
    // and verifiable; the anchor is the durable extra. Log and move on.
    console.error(`[v1] enqueueAnchor(${kind} ${entityId}) failed:`, e instanceof Error ? e.message : e);
  });
}

/* -------------------------------------------------------------------------- */
/* Payment / receipt (PAY-01, PAY-04)                                         */
/* -------------------------------------------------------------------------- */

export interface CreatePaymentInput {
  tenantKey: string;
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
  policyVersion: string;
  policyHash: string;
}

/**
 * Create a verified payment + build its receipt envelope (PAY-01).
 * Idempotent on txHash — replaying the same tx returns the existing payment.
 */
export async function createVerifiedPayment(input: CreatePaymentInput) {
  // Idempotent: if this txHash already created a payment, return it
  const existing = await Payment.findOne({ txHash: input.txHash });
  if (existing) return { payment: existing, created: false };

  const paymentId = generateId("pay");
  const payment = new Payment({
    ...input,
    paymentId,
    state: "VERIFIED" as PaymentState,
    sourceLabel: input.finalized ? "VERIFIED_TRANSFER" : "OFFCHAIN_FIXTURE",
    receiptHash: null,
    proofRunHash: null,
    anchorTxHash: null,
    schemaVersion: 1,
  });
  await payment.save();

  // Build the receipt envelope + hash
  const envelope = buildReceiptEnvelope({
    schemaVersion: 1 as const,
    paymentId,
    chainId: input.chainId,
    txHash: input.txHash,
    payer: input.payer,
    recipient: input.recipient,
    token: input.token,
    amountMicroUsdc: input.amountMicroUsdc,
    paidAt: input.paidAt,
    items: input.items,
    policyVersion: input.policyVersion,
    policyHash: input.policyHash,
  });
  payment.receiptHash = envelope.receiptHash;
  await payment.save();

  // Anchor the receipt hash on FinneCaseRegistry (CON-02). Fire-and-forget: the
  // hash is already persisted + verifiable; the on-chain anchor is the durable
  // extra the worker posts with the registry operator key.
  await enqueueAnchor("receipt", idToUint256(paymentId), envelope.receiptHash, {
    paymentId: idToUint256(paymentId),
    payer: input.payer,
    recipient: input.recipient,
    amountMicroUsdc: input.amountMicroUsdc,
    paidAt: Math.floor(new Date(input.paidAt).getTime() / 1000),
  });

  return { payment, created: true };
}

/**
 * Explicitly enqueue a receipt anchor for an existing payment. Used by the
 * POST /v1/payments/:paymentId/anchors route for backfill / re-anchor. Looks up
 * the stored receipt hash + payment fields and enqueues a registerReceipt job.
 * No-op if the payment has no receiptHash yet.
 */
export async function enqueueReceiptAnchor(paymentId: string): Promise<void> {
  const payment = await Payment.findOne({ paymentId });
  if (!payment) throw notFound("Payment not found.");
  if (!payment.receiptHash) return;
  await enqueueAnchor("receipt", idToUint256(paymentId), payment.receiptHash, {
    paymentId: idToUint256(paymentId),
    payer: payment.payer,
    recipient: payment.recipient,
    amountMicroUsdc: payment.amountMicroUsdc,
    paidAt: Math.floor(new Date(payment.paidAt).getTime() / 1000),
  });
}

/** Get a payment + its receipt detail. */
export async function getPaymentDetail(paymentId: string, tenantKey?: string) {
  const payment = await Payment.findOne({ paymentId });
  if (!payment) throw notFound("Payment not found.");
  if (tenantKey && payment.tenantKey !== tenantKey) throw notFound("Payment not found.");
  return payment;
}

/** List payments (tenant-scoped). */
export async function listPayments(tenantKey?: string) {
  const filter = tenantKey ? { tenantKey } : {};
  return Payment.find(filter).sort({ paidAt: -1 }).lean();
}

/* -------------------------------------------------------------------------- */
/* Cases (CASE-01, CASE-02)                                                   */
/* -------------------------------------------------------------------------- */

export interface OpenCaseInput {
  paymentId: string;
  tenantKey: string;
  openedBy: string;
  claimType: string;
  allegation: string;
  challengedAmountMicroUsdc: string;
  citedEvidenceIds: string[];
  policyVersion: string;
  responseWindowHours: number;
}

/**
 * Open a bounded case (CASE-01).
 * Validates: receipt exists + anchored, 0 < challenge ≤ payment amount.
 */
export async function openCase(input: OpenCaseInput) {
  const payment = await Payment.findOne({ paymentId: input.paymentId });
  if (!payment) throw notFound("Payment not found.");
  if (payment.state !== "ANCHORED" && payment.state !== "VERIFIED") {
    throw illegalTransition(`A payment that is ${payment.state} cannot have a case opened.`);
  }

  // Validate challenge bounds
  const challenge = BigInt(input.challengedAmountMicroUsdc);
  const total = BigInt(payment.amountMicroUsdc);
  if (!isChallengeWithinBounds(challenge, total)) {
    throw validationError(`Challenge amount must be 0 < amount ≤ ${payment.amountMicroUsdc}.`);
  }

  // Check no existing active case
  const existing = await Case.findOne({ paymentId: input.paymentId, state: { $in: ["OPEN", "RESPONDED", "UNDER_REVIEW", "EVIDENCE_REQUESTED", "DECIDED", "CORRECTION_OUTSTANDING"] } });
  if (existing) throw idempotencyConflict("An active case already exists for this payment.");

  const caseId = generateId("case");
  const caseNumber = await allocateCaseNumber();
  const openedAt = new Date().toISOString();
  const responseDueAt = new Date(Date.now() + input.responseWindowHours * 3600_000).toISOString();

  // Build the claim envelope + hash
  const envelope = buildClaimEnvelope({
    schemaVersion: 1 as const,
    caseId,
    paymentId: input.paymentId,
    claimType: input.claimType,
    allegation: input.allegation,
    challengedAmountMicroUsdc: input.challengedAmountMicroUsdc,
    responseDueAt,
    policyVersion: input.policyVersion,
    openedAt,
    openedBy: input.openedBy,
    citedEvidenceIds: input.citedEvidenceIds,
  });

  // Transition the payment state machine. Cases can be opened from VERIFIED
  // (the indexer/import verified the transfer) or ANCHORED (the receipt hash
  // was anchored). If VERIFIED, we transition through the proof/anchor states
  // implicitly — the receipt is considered proven by the verified transfer.
  try {
    if (payment.state === "VERIFIED") {
      // Allow direct case opening from VERIFIED — the verified transfer IS the proof.
      payment.state = "DISPUTED" as PaymentState;
    } else {
      payment.state = applyPaymentEvent(payment.state as PaymentState, "dispute_opened");
    }
  } catch (e) {
    throw asStateError(e);
  }

  const caseDoc = new Case({
    caseId,
    caseNumber,
    paymentId: input.paymentId,
    tenantKey: input.tenantKey,
    state: "OPEN",
    claimType: input.claimType,
    allegation: input.allegation,
    challengedAmountMicroUsdc: input.challengedAmountMicroUsdc,
    citedEvidenceIds: input.citedEvidenceIds,
    policyVersion: input.policyVersion,
    claimHash: envelope.claimHash,
    openedAt,
    openedBy: input.openedBy,
    responseDueAt,
    infoRequestCount: 0,
    anchorTxHash: null,
    responseHash: null,
    analysisHash: null,
    analysisVersion: null,
    outcome: null,
    correctionAmountMicroUsdc: null,
    decisionHash: null,
    decidedBy: null,
    decidedAt: null,
    correctionHash: null,
    closedAt: null,
    schemaVersion: 1,
  });

  await Promise.all([caseDoc.save(), payment.save()]);

  // Anchor the claim hash on FinneCaseRegistry (CON-02). The registry needs the
  // receipt already registered — it is, via createVerifiedPayment above (or a
  // prior anchor). Fire-and-forget.
  await enqueueAnchor("case", idToUint256(caseId), envelope.claimHash, {
    paymentId: idToUint256(input.paymentId),
    challengedAmountMicroUsdc: input.challengedAmountMicroUsdc,
    responseDueAt: Math.floor(new Date(responseDueAt).getTime() / 1000),
  });

  // Auto-run the agent pipeline (deterministic proof checks + Bedrock questions
  // + narrative). Fire-and-forget — case-open returns immediately; the reviewer
  // sees an "agents running" status (via getCaseDetail().frameStatus) until the
  // frame lands. The Bedrock calls take a few seconds; the case never blocks.
  // Lazy import to avoid a module cycle (orchestrator imports getCaseDetail).
  void import("./frameOrchestrator.ts")
    .then(({ assembleForCase }) => assembleForCase(caseId))
    .catch((e) =>
      console.error(`[openCase] auto frame-assembly failed for ${caseId}:`, e instanceof Error ? e.message : e),
    );

  return { caseDoc, claimHash: envelope.claimHash };
}

/** Submit the recipient response (CASE-02). One per case, before deadline. */
export async function submitResponse(params: {
  caseId: string;
  text: string;
  evidenceIds: string[];
  submittedBy: string;
}) {
  const caseDoc = await Case.findOne({ caseId: params.caseId });
  if (!caseDoc) throw notFound("Case not found.");

  // Must be OPEN and before the deadline
  const now = Date.now();
  if (caseDoc.state !== "OPEN") {
    throw illegalTransition(`A case that is ${caseDoc.state} cannot receive a response.`);
  }
  if (new Date(caseDoc.responseDueAt).getTime() < now) {
    throw illegalTransition("The response window has closed.");
  }
  if (caseDoc.responseHash) {
    throw idempotencyConflict("This case already has a response.");
  }

  const envelope = buildResponseEnvelope({
    schemaVersion: 1 as const,
    caseId: params.caseId,
    text: params.text,
    evidenceIds: params.evidenceIds,
    submittedAt: new Date().toISOString(),
    submittedBy: params.submittedBy,
  });

  try {
    caseDoc.state = applyCaseEvent(caseDoc.state as CaseState, "response_received");
  } catch (e) {
    throw asStateError(e);
  }
  caseDoc.responseHash = envelope.responseHash;

  const responseDoc = new ResponseModel({
    responseId: generateId("resp"),
    caseId: params.caseId,
    text: params.text,
    evidenceIds: params.evidenceIds,
    submittedBy: params.submittedBy,
    submittedAt: new Date().toISOString(),
    responseHash: envelope.responseHash,
  });

  await Promise.all([caseDoc.save(), responseDoc.save()]);

  // Anchor the response hash on FinneCaseRegistry (CON-03). The operator key
  // holds PLATFORM_ROLE so it can relay the recipient's verified response.
  await enqueueAnchor("response", idToUint256(params.caseId), envelope.responseHash, {
    submittedBy: params.submittedBy,
  });

  // T3 trigger (Addendum §C): a new reply arrived — re-run the agent pipeline so
  // the frame reflects the recipient's response. Fire-and-forget, non-blocking.
  void import("./frameOrchestrator.ts")
    .then(({ assembleForCase }) => assembleForCase(params.caseId))
    .catch((e) => console.error(`[submitResponse] auto frame-assembly failed for ${params.caseId}:`, e instanceof Error ? e.message : e));

  return { caseDoc, responseDoc };
}

/** Move case to UNDER_REVIEW (reviewer or deadline passage). */
export async function markUnderReview(caseId: string) {
  const caseDoc = await Case.findOne({ caseId });
  if (!caseDoc) throw notFound("Case not found.");
  try {
    caseDoc.state = applyCaseEvent(caseDoc.state as CaseState, "moved_to_review");
  } catch (e) {
    throw asStateError(e);
  }
  await caseDoc.save();
  return caseDoc;
}

/** Advance deadline (OPEN → UNDER_REVIEW when the window lapses). */
export async function advanceDeadline(caseId: string) {
  const caseDoc = await Case.findOne({ caseId });
  if (!caseDoc) return;
  if (caseDoc.state !== "OPEN") return;
  if (new Date(caseDoc.responseDueAt).getTime() > Date.now()) return;
  try {
    caseDoc.state = applyCaseEvent("OPEN", "deadline_passed");
    await caseDoc.save();
  } catch {
    // swallowed — idempotent
  }
}

/* -------------------------------------------------------------------------- */
/* Decisions (DEC-01)                                                         */
/* -------------------------------------------------------------------------- */

export interface RecordDecisionInput {
  caseId: string;
  outcome: DecisionOutcome;
  rationale: string;
  correctionAmountMicroUsdc: string | null;
  decidedBy: string;
  decidedByWallet: string;
}

/** Record one immutable human decision (DEC-01). */
export async function recordDecision(input: RecordDecisionInput) {
  const caseDoc = await Case.findOne({ caseId: input.caseId });
  if (!caseDoc) throw notFound("Case not found.");

  // Must be UNDER_REVIEW or EVIDENCE_REQUESTED
  if (caseDoc.state !== "UNDER_REVIEW" && caseDoc.state !== "EVIDENCE_REQUESTED") {
    throw illegalTransition(`A case that is ${caseDoc.state} cannot be decided.`);
  }
  if (caseDoc.decisionHash) throw idempotencyConflict("This case already has a decision.");

  // Enforce outcome/correction combos
  const needsCorrection = outcomeRequiresCorrection(input.outcome);
  if (needsCorrection && !input.correctionAmountMicroUsdc) {
    throw validationError(`Outcome ${input.outcome} requires a correction amount.`);
  }
  if (!needsCorrection && input.correctionAmountMicroUsdc) {
    throw validationError(`Outcome ${input.outcome} does not allow a correction.`);
  }
  if (needsCorrection && input.correctionAmountMicroUsdc) {
    const challenge = BigInt(caseDoc.challengedAmountMicroUsdc);
    const correction = BigInt(input.correctionAmountMicroUsdc);
    if (correction <= 0n || correction > challenge) {
      throw validationError(`Correction must be 0 < amount ≤ ${caseDoc.challengedAmountMicroUsdc}.`);
    }
  }

  const decidedAt = new Date().toISOString();
  const envelope = buildDecisionEnvelope({
    schemaVersion: 1 as const,
    caseId: input.caseId,
    outcome: input.outcome,
    rationale: input.rationale,
    correctionAmountMicroUsdc: input.correctionAmountMicroUsdc ?? undefined,
    decidedAt,
    decidedBy: input.decidedBy,
    decidedByWallet: input.decidedByWallet,
  });

  try {
    caseDoc.state = applyCaseEvent(caseDoc.state as CaseState, "decision_recorded");
  } catch (e) {
    throw asStateError(e);
  }
  caseDoc.outcome = input.outcome;
  caseDoc.correctionAmountMicroUsdc = input.correctionAmountMicroUsdc;
  caseDoc.decisionHash = envelope.decisionHash;
  caseDoc.decidedBy = input.decidedBy;
  caseDoc.decidedAt = decidedAt;

  const decisionDoc = new Decision({
    decisionId: generateId("dec"),
    caseId: input.caseId,
    outcome: input.outcome,
    rationale: input.rationale,
    correctionAmountMicroUsdc: input.correctionAmountMicroUsdc,
    decidedBy: input.decidedBy,
    decidedByWallet: input.decidedByWallet,
    decidedAt,
    decisionHash: envelope.decisionHash,
    anchorTxHash: null,
  });

  await Promise.all([caseDoc.save(), decisionDoc.save()]);

  // Anchor the decision hash on FinneCaseRegistry (CON-03). The contract
  // requires the case to be UNDER_REVIEW (or EVIDENCE_REQUESTED) — the domain
  // state machine guarantees that here. The operator key holds REVIEWER_ROLE.
  await enqueueAnchor("decision", idToUint256(input.caseId), envelope.decisionHash, {
    outcome: OUTCOME_CODE[input.outcome],
    correctionAmountMicroUsdc: input.correctionAmountMicroUsdc ?? "0",
  });

  // If no-correction outcome, close immediately
  if (!needsCorrection) {
    caseDoc.state = applyCaseEvent("DECIDED", "closed_no_correction");
    caseDoc.closedAt = new Date().toISOString();
    await caseDoc.save();
    // Anchor the terminal closure too (CON-04). The operator holds REVIEWER_ROLE.
    await enqueueAnchor("close_no_correction", idToUint256(input.caseId), envelope.decisionHash);
  }

  return { caseDoc, decisionDoc, decisionHash: envelope.decisionHash };
}

/* -------------------------------------------------------------------------- */
/* Corrections (COR-01, COR-03)                                              */
/* -------------------------------------------------------------------------- */

/** Create the voluntary correction instruction (COR-01). Derived from the decision. */
export async function createCorrectionInstruction(caseId: string, _tenantKey: string) {
  const caseDoc = await Case.findOne({ caseId });
  if (!caseDoc) throw notFound("Case not found.");
  if (caseDoc.state !== "DECIDED") {
    throw illegalTransition("A correction instruction requires a DECIDED case.");
  }
  if (!caseDoc.correctionAmountMicroUsdc) {
    throw validationError("This case has no correction amount.");
  }

  // Transition to CORRECTION_OUTSTANDING
  try {
    caseDoc.state = applyCaseEvent(caseDoc.state as CaseState, "correction_instructed");
  } catch (e) {
    throw asStateError(e);
  }

  const payment = await Payment.findOne({ paymentId: caseDoc.paymentId });
  if (!payment) throw notFound("Payment not found for correction.");

  const correctionId = generateId("cor");
  const decision = await Decision.findOne({ caseId });
  if (!decision) throw notFound("Decision not found.");

  const envelope = buildCorrectionInstructionEnvelope({
    schemaVersion: 1 as const,
    correctionId,
    caseId,
    paymentId: caseDoc.paymentId,
    decisionId: decision.decisionId,
    recipient: payment.recipient,
    destination: payment.payer, // original payer = correction destination
    token: payment.token,
    chainId: payment.chainId,
    amountMicroUsdc: caseDoc.correctionAmountMicroUsdc,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), // 7-day expiry
  });

  const correctionDoc = new Correction({
    correctionId,
    caseId,
    paymentId: caseDoc.paymentId,
    decisionId: decision.decisionId,
    state: "DRAFT",
    recipient: payment.recipient,
    destination: payment.payer,
    token: payment.token,
    chainId: payment.chainId,
    amountMicroUsdc: caseDoc.correctionAmountMicroUsdc,
    instructionHash: envelope.instructionHash,
    expiresAt: envelope.expiresAt,
    userOpHash: null,
    providerId: null,
    correctionTxHash: null,
    declineReason: null,
    createdAt: new Date().toISOString(),
  });

  caseDoc.correctionHash = envelope.instructionHash;
  await Promise.all([caseDoc.save(), correctionDoc.save()]);

  // Anchor the correction instruction on FinneCaseRegistry (CON-04). Requires the
  // case DECIDED with a non-zero correction — both guaranteed by the guards above.
  // The operator key holds PLATFORM_ROLE.
  await enqueueAnchor("correction_outstanding", idToUint256(caseId), envelope.instructionHash);

  return { correctionDoc, instructionHash: envelope.instructionHash };
}

/** Record a verified correction transfer + close the case (COR-03). */
export async function verifyCorrection(caseId: string, correctionTxHash: string) {
  const caseDoc = await Case.findOne({ caseId });
  if (!caseDoc) throw notFound("Case not found.");
  if (caseDoc.state !== "CORRECTION_OUTSTANDING") {
    throw illegalTransition("A case that is not outstanding cannot be corrected.");
  }

  const correction = await Correction.findOne({ caseId });
  if (!correction) throw notFound("Correction instruction not found.");

  // Global replay guard
  const reused = await Correction.findOne({ correctionTxHash, caseId: { $ne: caseId } });
  if (reused) throw idempotencyConflict("This correction transaction was already used on another case.");

  try {
    caseDoc.state = applyCaseEvent(caseDoc.state as CaseState, "correction_verified");
    caseDoc.closedAt = new Date().toISOString();
  } catch (e) {
    throw asStateError(e);
  }
  correction.state = "VERIFIED";
  correction.correctionTxHash = correctionTxHash;

  await Promise.all([caseDoc.save(), correction.save()]);

  // Anchor the verified correction on FinneCaseRegistry (CON-04). recordCorrection
  // requires the case to be CORRECTION_OUTSTANDING (set by the
  // correction_outstanding job above) and a fresh, unused correctionTxHash. The
  // operator key holds PLATFORM_ROLE. Fire-and-forget — if the sequence isn't
  // ready yet the worker retries with backoff.
  await enqueueAnchor("correction", idToUint256(caseId), correction.instructionHash, {
    correctionTxHash,
  });

  return { caseDoc, correction };
}

/** Recipient declines the correction (case stays outstanding). */
export async function declineCorrection(caseId: string, reason: string) {
  const caseDoc = await Case.findOne({ caseId });
  if (!caseDoc) throw notFound("Case not found.");
  if (caseDoc.state !== "CORRECTION_OUTSTANDING") {
    throw illegalTransition("Only an outstanding correction can be declined.");
  }
  const correction = await Correction.findOne({ caseId });
  if (!correction) throw notFound("Correction not found.");
  correction.state = "DECLINED";
  correction.declineReason = reason;
  // case stays CORRECTION_OUTSTANDING (the decline is recorded but doesn't close)
  await correction.save();
  return correction;
}

/* -------------------------------------------------------------------------- */
/* Evidence (PAY-02)                                                          */
/* -------------------------------------------------------------------------- */

export async function recordEvidence(params: {
  caseId: string;
  paymentId: string;
  tenantKey: string;
  submittedBy: string;
  visibility: string;
  title: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  version: number;
}) {
  const evidenceId = generateId("ev");
  const evidence = new Evidence({
    evidenceId,
    ...params,
    submittedAt: new Date().toISOString(),
  });
  await evidence.save();

  // T2 trigger (Addendum §C): new evidence arrived — re-run the agent pipeline so
  // the frame reflects the updated evidence record. Fire-and-forget.
  void import("./frameOrchestrator.ts")
    .then(({ assembleForCase }) => assembleForCase(params.caseId))
    .catch((e) => console.error(`[recordEvidence] auto frame-assembly failed for ${params.caseId}:`, e instanceof Error ? e.message : e));

  return evidence;
}

/* -------------------------------------------------------------------------- */
/* Analysis (AGENT-01, AGENT-02)                                             */
/* -------------------------------------------------------------------------- */

export async function saveAnalysis(params: {
  caseId: string;
  factPack: Record<string, unknown>;
  analysisHash: string;
  agentVersion: Record<string, string>;
}) {
  const version = await nextSeq(`analysis_${params.caseId}`);
  const analysisId = generateId("an");
  const analysis = new Analysis({
    analysisId,
    caseId: params.caseId,
    version,
    status: "draft",
    factPack: params.factPack,
    analysisHash: params.analysisHash,
    agentVersion: params.agentVersion,
  });
  await analysis.save();

  // Update the case's analysis pointer
  await Case.updateOne({ caseId: params.caseId }, {
    $set: { analysisHash: params.analysisHash, analysisVersion: version },
  });

  // Anchor the agent's analysis hash on FinneCaseRegistry (CON-03). The operator
  // key holds AGENT_ROLE. Only the approved analysis is anchored (reviewer gates
  // approval separately via approveAnalysis); here we anchor each saved version
  // so the on-chain trail records the agent's full evolution. Fire-and-forget.
  await enqueueAnchor("analysis", idToUint256(params.caseId), params.analysisHash, {
    version,
  });

  return analysis;
}

/** Reviewer approves one analysis version for anchoring (AGENT-03). */
export async function approveAnalysis(caseId: string) {
  const latest = await Analysis.findOne({ caseId }).sort({ version: -1 });
  if (!latest) throw notFound("No analysis found for this case.");
  latest.status = "approved";
  await latest.save();
  return latest;
}

/* -------------------------------------------------------------------------- */
/* Shared read assembly                                                       */
/* -------------------------------------------------------------------------- */

export async function getCaseDetail(caseId: string) {
  const caseDoc = await Case.findOne({ caseId }).lean();
  if (!caseDoc) throw notFound("Case not found.");
  const payment = await Payment.findOne({ paymentId: caseDoc.paymentId }).lean();
  const response = await ResponseModel.findOne({ caseId }).lean();
  const evidence = await Evidence.find({ caseId }).lean();
  const decisions = await Decision.findOne({ caseId }).lean();
  const analyses = await Analysis.find({ caseId }).sort({ version: -1 }).lean();
  const correction = await Correction.findOne({ caseId }).lean();
  // Agent layer (PRD Addendum A): latest decision frame + policy-pack clauses.
  // Both degrade to null/empty if absent — the case room renders v1 without them.
  const frame = await getLatestFrame(caseId);
  const clauses = await getCaseClauses();
  // frameStatus: non-null only while the agent pipeline is running (or briefly
  // after). Lets the UI render an "agents running" card without polling.
  const frameStatus = getFrameStatus(caseId);
  // Build the structured case context once (on-chain + off-chain sourced facts)
  // and share it with the frame input builder so the chain is read once. Built
  // lazily so a downstream caller that only needs the frame doesn't pay for it.
  const detailSoFar = { case: caseDoc, payment, response, evidence, decision: decisions, analyses, correction, frame, frameStatus, clauses };
  return detailSoFar;
}

/**
 * The structured case context (sourced on-chain + off-chain facts the agents
 * reason over). Built on demand from a getCaseDetail() result so the chain is
 * read at most once per request. Exported for the frame orchestrator + UI.
 */
export async function getCaseContext(detail: Awaited<ReturnType<typeof getCaseDetail>>) {
  return buildCaseContext(detail);
}
