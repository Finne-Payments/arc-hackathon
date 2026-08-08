import { canonicalHash, sha256Hex } from "./canonical.ts";
import { applyCaseEvent, applyPaymentEvent, IllegalTransitionError } from "./stateMachines.ts";
import { HttpError } from "./errors.ts";
import { outcomeCode, type DecisionOutcome, type CaseStatus } from "./statusVocabulary.ts";
import type { Role } from "./rbac.ts";
import { notify } from "./notify.ts";
import {
  AnchorJob,
  Brief,
  Case,
  ChainEvent,
  Decision,
  Evidence,
  Payout,
  Platform,
  Response as ResponseModel,
  User,
  WorkOrder,
  type PayoutDoc,
  type CaseDoc,
  type DecisionDoc,
  type AnchorJobKind,
} from "./models/index.ts";
import { PolicyClause } from "./registrar/models.ts";
import { DEMO_PACK_REF } from "./seed/policy-pack.ts";
import { NORTHWIND_PACK_REF } from "./seed/northwind-pack.ts";
import { loadEnv } from "./env.ts";
import { keccak256, stringToBytes } from "viem";
import type { Address } from "viem";
import type { StructuredCaseContext } from "./registrar/caseContext.ts";
import { readPayment, readChainFigures } from "./chain/reads.ts";
import { arbiterAddress } from "./chain/client.ts";
import { toBaseUnits, fromBaseUnitsDisplay } from "./usdc.ts";

/**
 * Load the policy clauses applicable to a case (FIN-115). Packs are isolated by
 * packRef; prefer the Northwind × Kestrel scenario pack when present (its top-3
 * governing-law pointers + ToS clauses), falling back to the demo Northstar
 * pack. Surfaces the law library (clauseNumber===0) the case room renders.
 */
async function getCaseClauses() {
  try {
    const scenarioRows = await PolicyClause.find({ packRef: NORTHWIND_PACK_REF }).sort({ clauseNumber: 1 }).lean();
    if (scenarioRows.length > 0) return scenarioRows;
    return await PolicyClause.find({ packRef: DEMO_PACK_REF }).sort({ clauseNumber: 1 }).lean();
  } catch {
    return [];
  }
}

/**
 * Build the structured case context (the same `StructuredCaseContext` shape the
 * case room renders) from the shared-case body. This is the adapter for
 * buildCaseContext (registrar/caseContext.ts): it maps the Payout/WorkOrder/
 * Case/Evidence/Clauses into the verdict-free sourced-facts card, and reuses
 * the SAME on-chain reads (readPayment/readChainFigures) + ChainEvent
 * chronology as the registrar builder. Never throws — every source degrades to
 * null/empty.
 *
 * This lets the case room show the structured context card.
 */
