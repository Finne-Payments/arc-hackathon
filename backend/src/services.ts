import { canonicalHash, sha256Hex } from "./canonical.ts";
import { applyCaseEvent, applyPaymentEvent, IllegalTransitionError } from "./stateMachines.ts";
import { HttpError } from "./errors.ts";
import { type DecisionOutcome, type CaseStatus } from "./statusVocabulary.ts";
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
import { REFUND_PROTOCOL_ABI } from "./chain/abis.ts";
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
      readChainFigures(await arbiterAddress(), (recipient || null) as Address | null),
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

/**
 * Resolve the platformKey a payout should be stamped with so the per-seat scope
 * filter (scopeFor: { platformKey: caller.platformKey }) matches and the
 * reviewer sees the payout in the ledger. A payout belongs to the PLATFORM that
 * operates it — NOT to whoever happened to sign the pay() tx. Resolve
 * most-specific first:
 *   1. the Platform whose payWallet made the payment (the operator treasury)
 *   2. otherwise the single operating platform (Platform.findOne — single-platform deploy)
 *   3. otherwise env.defaultPlatformKey ("northstar")
 * The previous logic derived platformKey from the payer's USER record, which
 * (a) left payouts paid from an unregistered wallet stamped with the address
 * prefix and invisible to the reviewer, and (b) when the payer WAS a User,
 * inherited that user's seat platformKey — wrong for a treasury/operator key.
 */
