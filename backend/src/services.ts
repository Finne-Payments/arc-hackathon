import { canonicalHash, sha256Hex } from "./canonical.ts";
import { applyCaseEvent, applyPaymentEvent, IllegalTransitionError } from "./stateMachines.ts";
import { HttpError } from "./errors.ts";
import { outcomeCode, type DecisionOutcome } from "./statusVocabulary.ts";
import type { Role } from "./rbac.ts";
import { notify } from "./notify.ts";
import {
  AnchorJob,
  Brief,
  Case,
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
} from "./models/index.ts";
import { loadEnv } from "./env.ts";

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
 * `NB-MAYA-001`), sequenced per platform+recipient pair. Falls back to the
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
  // sender isn't a known user, fall back to the address-derived key.
  let platformKey = det.txSender ? det.txSender.toLowerCase().slice(0, 10) : "unknown";
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

  await enqueueAnchor("receipt", payout.paymentId, payout.paymentId, receiptHash);

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

  await enqueueAnchor("case", caseDoc.caseNumber, paymentId, caseHash);

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

  try {
    const after = applyCaseEvent(
      { status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount },
      "reply_received",
    );
    caseDoc.status = after.status;
  } catch (e) {
    asStateError(e, "case");
  }

  // Stamp the open info request as answered (if any).
  const openReq = [...caseDoc.infoRequests].reverse().find((r) => !r.answeredAt);
  if (openReq) openReq.answeredAt = new Date().toISOString();

  await ResponseModel.create({
    caseRef: caseNumber,
    author,
    authorName,
    text: body.text,
    evidenceRefs: [],
    submittedAt: new Date().toISOString(),
  });

  // Attach any evidence submitted with the reply.
  for (const ev of body.evidence ?? []) {
    await attachEvidence(caseNumber, "recipient", ev.type, ev.title, ev.fileOrText);
  }
  await caseDoc.save();

  const payoutForNotify = await Payout.findOne({ paymentId: caseDoc.payoutRef }).lean();
  await notify({
    type: "reply",
    title: "Recipient replied to the case",
    body: `${authorName} submitted a response. The case is ready for your review.`,
    caseNumber,
    paymentId: caseDoc.payoutRef,
    audience: [{ role: "reviewer", platformKey: payoutForNotify?.platformKey ?? null }],
  });

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
    const after = applyCaseEvent(
      { status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount },
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
    const after = applyCaseEvent(
      { status: caseDoc.status as never, infoRequestCount: caseDoc.infoRequestCount },
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
    await enqueueAnchor("decision", decision._id.toString(), caseDoc.payoutRef, decisionHash, outcomeCode(body.outcome));
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
      await enqueueAnchor("decision", decision._id.toString(), paymentId, decision.decisionHash, 1);
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

/* ---- anchor job enqueue (no-op worker in this build; documented stub) ---- */
async function enqueueAnchor(
  kind: "receipt" | "case" | "decision",
  entityId: string,
  paymentId: string,
  hash: string,
  outcome = 0,
): Promise<void> {
  await AnchorJob.create({
    kind,
    entityId,
    paymentId,
    hash,
    disputeDeadline: 0,
    outcome,
    status: "queued",
    attempts: 0,
    lastError: null,
    anchorTx: null,
  });
  // No real anchor worker in this build — see docs/REMAINING_ISSUES.md (PH-4).
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

  return {
    payout,
    workOrder,
    case: caseDoc,
    responses,
    evidence: evidence.map((e) => ({ ...e, fileOrText: undefined, sha256: e.sha256 })), // fingerprints only (P3)
    brief: briefs.length ? { latest: briefs[briefs.length - 1], versions: briefs.length } : null,
    decision,
  };
}

export interface SharedCaseBody {
  payout: unknown;
  workOrder: unknown;
  case: unknown;
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
    workOrder,
    case: caseDoc,
    decision,
    evidence: evidence.map((e) => ({ ...e, fileOrText: undefined })),
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