export async function buildLegacyCaseContext(body: SharedCaseBody): Promise<StructuredCaseContext> {
  const caseDoc = body.case as Record<string, unknown> & { payoutRef?: string; openedAt?: string; allegationFreeText?: string; allegationClaimType?: string; allegationAmountContested?: string };
  const payout = body.payout as Record<string, unknown> & { paymentId?: string; amount?: string; recipientWallet?: string; txHash?: string; paidAt?: string; platformKey?: string } | null;
  const workOrder = body.workOrder as Record<string, unknown> & { deliverables?: { name: string; due?: string | null; acceptanceCriteria?: string | null }[] } | null;
  const response = (body.responses as { text: string; submittedAt: string }[] | undefined)?.[0] ?? null;

  const allegation = caseDoc?.allegationFreeText ?? "";
  const claimType = caseDoc?.allegationClaimType ?? "non_delivery";
  const disputeOpenedAt = caseDoc?.openedAt ?? "";
  const paymentAmountMicroUsdc = payout?.amount ? toBaseUnits(String(payout.amount)).toString() : "0";
  const challengedAmountMicroUsdc = caseDoc?.allegationAmountContested
    ? toBaseUnits(String(caseDoc.allegationAmountContested)).toString()
    : paymentAmountMicroUsdc;

  // Deliverables from the legacy work order (or a placeholder).
  let deliverables: StructuredCaseContext["deliverables"] = [];
  if (workOrder?.deliverables?.length) {
    deliverables = workOrder.deliverables.map((d) => ({
      name: d.name, due: d.due ?? null, acceptanceCriteria: d.acceptanceCriteria ?? null, source: "work_order" as const,
    }));
  }
  if (deliverables.length === 0) deliverables = [{ name: "Contested deliverable", due: null, acceptanceCriteria: null, source: "placeholder" }];

  const evidence: StructuredCaseContext["evidence"] = (body.evidence as Record<string, unknown>[]).map((e) => ({
    evidenceId: String(e.evidenceId ?? ""), title: String(e.title ?? "(untitled)"), submittedBy: String(e.submittedBy ?? "unknown"),
    sha256: String(e.sha256 ?? ""), mimeType: String(e.mimeType ?? ""), source: "evidence" as const,
  }));
  const clauses: StructuredCaseContext["clauses"] = (body.clauses as Record<string, unknown>[]).map((cl) => ({
    clauseNumber: Number(cl.clauseNumber ?? 0), text: String(cl.text ?? ""), parameters: (cl.parameters ?? {}) as Record<string, number>,
  }));

  // On-chain section — identical to the registrar's buildCaseContext (shared helpers).
  let paymentOnChain: StructuredCaseContext["paymentOnChain"] = null;
  let chainFigures: StructuredCaseContext["chainFigures"] = null;
  let chainEvents: StructuredCaseContext["chainEvents"] = [];
  let onChainUnavailable = false;
  const recipient = (payout?.recipientWallet ?? "") as Address | "";
  const txHash = payout?.txHash ?? "";

  let onChainPaymentId: bigint | null = null;
  if (txHash) {
    try {
      const found = await Payout.findOne({ txHash }).lean();
      if (found?.paymentId && /^\d+$/.test(found.paymentId)) onChainPaymentId = BigInt(found.paymentId);
    } catch { /* no payout row — skip */ }
  }
  if (onChainPaymentId) {
    const [onChain, figures] = await Promise.all([
      readPayment(onChainPaymentId),
      readChainFigures(arbiterAddress(), (recipient || null) as Address | null),
    ]);
    if (onChain) {
      paymentOnChain = {
        to: onChain.to, amountDisplay: fromBaseUnitsDisplay(onChain.amount),
        releaseTimestamp: new Date(Number(onChain.releaseTimestamp) * 1000).toISOString(),
        refundTo: onChain.refundTo, withdrawnAmountDisplay: fromBaseUnitsDisplay(onChain.withdrawnAmount),
        refunded: onChain.refunded, source: "on_chain",
      };
    } else { onChainUnavailable = true; }
    if (figures) chainFigures = { ...figures, source: "on_chain" };
  } else if (txHash) {
    onChainUnavailable = true;
  }
  if (txHash) {
    try {
      const events = await ChainEvent.find({ txHash }).sort({ block: 1 }).limit(20).lean();
      chainEvents = events.map((e) => ({
        eventName: String(e.eventName ?? ""), txHash: String(e.txHash ?? ""), block: (e.block as number | null) ?? null,
        seenAt: String(e.seenAt ?? ""), source: "chain_event" as const,
      }));
    } catch { /* chainevents absent — skip */ }
  }

  return {
    allegation, claimType, challengedAmountMicroUsdc, disputeOpenedAt,
    paymentAmountMicroUsdc, payer: payout?.platformKey ?? "", recipient, paidAt: payout?.paidAt ?? disputeOpenedAt, paymentTxHash: txHash,
    response: response ? { text: response.text, submittedAt: response.submittedAt } : null,
    deliverables, evidence, clauses, paymentOnChain, chainFigures, chainEvents, onChainUnavailable,
  };
}

/* ============================================================================
   Services — receipt/case/decision assembly + canonical hashing (PRD §9.4, §11).
   Routes stay thin; this module holds the business rules and is the only place
   that computes hashes and drives the state machines.
   ========================================================================== */

export class StateError extends HttpError {
  constructor(entity: "payment" | "case", message: string) {
    super(409, message);
    this.name = "StateError";
    void entity;
  }
}

function asStateError(e: unknown, entity: "payment" | "case"): never {
  if (e instanceof IllegalTransitionError) throw new StateError(entity, e.message);
  throw e;
}

/* ---- numbering (PRD §9.3) ---- */
export async function nextCaseNumber(): Promise<string> {
  const count = await Case.countDocuments();
  return "CASE-" + String(142 + count).padStart(4, "0");
}

/**
 * Readable, auto-derived case code: `{PLATFORM}-{RECIPIENT}-{seq}` (e.g.
 * `NORT-MAYA-001`), sequenced per platform+recipient pair. Falls back to the
 * canonical CASE-NNNN if either party key is missing. Fully derived — no caller
 * input. Stored on the Case as `caseCode` for display + search.
 */
export async function nextCaseCode(platformKey: string | null, recipientKey: string | null): Promise<string> {
  const plat = prefixOf(platformKey);
  const recip = prefixOf(recipientKey);
  if (!plat || !recip) return nextCaseNumber();
  const seq = 1 + (await Case.countDocuments({
    caseCode: { $regex: `^${plat}-${recip}-\\d+$` },
  }));
  return `${plat}-${recip}-${String(seq).padStart(3, "0")}`;
}

function prefixOf(key: string | null | undefined): string {
  if (!key) return "";
  const cleaned = key.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  // Take up to the first camelCase boundary or the first 2-4 chars.
  return cleaned.slice(0, Math.min(4, cleaned.length || 2));
}

export async function nextBriefVersion(caseRef: string): Promise<number> {
  const count = await Brief.countDocuments({ caseRef });
  return count + 1;
}

/* ---- receipt assembly (PRD §11.2 /payouts/detected) ---- */
export interface DetectedPayment {
  paymentId: string;
  chain: string;
  contractAddress: string;
  txHash: string;
  to: string;
  amount: string;
  refundTo: string;
  blockTimestamp: string;
  txSender: string;
  /** The REAL on-chain release timestamp (block.timestamp + lockupSeconds[recipient]),
   *  snapshotted in the contract at pay() time. When present this is the source of
   *  truth for lockupEnd — never the hardcoded 30-day demo window. */
  releaseTimestamp?: string;
}