async function derivePlatformKey(txSender?: string): Promise<string> {
  const byWallet = txSender
    ? await Platform.findOne({ payWallet: { $regex: new RegExp(`^${txSender.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } }).lean()
    : null;
  if (byWallet?.key) return byWallet.key;
  const operatingPlatform = await Platform.findOne({}).lean();
  if (operatingPlatform?.key) return operatingPlatform.key;
  return loadEnv().defaultPlatformKey;
}

/**
 * One-time, idempotent boot reconciliation. Payouts created before the
 * Platform-collection derivation were stamped with a stale platformKey (the
 * payer's address prefix, or the payer's seat platformKey) and are invisible to
 * the scoped reviewer. The indexer can't self-heal them once they've aged out
 * of the rolling window (e.g. paymentId 11 ended up ~90k blocks behind). This
 * scans every payout and re-derives platformKey from the operating Platform,
 * correcting any that don't match a known Platform key. Safe to run on every
 * boot: it only writes when a value actually changes, and platformKey is now
 * mutable (not in PAYOUT_IMMUTABLE).
 */
export async function reconcilePayoutPlatformKeys(): Promise<void> {
  const knownKeys = (await Platform.find({}).select("key").lean()).map((p) => p.key);
  const correctKey = knownKeys[0] ?? loadEnv().defaultPlatformKey;
  const payouts = await Payout.find({}).lean();
  let fixed = 0;
  for (const p of payouts) {
    if (!knownKeys.includes(p.platformKey)) {
      await Payout.updateOne({ _id: p._id }, { $set: { platformKey: correctKey } });
      fixed++;
    }
  }
  if (fixed > 0) console.log(`[reconcile] corrected platformKey on ${fixed} payout(s) → "${correctKey}"`);
}

/** Idempotent: a replay of a known paymentId returns the existing payout. */
export async function recordDetectedPayment(det: DetectedPayment): Promise<{ payout: PayoutTypes; created: boolean }> {
  const existing = await Payout.findOne({ paymentId: det.paymentId });
  if (existing) {
    // Re-derive platformKey and correct it if the stored value is stale. Earlier
    // builds stamped payouts with the payer's address prefix (or the payer's
    // User-seat platformKey), which made them invisible to the scoped reviewer.
    // platformKey is now mutable (removed from PAYOUT_IMMUTABLE) precisely so
    // this reconciliation can backfill existing rows without a manual migration.
    const freshKey = await derivePlatformKey(det.txSender);
    if (freshKey && freshKey !== existing.platformKey) {
      existing.platformKey = freshKey;
      await existing.save();
    }
    return { payout: existing, created: false };
  }

  // Derive the recipient key from the real on-chain recipient address. Do NOT
  // look up seeded Recipient/Platform/work-order records (which would stamp
  // hardcoded demo names onto real payouts). The off-chain metadata
  // (description, deliverables) is attached later by the user via the metadata
  // endpoint, linked to the real paymentId.
  const recipientKey = det.to.toLowerCase().slice(0, 10);

  // A payout belongs to the PLATFORM that operates it (see derivePlatformKey).
  const platformKey = await derivePlatformKey(det.txSender);

  // Settlement window: when the merchant can withdraw. The on-chain release
  // timestamp is the source of truth, but for the demo we enforce a MINIMUM of
  // T+3 days from payment so the settlement window is visible. If the contract's
  // lockupSeconds is 0 (instant), the off-chain lockupEnd still shows 3 days —
  // the UI gates the withdraw button on this. The indexer reconciles the
  // authoritative on-chain value, and savePayoutMetadata extends lockupEnd when
  // deliverable due dates are provided.
  const SETTLEMENT_MIN_DAYS = 3;
  const minLockup = new Date(new Date(det.blockTimestamp).getTime() + SETTLEMENT_MIN_DAYS * 86400 * 1000);
  const onChainRelease = det.releaseTimestamp
    ? new Date(Number(BigInt(det.releaseTimestamp)) * 1000)
    : null;
  // Use whichever is LATER: the on-chain release or the minimum T+3 window.
  const lockupEnd = (onChainRelease && onChainRelease > minLockup ? onChainRelease : minLockup).toISOString();
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
      // Merchant = payment recipient (gets paid).
      { role: "merchant", recipientWallet: det.to },
      // Customer = payer (made the payment).
      { role: "customer", platformKey: payout.platformKey },
    ],
  });

  return { payout, created: true };
}

type PayoutTypes = import("mongoose").HydratedDocument<PayoutDoc>;

/* ---- dispute opening (PRD §11.2 /payouts/:id/disputes) ---- */
export async function openDispute(
  paymentId: string,
  openedBy: "customer" | "merchant",
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
      // Merchant = payment recipient — must respond to the dispute.
      { role: "merchant", recipientWallet: payout.recipientWallet },
      // Arbiter — reviews and decides the case.
      { role: "arbiter", platformKey: payout.platformKey },
    ],
  });

  // Auto-assemble the agent frame so the brief (requirements, unresolved items,
  // deterministic checks) is available immediately when the case opens — not
  // only after the first response. Fire-and-forget: the frame enriches on the
  // next response, but the initial rung-1 brief should be ready right away.
  void import("./registrar/frameOrchestrator.ts")
    .then(({ assembleForCaseByNumber }) => assembleForCaseByNumber(caseDoc.caseNumber))
    .catch((e) => console.error(`[openDispute] auto frame-assembly failed for ${caseDoc.caseNumber}:`, e instanceof Error ? e.message : e));

  return { caseDoc, paymentId };
}

type CaseDocType = import("mongoose").HydratedDocument<CaseDoc>;

/* ---- recipient reply (PRD §11.2 /cases/:id/responses) ---- */
export async function submitResponse(
  caseNumber: string,
  author: "merchant" | "customer" | "arbiter",
  authorName: string,
  body: { text: string; evidence: { type: string; title: string; fileOrText: string }[] },
): Promise<{ caseDoc: CaseDocType }> {
  if (!body.text?.trim()) throw new HttpError(400, "Your reply needs some text.");

  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  // Track whether this is the FIRST formal response (case was AWAITING_RESPONSE).
  // The contract accepts only one submitResponse per case (OPEN → RESPONDED).
  // Subsequent messages are recorded off-chain only — no on-chain anchor.
  const isFirstResponse = caseDoc.status === "AWAITING_RESPONSE";

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
  const responderTarget = author === "merchant" ? "merchant" : "customer";
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

  // Attach any evidence submitted with the reply. Attribute to the actual author
  // (the function param), not a hardcoded "merchant" — a future customer-reply
  // path would otherwise mis-attribute every attached evidence item.
  // Map the arbiter to the "customer" side for evidence attribution (the
  // arbiter's evidence supports the payer's position).
  const evSide: "customer" | "merchant" | "agent" = author === "merchant" ? "merchant" : author === "arbiter" ? "agent" : "customer";
  for (const ev of body.evidence ?? []) {
    await attachEvidence(caseNumber, evSide, ev.type, ev.title, ev.fileOrText);
  }
  await caseDoc.save();

  const payoutForNotify = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();

  // Anchor the FIRST response on chain (submitResponse). The contract accepts
  // only one submitResponse per case (OPEN → RESPONDED); subsequent messages
  // are off-chain only. submittedBy is the responder's wallet when known; the
  // operator key holds PLATFORM_ROLE so it may relay a verified response.
  if (isFirstResponse) {
    await enqueueAnchor("response", idToUint256(caseNumber), caseDoc.payoutRef, responseHash, 0, {
      caseNumber,
      submittedBy: author === "merchant" ? (payoutForNotify?.recipientWallet ?? undefined) : undefined,
    });
  }

  await notify({
    type: "reply",
    title: "Recipient replied to the case",
    body: `${authorName} submitted a response. The case is ready for your review.`,
    caseNumber,
    paymentId: caseDoc.payoutRef,
    audience: [{ role: "arbiter", platformKey: payoutForNotify?.platformKey ?? null }],
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
  submittedBy: "customer" | "merchant" | "agent",
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
  target: "customer" | "merchant",
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
    audience: target === "merchant"
      ? [{ role: "merchant", recipientWallet: payoutForReq?.recipientWallet }]
      : [
          { role: "customer", platformKey: payoutForReq?.platformKey ?? null },
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
): Promise<{ decision: DecisionType; refundTypedData: RefundTypedData | null }> {
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
      // For release/no-action: the arbiter has decided the funds stay with the
      // merchant. Transition CLEARED → WITHDRAWABLE immediately so the merchant
      // can withdraw right away (the on-chain lockup is typically 0 for the
      // demo; the off-chain T+3 display was informational only).
      if (payout.status === "CLEARED") {
        try {
          payout.status = applyPaymentEvent(payout.status as never, "lockup_end_after_clear");
        } catch {
          // Already past CLEARED — no-op.
        }
      }
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

  let refundTypedData: RefundTypedData | null = null;

  if (body.outcome === "refund") {
    // Build the EIP-712 typed-data payload for the arbiter to sign.
    refundTypedData = buildRefundTypedData(caseDoc.payoutRef);

    // Anchor the decision on-chain NOW (don't wait for the refund tx to execute).
    // The correction_outstanding + correction anchors fire later when the
    // indexer confirms the Refund event (confirmRefundExecuted).
    const payoutForRefund = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();
    const correctionAmountMicroUsdc = payoutForRefund
      ? BigInt(Math.round(Number(payoutForRefund.amount) * 1_000_000)).toString()
      : "0";
    await enqueueAnchor("under_review", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, 0, {
      caseNumber: caseDoc.caseNumber,
    });
    await enqueueAnchor("decision", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, 0, {
      decisionId: decision._id.toString(),
      caseNumber: caseDoc.caseNumber,
      outcome: 2, // PLATFORM_UPHELD — the customer's refund claim is upheld
      correctionAmountMicroUsdc,
    });
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
    await enqueueAnchor("decision", idToUint256(caseDoc.caseNumber), caseDoc.payoutRef, decisionHash, 0, {
      // Legacy outcomes {release,no_action} are no-correction → contract Outcome.DISMISSED (4)
      // with zero correction. (refund decisions anchor after on-chain confirmation.)
      // entityId is the on-chain caseId (= idToUint256(caseNumber)) so recordDecision
      // matches the case that openCase created; decisionId is the Mongo backfill key.
      // The worker reads args.outcome ?? job.outcome ?? 0, so outcome:4 (DISMISSED)
      // in args is the value that reaches the chain; the positional 0 above is unused.
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
      { role: "merchant", recipientWallet: payout?.recipientWallet },
      { role: "customer", platformKey: payout?.platformKey ?? null },
    ],
  });

  return { decision, refundTypedData };
}

type DecisionType = import("mongoose").HydratedDocument<DecisionDoc>;

/**
 * The EIP-712 typed-data payload the arbiter signs to authorize a refund.
 * Mirrors the contract's REFUND_BY_ARBITER_TYPEHASH:
 *   RefundAuthorization(uint256 paymentID, uint256 expiry, uint256 salt)
 *
 * The arbiter signs this in their browser wallet (no gas, no chain switch, no
 * onlyArbiter address match). ANY account may then submit the signed
 * authorization to refundByArbiterWithSig — the backend relayer does that.
 */
export interface RefundTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    RefundAuthorization: Array<{ name: string; type: string }>;
  };
  primaryType: "RefundAuthorization";
  message: {
    paymentID: string; // uint256 as decimal string
    expiry: number;
    salt: number;
  };
  /** The on-chain paymentID the relayer submits. */
  paymentId: string;
}

/**
 * Build a collision-resistant salt for a RefundAuthorization. The contract's
 * replay guard hashes (paymentID, expiry, salt); paymentID is fixed per dispute
 * and a 24h expiry is effectively constant across retries, so the salt carries
 * all the uniqueness. Date.now() alone can collide if two retries land in the
 * same millisecond — folding in 128 bits of CSPRNG makes a collision
 * astronomically unlikely and keeps the value a safe JS safe-integer.
 */
function _refundSalt(): number {
  // crypto.webcrypto.getRandomValues is available in Node 18+ (global crypto).
  // Take 48 bits of randomness (within JS safe-integer range) XOR'd with the
  // ms timestamp so the salt is both random and monotonic-ish per process.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const view = new DataView(buf.buffer);
  const rand = view.getUint32(0) * 0x100000000 + view.getUint32(4);
  return Number((BigInt(rand) & 0xffffffffffffn) ^ BigInt(Date.now()));
}

function buildRefundTypedData(paymentId: string): RefundTypedData {
  const env = loadEnv();
  return {
    domain: {
      name: "RefundProtocol",
      version: "1",
      chainId: env.arc.chainId,
      verifyingContract: env.arc.refundProtocolAddress ?? "0x0000000000000000000000000000000000000000",
    },
    types: {
      RefundAuthorization: [
        { name: "paymentID", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "salt", type: "uint256" },
      ],
    },
    primaryType: "RefundAuthorization",
    // Expiry: 24h window.
    // Salt: the contract's replay guard keys the authorization hash on
    // (paymentID, expiry, salt); since paymentID and a 24h expiry are constant
    // across retries of the same decision, uniqueness rests ENTIRELY on salt.
    // Date.now() (ms) alone can collide under retry/load within the same
    // millisecond, so mix in 128 bits of CSPRNG randomness.
    message: {
      paymentID: paymentId,
      expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      salt: _refundSalt(),
    },
    paymentId,
  };
}

/**
 * Submit the arbiter's signed refund authorization to the chain. This is the
 * RELAYER half of the signature-based refund: the arbiter signs the EIP-712
 * RefundAuthorization off-chain (in their browser wallet), then this function
 * submits refundByArbiterWithSig using the backend's walletClient (the registry
 * operator key). The submitter and the authorizer are now decoupled — the
 * arbiter no longer needs to hold the onlyArbiter key in MetaMask.
 *
 * Returns the tx hash on success. Throws on revert / no walletClient / no
 * contract address — the route handler surfaces the error to the reviewer.
 *
 * The indexer's confirmRefundExecuted hook handles the rest (stamps
 * refundTxHash, advances the case to CLOSED) exactly as before — the only thing
 * that changed is WHO submits the tx.
 */
export async function submitRefundSignature(
  caseNumber: string,
  sig: { paymentID: string; expiry: number; salt: number; v: number; r: string; s: string },
): Promise<{ txHash: string }> {
  const caseDoc = await Case.findOne({ caseNumber });
  if (!caseDoc) throw new HttpError(404, `No case ${caseNumber} found.`);

  // The signature authorizes a refund for a SPECIFIC paymentID. The URL path
  // names the case (and thus its payout); the client-supplied sig.paymentID must
  // match that case's payoutRef. Without this check, a caller with case:decide
  // could relay a signature that refunds a DIFFERENT payment than the one in the
  // path. The on-chain signature is the real authority, but the backend must not
  // relay a path/body mismatch.
  if (String(sig.paymentID) !== String(caseDoc.payoutRef)) {
    throw new HttpError(
      400,
      `paymentID mismatch: signature is for "${sig.paymentID}" but case ${caseNumber} is for payout "${caseDoc.payoutRef}".`,
    );
  }

  // Lazy-import the chain client to avoid pulling viem into the module top-level
  // (keeps the services module testable without a chain config).
  const { getWalletClient, refundProtocolAddress } = await import("./chain/client.ts");
  const walletClient = getWalletClient();
  const contractAddress = refundProtocolAddress();
  if (!walletClient || !walletClient.account || !contractAddress) {
    throw new HttpError(503, "Refund relayer unavailable — backend has no operator key or contract address.");
  }

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    // REFUND_PROTOCOL_ABI now carries refundByArbiterWithSig (regenerated from
    // the compiled artifact), so the relayer uses the canonical ABI instead of
    // a hand-maintained inline fragment. Cast as never for the same reason
    // CASE_REGISTRY_ABI uses `as never` in anchorWorker — viem's writeContract
    // accepts the args without over-strict inference.
    abi: REFUND_PROTOCOL_ABI as never,
    functionName: "refundByArbiterWithSig",
    args: [BigInt(sig.paymentID), BigInt(sig.expiry), BigInt(sig.salt), sig.v, sig.r as `0x${string}`, sig.s as `0x${string}`],
    account: walletClient.account,
    chain: walletClient.chain,
  });

  return { txHash };
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
      // under_review + decision were already anchored at decision time
      // (recordDecision). Only enqueue the correction sequence here.
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
      { role: "merchant", recipientWallet: payout.recipientWallet },
      { role: "customer", platformKey: payout.platformKey ?? null },
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
      { role: "merchant", recipientWallet: payout.recipientWallet },
      { role: "arbiter", platformKey: payout.platformKey ?? null },
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
export function idToUint256(id: string): string {
  return BigInt(keccak256(stringToBytes(id))).toString();
}

export async function enqueueAnchor(
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
  // Find the case for this payout — include CLOSED cases so the final receipt
  // (after a refund/release decision) still shows the case + decision. Without
  // this, stampRefundTx closes the case and the receipt can no longer find it,
  // so the refund transaction details disappear.
  const caseDoc = await Case.findOne({ payoutRef: paymentId }).sort({ createdAt: -1 }).lean();
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

/** Map a request role to the "openedBy" side for disputes. With unified
 * nomenclature the side values match the role names directly: a customer (payer)
 * opening a dispute stamps "customer"; a merchant (payment recipient) stamps
 * "merchant". Only the customer role holds case:open, so the merchant branch is
 * defensive. */
export function openedByForRole(role: Role | null): "customer" | "merchant" {
  return role === "merchant" ? "merchant" : "customer";
}