/** Idempotent: a replay of a known paymentId returns the existing payout. */
export async function recordDetectedPayment(det: DetectedPayment): Promise<{ payout: PayoutTypes; created: boolean }> {
  const existing = await Payout.findOne({ paymentId: det.paymentId });
  if (existing) return { payout: existing, created: false };

  // Derive the recipient key from the real on-chain recipient address. Do NOT
  // look up seeded Recipient/Platform/work-order records (which would stamp
  // hardcoded demo names onto real payouts). The off-chain metadata
  // (description, deliverables) is attached later by the user via the metadata
  // endpoint, linked to the real paymentId.
  const recipientKey = det.to.toLowerCase().slice(0, 10);

  // Resolve the platformKey from the SENDER's User record so the per-seat scope
  // filter (scopeFor: { platformKey: caller.platformKey }) matches. If the
  // sender isn't a known user (the common case — payouts are paid from a
  // treasury/operator wallet, not the reviewer's login wallet), fall back to the
  // platform's own key (env.defaultPlatformKey, "northstar") so the payout is
  // visible to the platform's reviewer. The previous fallback (the sender's
  // address prefix) made every such payout invisible to the scoped reviewer.
  let platformKey = loadEnv().defaultPlatformKey;
  if (det.txSender) {
    const senderUser = await User.findOne({
      walletAddress: { $regex: new RegExp(`^${det.txSender.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).lean();
    if (senderUser?.platformKey) platformKey = senderUser.platformKey;
  }

  // lockupEnd = the REAL on-chain release timestamp when the indexer provides it
  // (from the PaymentCreated event). Falls back to paidAt + 30 days only when the
  // release timestamp isn't available — never silently invents a window that
  // contradicts the contract. disputeDeadline tracks lockupEnd (the dispute window
  // closes when the lockup ends).
  const lockupEnd = det.releaseTimestamp
    ? new Date(Number(BigInt(det.releaseTimestamp)) * 1000).toISOString()
    : new Date(new Date(det.blockTimestamp).getTime() + 30 * 86400 * 1000).toISOString();
  const disputeDeadline = lockupEnd;

  const receiptBody = {
    paymentId: det.paymentId,
    chain: det.chain,
    contractAddress: det.contractAddress,
    txHash: det.txHash,
    amount: det.amount,
    refundTo: det.refundTo,
    recipientKey,
    platformKey,
    workOrderRef: null,
    paidAt: det.blockTimestamp,
    lockupEnd,
    disputeDeadline,
  };
  const receiptHash = canonicalHash(receiptBody);

  const payout = await Payout.create({
    ...receiptBody,
    recipientWallet: det.to,
    status: "ESCROWED",
    receiptHash,
    registryAnchorTx: null,
    refundTxHash: null,
    withdrawTxHash: null,
    trancheIndex: null,
  });

  // paymentId is a raw uint256 from the RefundProtocol PaymentCreated event (a
  // monotonic counter: 9, 10, 11...). It is the contract's receipt mapping key
  // as-is — do NOT hash it. (idToUint256 is only for string ids like caseNumber.)
  // The worker's receipt branch BigInt()-coerces job.paymentId, so the raw numeric
  // string is what lands on chain and what openCase later looks up.
  await enqueueAnchor("receipt", payout.paymentId, payout.paymentId, receiptHash, 0, {
    payer: det.txSender,
    recipient: det.to,
    // det.amount is in whole USDC (6 decimals) — the registry takes micro-USDC (uint128).
    amountMicroUsdc: BigInt(Math.round(Number(det.amount) * 1_000_000)).toString(),
    paidAt: Math.floor(new Date(det.blockTimestamp).getTime() / 1000),
  });

  await notify({
    type: "payment",
    title: "Payment protected on Arc",
    body: `${det.amount} USDC escrowed. Receipt anchored.`,
    paymentId: payout.paymentId,
    audience: [
      { role: "recipient", recipientWallet: det.to },
      { role: "reviewer", platformKey: payout.platformKey },
    ],
  });

  return { payout, created: true };
}

type PayoutTypes = import("mongoose").HydratedDocument<PayoutDoc>;

/* ---- dispute opening (PRD §11.2 /payouts/:id/disputes) ---- */
export async function openDispute(
  paymentId: string,
  openedBy: "platform" | "recipient",
  body: { claimType: string; freeText: string; amountContested: string },
  env = loadEnv(),
): Promise<{ caseDoc: CaseDocType; paymentId: string }> {
  if (!body.freeText?.trim()) throw new HttpError(400, "Tell us what went wrong — the free-text claim is required.");

  const payout = await Payout.findOne({ paymentId });
  if (!payout) throw new HttpError(404, `No payout found for payment ${paymentId}.`);

  const existingOpen = await Case.findOne({ payoutRef: paymentId, status: { $ne: "CLOSED" } });
  if (existingOpen) throw new HttpError(409, "This payout already has an open case. Resolve it before opening another.");

  try {
    payout.status = applyPaymentEvent(payout.status as never, "dispute_opened");
  } catch (e) {
    asStateError(e, "payment");
  }
  await payout.save();

  const platform = await Platform.findOne({ key: payout.platformKey });
  const windowHours = platform?.policyResponseWindowHours ?? env.responseWindowHours;
  const now = new Date();
  const caseNumber = await nextCaseNumber();
  const caseCode = await nextCaseCode(payout.platformKey, payout.recipientKey);
  const openedAt = now.toISOString();
  const responseDeadline = new Date(now.getTime() + windowHours * 3600 * 1000).toISOString();

  const caseBody = {
    payoutRef: paymentId,
    openedBy,
    allegation: { claimType: body.claimType, freeText: body.freeText, amountContested: body.amountContested },
    openedAt,
  };
  const caseHash = canonicalHash(caseBody);

  const caseDoc = await Case.create({
    caseNumber,
    caseCode,
    payoutRef: paymentId,
    openedBy,
    allegationClaimType: body.claimType,
    allegationFreeText: body.freeText,
    allegationAmountContested: body.amountContested,
    status: "OPEN",
    infoRequestCount: 0,
    infoRequests: [],
    responseDeadline,
    caseHash,
    openedAt,
    registryAnchorTx: null,
  });

  // OPEN → notice_served → AWAITING_RESPONSE immediately.
  const afterNotice = applyCaseEvent({ status: caseDoc.status as never, infoRequestCount: 0 }, "notice_served");
  caseDoc.status = afterNotice.status;
  await caseDoc.save();

  await enqueueAnchor("case", idToUint256(caseDoc.caseNumber), paymentId, caseHash, 0, {
    // paymentId is the RAW uint256 receipt key (the contract's openCase looks up
    // receipts[paymentId] — it must match the key registerReceipt used, which is
    // the raw paymentId, NOT idToUint256(paymentId)).
    paymentId,
    // Mongo backfill key: the worker's entityId is now the keccak uint256, not
    // the caseNumber, so backfillAnchor needs the original caseNumber.
    caseNumber: caseDoc.caseNumber,
    challengedAmountMicroUsdc: BigInt(Math.round(Number(body.amountContested) * 1_000_000)).toString(),
    responseDueAt: Math.floor(new Date(responseDeadline).getTime() / 1000),
  });

  await notify({
    type: "dispute",
    title: "A dispute was opened on your payment",
    body: `${body.amountContested || ""} USDC contested over: ${body.freeText.slice(0, 80)}. Reply by the deadline.`,
    caseNumber: caseDoc.caseNumber,
    paymentId,
    audience: [
      { role: "recipient", recipientWallet: payout.recipientWallet },
      { role: "reviewer", platformKey: payout.platformKey },
    ],
  });

  return { caseDoc, paymentId };
}

type CaseDocType = import("mongoose").HydratedDocument<CaseDoc>;

/* ---- recipient reply (PRD §11.2 /cases/:id/responses) ---- */
export async function submitResponse(
  caseNumber: string,
  author: "recipient" | "platform",
  authorName: string,
  body: { text: string; evidence: { type: string; title: string; fileOrText: string }[] },
): Promise<{ caseDoc: CaseDocType }> {
  if (!body.text?.trim()) throw new HttpError(400, "Your reply needs some text.");

  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  // A reply is accepted from any open case stage (AWAITING_RESPONSE or
  // UNDER_REVIEW). The state machine allows reply_received from both — so the
  // merchant/customer can respond whenever the case is open.
  try {
    const after = applyCaseEvent(
      { status: caseDoc.status as CaseStatus, infoRequestCount: caseDoc.infoRequestCount },
      "reply_received",
    );
    caseDoc.status = after.status;
  } catch {
    // If the case is decided/closed, skip the transition but still save the
    // response — the conversation record should be preserved.
  }

  // Stamp ALL open info requests directed at the responder as answered.
  const responderTarget = author === "recipient" ? "recipient" : "platform";
  for (const req of caseDoc.infoRequests) {
    if (!req.answeredAt && req.target === responderTarget) {
      req.answeredAt = new Date().toISOString();
    }
  }

  const submittedAt = new Date().toISOString();
  // Canonical hash of the response body — the bytes32 anchored on chain via
  // submitResponse. Mirrors the registrar's buildResponseEnvelope: hash over
  // {caseRef, author, authorName, text, submittedAt} (no evidence refs, since
  // those attach separately and the contract anchors the response text only).
  const responseHash = canonicalHash({ caseRef: caseNumber, author, authorName, text: body.text, submittedAt });
  await ResponseModel.create({
    caseRef: caseNumber,
    author,
    authorName,
    text: body.text,
    evidenceRefs: [],
    submittedAt,
    responseHash,
    registryAnchorTx: null,
  });

  // Attach any evidence submitted with the reply.
  for (const ev of body.evidence ?? []) {
    await attachEvidence(caseNumber, "recipient", ev.type, ev.title, ev.fileOrText);
  }
  await caseDoc.save();

  const payoutForNotify = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();

  // Anchor the recipient response on chain (submitResponse). The contract
  // requires the case be on-chain OPEN for this, which it is: openCase landed
  // OPEN and nothing has moved it yet (markUnderReview is enqueued only at the
  // decision point). submittedBy is the responder's wallet when known; the
  // operator key holds PLATFORM_ROLE so it may relay a verified response.
  await enqueueAnchor("response", idToUint256(caseNumber), caseDoc.payoutRef, responseHash, 0, {
    caseNumber,
    submittedBy: author === "recipient" ? (payoutForNotify?.recipientWallet ?? undefined) : undefined,
  });

  await notify({
    type: "reply",
    title: "Recipient replied to the case",
    body: `${authorName} submitted a response. The case is ready for your review.`,
    caseNumber,
    paymentId: caseDoc.payoutRef,
    audience: [{ role: "reviewer", platformKey: payoutForNotify?.platformKey ?? null }],
  });

  // Re-run the agent frame so the narrative + turning questions reflect the new
  // message. Fire-and-forget (P8 never-crash). Mirrors the evidence-add trigger.
  void import("./registrar/frameOrchestrator.ts")
    .then(({ assembleForCaseByNumber }) => assembleForCaseByNumber(caseNumber))
    .catch((e) => console.error(`[submitResponse] auto frame-assembly failed for ${caseNumber}:`, e instanceof Error ? e.message : e));

  return { caseDoc };
}

/* ---- evidence attachment (PRD §11.2 /cases/:id/evidence) ---- */
export async function attachEvidence(
  caseNumber: string,
  submittedBy: "platform" | "recipient" | "agent",
  type: string,
  title: string,
  fileOrText: string,
): Promise<void> {
  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);
  if (caseDoc.status === "CLOSED") {
    throw new HttpError(409, "Evidence closed when the case was decided.");
  }
  const sha256 = sha256Hex(fileOrText);
  await Evidence.create({
    caseRef: caseNumber,
    payoutRef: caseDoc.payoutRef,
    submittedBy,
    type,
    title,
    fileOrText,
    sha256,
    submittedAt: new Date().toISOString(),
  });
}

/* ---- info request (PRD §11.2 /cases/:id/requests) ---- */
export async function requestInfo(
  caseNumber: string,
  target: "platform" | "recipient",
  text: string,
): Promise<{ caseDoc: CaseDocType }> {
  if (!text?.trim()) throw new HttpError(400, "Say what information you need.");
  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  let didRequest = false;
  try {
    // If the case is AWAITING_RESPONSE (no reply yet), the arbiter can still
    // request info — move to UNDER_REVIEW first, then apply the info request.
    // This lets the arbiter act at any point after the case opens.
    let workStatus: CaseStatus = caseDoc.status as CaseStatus;
    if (workStatus === "AWAITING_RESPONSE") {
      const advanced = applyCaseEvent({ status: workStatus, infoRequestCount: caseDoc.infoRequestCount }, "deadline_passed");
      workStatus = advanced.status;
    }
    const after = applyCaseEvent(
      { status: workStatus, infoRequestCount: caseDoc.infoRequestCount },
      "request_info",
    );
    caseDoc.status = after.status;
    caseDoc.infoRequestCount = after.infoRequestCount;
    didRequest = after.didRequestInfo;
  } catch (e) {
    asStateError(e, "case");
  }
  void didRequest;

  const windowHours = loadEnv().responseWindowHours;
  caseDoc.responseDeadline = new Date(Date.now() + windowHours * 3600 * 1000).toISOString();
  caseDoc.infoRequests.push({ target, text, requestedAt: new Date().toISOString(), answeredAt: null });
  await caseDoc.save();

  const payoutForReq = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();
  await notify({
    type: "info_request",
    title: "More information requested",
    body: `Reviewer needs: ${text}`,
    caseNumber,
    paymentId: caseDoc.payoutRef,
    audience: target === "recipient"
      ? [{ role: "recipient", recipientWallet: payoutForReq?.recipientWallet }]
      : [
          { role: "reviewer", platformKey: payoutForReq?.platformKey ?? null },
          { role: "platform_viewer", platformKey: payoutForReq?.platformKey ?? null },
        ],
  });

  return { caseDoc };
}

/* ---- decision (PRD §11.2 /cases/:id/decisions) ---- */
export async function recordDecision(
  caseNumber: string,
  decidedByName: string,
  decidedByWallet: string,
  body: { outcome: DecisionOutcome; reason: string },
): Promise<{ decision: DecisionType; unsignedTx: UnsignedTx | null }> {
  if (!body.reason || body.reason.trim().length < 20) {
    throw new HttpError(400, "Write at least 20 characters of reasons — both sides will read this.");
  }
  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  const paymentEvent =
    body.outcome === "refund" ? null : body.outcome === "release" ? "decision_release" : "decision_no_action";
  const caseEvent =
    body.outcome === "refund"
      ? "decision_recorded_refund"
      : body.outcome === "release"
        ? "decision_recorded_release"
        : "decision_recorded_no_action";

  try {
    // If the case is AWAITING_RESPONSE, advance to UNDER_REVIEW first so the
    // arbiter can decide without waiting for a reply or deadline.
    let workStatus: CaseStatus = caseDoc.status as CaseStatus;
    if (workStatus === "AWAITING_RESPONSE") {
      const advanced = applyCaseEvent({ status: workStatus, infoRequestCount: caseDoc.infoRequestCount }, "deadline_passed");
      workStatus = advanced.status;
    }
    const after = applyCaseEvent(
      { status: workStatus, infoRequestCount: caseDoc.infoRequestCount },
      caseEvent as never,
    );
    caseDoc.status = after.status;
  } catch (e) {
    asStateError(e, "case");
  }

  const payout = await Payout.findOne({ paymentId: caseDoc.payoutRef });
  if (paymentEvent && payout) {
    try {
      payout.status = applyPaymentEvent(payout.status as never, paymentEvent as never);
      await payout.save();
    } catch (e) {
      asStateError(e, "payment");
    }
  }

  const decidedAt = new Date().toISOString();
  const decisionBody = {
    caseRef: caseNumber,
    outcome: body.outcome,
    decidedByName,
    decidedByWallet,
    reason: body.reason,
    decidedAt,
  };
  const decisionHash = canonicalHash(decisionBody);

  const decision = await Decision.create({
    ...decisionBody,
    decisionHash,
    refundTxHash: null,
    executedAt: null,
    registryAnchorTx: null,
  });

  let unsignedTx: UnsignedTx | null = null;

  if (body.outcome === "refund") {
    // Refund decisions anchor only AFTER on-chain confirmation (PRD §9.4, §15.3).
    // Return an unsigned tx the reviewer's browser wallet signs.
    unsignedTx = buildUnsignedRefundTx(caseDoc.payoutRef);
  } else {
    // Release / no-action: close the case now, anchor the decision.
    const afterClose = applyCaseEvent({ status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount }, "close");
    caseDoc.status = afterClose.status;
    await caseDoc.save();
    // On-chain sequence (worker drains by _id order, so enqueue in order):
    //   markUnderReview  (OPEN|RESPONDED → UNDER_REVIEW)  — recordDecision requires UNDER_REVIEW
    //   recordDecision   (UNDER_REVIEW → DECIDED)          — outcome DISMISSED(4), correction 0
    //   closeNoCorrection (DECIDED → CLOSED_NO_CORRECTION) — terminal, no correction
    await enqueueAnchor("under_review", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, 0, {
      caseNumber: caseDoc.caseNumber,
    });
    await enqueueAnchor("decision", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, outcomeCode(body.outcome), {
      // Legacy outcomes {release,no_action} are no-correction → contract Outcome.DISMISSED (4)
      // with zero correction. (refund decisions anchor after on-chain confirmation.)
      // entityId is the on-chain caseId (= idToUint256(caseNumber)) so recordDecision
      // matches the case that openCase created; decisionId is the Mongo backfill key.
      decisionId: decision._id.toString(),
      caseNumber: caseDoc.caseNumber,
      outcome: 4,
      correctionAmountMicroUsdc: "0",
    });
    await enqueueAnchor("close_no_correction", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, 0, {
      caseNumber: caseDoc.caseNumber,
    });
  }

  await caseDoc.save();

  await notify({
    type: "decision",
    title: `Case ${caseDoc.caseNumber} decided: ${body.outcome}`,
    body: body.outcome === "refund"
      ? "Refund approved. The reviewer's wallet will sign the on-chain transaction."
      : body.outcome === "release"
        ? "Refund rejected — the payout stands and will become withdrawable."
        : "Closed with no action. The payout continues on its original schedule.",
    caseNumber: caseDoc.caseNumber,
    paymentId: caseDoc.payoutRef,
    audience: [
      { role: "recipient", recipientWallet: payout?.recipientWallet },
      { role: "platform_viewer", platformKey: payout?.platformKey ?? null },
    ],
  });

  return { decision, unsignedTx };
}

type DecisionType = import("mongoose").HydratedDocument<DecisionDoc>;

interface UnsignedTx {
  to: string;
  chainId: number;
  functionName: string;
  args: (string | number)[];
  abi: unknown[]; // the ABI fragment the browser wallet needs for writeContract
  abiName: string;
}

function buildUnsignedRefundTx(paymentId: string): UnsignedTx {
  const env = loadEnv();
  return {
    to: env.arc.refundProtocolAddress ?? "0x0000000000000000000000000000000000000000",
    chainId: env.arc.chainId,
    functionName: "refundByArbiter",
    args: [paymentId],
    abi: [
      {
        type: "function",
        name: "refundByArbiter",
        stateMutability: "nonpayable",
        inputs: [{ name: "paymentID", type: "uint256" }],
        outputs: [],
      },
    ],
    abiName: "refundByArbiter(uint256)",
  };
}

/* ---- refund execution confirmation (internal hook, PRD §11.2) ---- */
// The Refund event fires while the payment is DISPUTED. With no debt it lands at
// REFUNDED; with debt (scenario B) it continues to DEBT_OUTSTANDING. The case
// moves DECIDED → EXECUTED → CLOSED and the decision gets its refund tx hash.
export async function confirmRefundExecuted(
  paymentId: string,
  refundTxHash: string,
  debtRecorded: boolean,
): Promise<void> {
  const payout = await Payout.findOne({ paymentId });
  if (!payout) throw new HttpError(404, `No payout ${paymentId}.`);

  try {
    // DISPUTED → REFUNDED
    payout.status = applyPaymentEvent(payout.status as never, "refund_confirmed");
    if (debtRecorded) {
      // REFUNDED → DEBT_OUTSTANDING (scenario B: reserve covered it, recipient owes)
      payout.status = applyPaymentEvent(payout.status as never, "refund_short_balance");
    }
  } catch (e) {
    asStateError(e, "payment");
  }

  payout.refundTxHash = refundTxHash;
  await payout.save();

  // Case DECIDED → EXECUTED → CLOSED; stamp the decision.
  const caseDoc = await Case.findOne({ payoutRef: paymentId, status: "DECIDED" });
  if (caseDoc) {
    const executed = applyCaseEvent({ status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount }, "refund_confirmed");
    caseDoc.status = executed.status;
    const closed = applyCaseEvent({ status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount }, "close");
    caseDoc.status = closed.status;
    await caseDoc.save();

    const decision = await Decision.findOne({ caseRef: caseDoc.caseNumber });
    if (decision) {
      decision.refundTxHash = refundTxHash;
      decision.executedAt = new Date().toISOString();
      await decision.save();
      // On-chain correction sequence for a confirmed refund (worker drains by
      // _id order, so enqueue strictly in this order). The contract state machine:
      //   markUnderReview       OPEN|RESPONDED → UNDER_REVIEW
      //   recordDecision(2,...) UNDER_REVIEW → DECIDED   (outcome PLATFORM_UPHELD, correction = amount)
      //   markCorrectionOutstanding DECIDED → CORRECTION_OUTSTANDING  (stores correctionHash)
      //   recordCorrection      CORRECTION_OUTSTANDING → CLOSED_CORRECTED (re-supplies the SAME correctionHash + the Arc refund tx)
      // markCorrectionOutstanding and recordCorrection MUST receive a byte-identical
      // correctionHash (the contract enforces equality at FinneCaseRegistry.sol:338).
      const caseId = idToUint256(caseDoc.caseNumber);
      const correctionAmountMicroUsdc = BigInt(Math.round(Number(payout.amount) * 1_000_000)).toString();
      const correctionHash = canonicalHash({
        caseRef: caseDoc.caseNumber,
        paymentId,
        refundTxHash,
        amountMicroUsdc: correctionAmountMicroUsdc,
        recipient: payout.recipientWallet,
        decidedAt: decision.decidedAt,
      });
      await enqueueAnchor("under_review", caseId, paymentId, decision.decisionHash, 0, {
        caseNumber: caseDoc.caseNumber,
      });
      await enqueueAnchor("decision", caseId, paymentId, decision.decisionHash, 1, {
        decisionId: decision._id.toString(),
        caseNumber: caseDoc.caseNumber,
        outcome: 2, // PLATFORM_UPHELD
        correctionAmountMicroUsdc,
      });
      await enqueueAnchor("correction_outstanding", caseId, paymentId, correctionHash, 0, {
        caseNumber: caseDoc.caseNumber,
      });
      await enqueueAnchor("correction", caseId, paymentId, correctionHash, 0, {
        caseNumber: caseDoc.caseNumber,
        correctionTxHash: refundTxHash,
      });
    }
  }

  await notify({
    type: "refund",
    title: "Refund confirmed on Arc",
    body: `Refund of ${payout.amount} USDC confirmed. Transaction: ${refundTxHash.slice(0, 10)}…`,
    caseNumber: caseDoc?.caseNumber ?? null,
    paymentId,
    audience: [
      { role: "recipient", recipientWallet: payout.recipientWallet },
      { role: "platform_viewer", platformKey: payout.platformKey ?? null },
    ],
  });
}

/* ---- withdrawal confirmation (internal hook) ---- */
export async function confirmWithdrawn(paymentId: string, withdrawTxHash: string): Promise<void> {
  const payout = await Payout.findOne({ paymentId });
  if (!payout) return;
  try {
    // The chain is the truth. If the payout is still ESCROWED (the lockup-end
    // hook hasn't fired in the state machine), transition through WITHDRAWABLE
    // first, then to WITHDRAWN. The contract allowed the withdrawal, so the
    // lockup must have passed on chain.
    if (payout.status === "ESCROWED") {
      payout.status = applyPaymentEvent(payout.status as never, "lockup_end_no_dispute");
    }
    if (payout.status === "CLEARED") {
      payout.status = applyPaymentEvent(payout.status as never, "lockup_end_after_clear");
    }
    payout.status = applyPaymentEvent(payout.status as never, "withdraw");
    payout.withdrawTxHash = withdrawTxHash;
    await payout.save();
  } catch (e) {
    asStateError(e, "payment");
  }

  await notify({
    type: "withdraw",
    title: "Withdrawal confirmed on Arc",
    body: `${payout.amount} USDC withdrawn. Transaction: ${withdrawTxHash.slice(0, 10)}…`,
    paymentId,
    audience: [
      { role: "recipient", recipientWallet: payout.recipientWallet },
      { role: "reviewer", platformKey: payout.platformKey ?? null },
    ],
  });
}

/* ---- anchor job enqueue → drained by anchorWorker.ts against FinneCaseRegistry ---- */

/**
 * keccak256(utf8 id) → decimal uint256 string. This is the on-chain caseId /
 * paymentId key the FinneCaseRegistry uses in its mappings. The worker passes
 * `entityId` straight to `BigInt(...)`, so the id MUST be a numeric string by
 * the time it lands on the job — feeding it the raw `"CASE-0142"` caseNumber or
 * a Mongo ObjectId hex throws `Cannot convert ... to a BigInt` and dead-letters
 * the anchor after 8 attempts. Mirrors `registrar/services.ts:idToUint256`.
 */
function idToUint256(id: string): string {
  return BigInt(keccak256(stringToBytes(id))).toString();
}

async function enqueueAnchor(
  kind: AnchorJobKind,
  entityId: string,
  paymentId: string,
  hash: string,
  outcome = 0,
  args: Record<string, unknown> = {},
): Promise<void> {
  await AnchorJob.create({
    kind,
    entityId,
    paymentId,
    hash,
    disputeDeadline: 0,
    outcome,
    args,
    status: "queued",
    attempts: 0,
    lastError: null,
    anchorTx: null,
  });
}

/* ---- shared case body assembly (P3 — byte-identical across seats) ---- */
export async function getSharedCase(caseNumber: string): Promise<SharedCaseBody> {
  const caseDoc = await Case.findOne({ caseNumber }).lean();
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  const payout = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();
  const workOrder = payout
    ? await WorkOrder.findOne({ paymentId: payout.paymentId }).lean()
    : null;
  const responses = await ResponseModel.find({ caseRef: caseNumber }).lean();
  const evidence = await Evidence.find({ caseRef: caseNumber }).lean();
  const briefs = await Brief.find({ caseRef: caseNumber }).sort({ version: 1 }).lean();
  const decision = await Decision.findOne({ caseRef: caseNumber }).lean();
  const clauses = await getCaseClauses();

  return {
    payout,
    workOrder: workOrder
      ? {
          ...workOrder,
          // Strip the internal S3 object keys from work-order documents before
          // they reach any client. Downloads go through the evidence:download
          // endpoint, which resolves the key server-side (never trusts client
          // input). The document metadata (filename, mime, size, sha) stays so
          // everyone can see what's on file; only the storage path is hidden.
          documents: ((workOrder as { documents?: unknown[] }).documents ?? []).map((d) => {
            const doc = d as Record<string, unknown>;
            const { objectKey: _omit, ...publicDoc } = doc;
            return publicDoc;
          }),
        }
      : workOrder,
    case: caseDoc,
    clauses,
    responses,
    // Fingerprints only (P3). Also strip the internal objectKey — the storage
    // path is never exposed to clients; downloads are issued per-request via the
    // evidence:download endpoint after the arbiter-only RBAC check passes.
    evidence: evidence.map((e) => {
      const { objectKey: _omit, ...publicEv } = e as Record<string, unknown>;
      return { ...publicEv, fileOrText: undefined, sha256: (e as { sha256?: string }).sha256 };
    }),
    brief: briefs.length ? { latest: briefs[briefs.length - 1], versions: briefs.length } : null,
    decision,
  };
}

export interface SharedCaseBody {
  payout: unknown;
  workOrder: unknown;
  case: unknown;
  /** Policy clauses in force + the governing-law notes (clauseNumber===0). */
  clauses: unknown[];
  responses: unknown[];
  evidence: unknown[];
  brief: { latest: unknown; versions: number } | null;
  decision: unknown;
}

/* ---- shared receipt assembly (P3 — identical body for every seat) ---- */
export async function getSharedReceipt(paymentId: string): Promise<SharedReceiptBody> {
  const payout = await Payout.findOne({ paymentId }).lean();
  if (!payout) throw new HttpError(404, `No payout ${paymentId} found.`);
  // Resolve the work order by its direct link to this payment — not by
  // name-matching against seeded recipient records (which stamped hardcoded
  // demo descriptions onto real payouts).
  const workOrder = await WorkOrder.findOne({ paymentId }).lean();
  const caseDoc = await Case.findOne({ payoutRef: paymentId, status: { $ne: "CLOSED" } }).lean();
  const decision = caseDoc ? await Decision.findOne({ caseRef: (caseDoc as { caseNumber: string }).caseNumber }).lean() : null;
  const evidence = await Evidence.find({ payoutRef: paymentId }).lean();
  return {
    payout,
    workOrder: workOrder
      ? {
          ...workOrder,
          // Strip internal object keys (same posture as getSharedCase).
          documents: ((workOrder as { documents?: unknown[] }).documents ?? []).map((d) => {
            const doc = d as Record<string, unknown>;
            const { objectKey: _omit, ...publicDoc } = doc;
            return publicDoc;
          }),
        }
      : workOrder,
    case: caseDoc,
    decision,
    evidence: evidence.map((e) => {
      const { objectKey: _omit, ...publicEv } = e as Record<string, unknown>;
      return { ...publicEv, fileOrText: undefined };
    }),
  };
}

export interface SharedReceiptBody {
  payout: unknown;
  workOrder: unknown;
  case: unknown;
  decision: unknown;
  evidence: unknown[];
}

/** Map a request seat to the platform's "openedBy" perspective for disputes. */
export function openedByForRole(role: Role | null): "platform" | "recipient" {
  return role === "recipient" ? "recipient" : "platform";
}
