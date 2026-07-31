import { dropDataCollections } from "./db.ts";
import {
  AnchorJob,
  Brief,
  Case,
  ChainEvent,
  Decision,
  Evidence,
  Meta,
  Payout,
  Platform,
  Recipient,
  Response as ResponseModel,
  WorkOrder,
} from "./models/index.ts";
import { canonicalHash, sha256Hex } from "./canonical.ts";
import { outcomeCode } from "./statusVocabulary.ts";
import { loadEnv } from "./env.ts";

/* ============================================================================
   Frozen demo fixtures (PRD §18.3, D5). Idempotent one-command seed that
   rebuilds the world the UI renders: Northbeam Studios ↔ Maya Reyes; work
   order "Three product videos — spring launch" (100 USDC, 3 deliverables,
   2 delivered); CASE-0142 under review; evidence; brief v2; the scenario-A
   default. Scenario B (debt path) is selectable.

   This is the source of truth that matches web/src/data.ts byte-for-byte.
   ========================================================================== */

export interface SeedOptions {
  scenario: "A" | "B";
  withReply: boolean;
  stage?: string; // override: awaiting_response | under_review | more_info | decided
}

export interface SeedResult {
  caseNumber: string;
  paymentIds: string[];
  scenario: "A" | "B";
  stage: string;
}

const IDS = {
  northbeamWallet: "0x4B2109cE55aa10bd3F41c0e88a7cD10a5f9E9d3E",
  mayaWallet: "0x9fA30bb7e2Dd41Ac09918e6b7cAf24E60f21C77b",
  payTx: "0x7c9e42d18aa0be5533c60912ff74d02b81ce6f2a4d3b90e17c55a8d90124a1f2",
  refundTx: "0x2e61aa04cd97f1b3805592e0c11da6b47f30918ce2ab5d6f01c744e5a90ab8c4",
  receiptFp: "0x91b4dd2670e5ac03f1189b5a44c07de2531f60c8ba92e14d70a3b6c255e30d18",
};

export async function seedDemoWorld(opts: SeedOptions): Promise<SeedResult> {
  await dropDataCollections();

  // --- heartbeat (so /status isn't stale immediately) ---
  await Meta.findOneAndUpdate(
    { key: "indexer:heartbeat" },
    { value: { at: new Date().toISOString(), block: 1 }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );

  // --- platform + recipient ---
  await Platform.create({
    key: "northbeam",
    name: "Northbeam Studios",
    payWallet: IDS.northbeamWallet,
    refundAddress: IDS.northbeamWallet,
    arbiterAddress: IDS.northbeamWallet,
    arbiterName: "Dana Whitfield",
    policySummary: "Money unlocks 30 days after payment unless a dispute is open.",
    policyLockupSeconds: 30 * 86400,
    policyResponseWindowHours: 72,
  });
  await Recipient.create({
    key: "maya",
    displayName: "Maya Reyes",
    walletAddress: IDS.mayaWallet,
    platformKey: "northbeam",
  });
  // Secondary recipients/merchants for the ledger/platform views.
  await Recipient.create({ key: "jonah", displayName: "Jonah Park", walletAddress: "0x1a2B3c4D5e6F000000000000000000000000Aa11", platformKey: "northbeam" });
  await Recipient.create({ key: "priya", displayName: "Priya Nair", walletAddress: "0x1a2B3c4D5e6F000000000000000000000000Bb22", platformKey: "northbeam" });
  await Recipient.create({ key: "tomas", displayName: "Tomás Rivera", walletAddress: "0x1a2B3c4D5e6F000000000000000000000000Cc33", platformKey: "northbeam" });
  await Recipient.create({ key: "alex", displayName: "Alex Chen", walletAddress: "0x1a2B3c4D5e6F000000000000000000000000Dd44", platformKey: "northbeam" });
  await Platform.create({
    key: "halcyon",
    name: "Halcyon Press",
    payWallet: "0xHa1c000000000000000000000000000000000000",
    refundAddress: "0xHa1c000000000000000000000000000000000000",
    arbiterAddress: "0xHa1c000000000000000000000000000000000000",
    arbiterName: "Halcyon Arbiter",
    policySummary: "Standard 30-day protection.",
    policyLockupSeconds: 30 * 86400,
    policyResponseWindowHours: 72,
  });
  await Platform.create({
    key: "copperline",
    name: "Copperline Audio",
    payWallet: "0xC07b000000000000000000000000000000000000",
    refundAddress: "0xC07b000000000000000000000000000000000000",
    arbiterAddress: "0xC07b000000000000000000000000000000000000",
    arbiterName: "Copperline Arbiter",
    policySummary: "Standard 30-day protection.",
    policyLockupSeconds: 30 * 86400,
    policyResponseWindowHours: 72,
  });

  // --- work order (the 3-video order) ---
  const workOrderDesc = "Three product videos — spring launch";
  await WorkOrder.create({
    platformKey: "northbeam",
    recipientKey: "maya",
    description: workOrderDesc,
    deliverables: [
      { name: "Video 1 — product hero", due: "30 Jun", acceptanceCriteria: "Delivered ready for the site" },
      { name: "Video 2 — feature walkthrough", due: "7 Jul", acceptanceCriteria: "Delivered ready for the site" },
      { name: "Video 3 — customer story cut", due: "12 Jul", acceptanceCriteria: "Delivered ready for the site" },
    ],
    amount: "100",
    currency: "USDC",
    status: "open",
  });

  // --- payouts (ledger rows) ---
  const now = Date.now();
  const disputedDeadline = new Date(now + 6 * 3600 * 1000 + 11 * 60 * 1000).toISOString();
  const lockupEnd = (days: number, fromDaysAgo: number) =>
    new Date(now - fromDaysAgo * 86400 * 1000 + days * 86400 * 1000).toISOString();

  const payments = [
    makePayout("1", "maya", "Maya Reyes", "100", workOrderDesc, 17, disputedDeadline, lockupEnd(13, 17), "DISPUTED", "14 Jul"),
    makePayout("2", "jonah", "Jonah Park", "250", "Brand guidelines refresh", 10, lockupEnd(20, 10), lockupEnd(20, 10), "ESCROWED", "21 Jul"),
    makePayout("3", "priya", "Priya Nair", "80", "Landing page copy — v2", 13, lockupEnd(17, 13), lockupEnd(17, 13), "ESCROWED", "18 Jul"),
    makePayout("4", "tomas", "Tomás Rivera", "120", "Podcast editing, June batch", 29, "", lockupEnd(0, 29), "WITHDRAWN", "2 Jul"),
    makePayout("5", "alex", "Alex Chen", "60", "Icon set — payments module", 36, "", lockupEnd(0, 36), "REFUNDED", "25 Jun"),
  ];
  for (const p of payments) {
    const receiptHash = canonicalHash({
      paymentId: p.paymentId, chain: p.chain, contractAddress: p.contractAddress,
      txHash: p.txHash, amount: p.amount, refundTo: p.refundTo,
      recipientKey: p.recipientKey, platformKey: p.platformKey, paidAt: p.paidAt,
    });
    await Payout.create({ ...p, receiptHash });
  }

  // --- the case (CASE-0142) ---
  const stage = opts.stage ?? (opts.scenario === "B" ? "decided" : "under_review");
  const responseDeadline = disputedDeadline;
  const caseHash = canonicalHash({
    payoutRef: "1", openedBy: "platform",
    allegation: { claimType: "work_not_delivered_in_full", freeText: "Video 3 not delivered", amountContested: "33" },
    openedAt: new Date(now - 9 * 86400 * 1000).toISOString(),
  });

  let caseStatus = "AWAITING_RESPONSE";
  if (stage === "under_review" || stage === "more_info" || (stage === "decided" && opts.withReply)) {
    caseStatus = "UNDER_REVIEW";
  }
  if (stage === "decided") caseStatus = "CLOSED";

  const infoRequests =
    stage === "more_info"
      ? [{ target: "recipient", text: "Please attach the original transfer-link email for Video 3.", requestedAt: "2026-07-26T10:02:00Z", answeredAt: null }]
      : [];

  await Case.create({
    caseNumber: "CASE-0142",
    payoutRef: "1",
    openedBy: "platform",
    allegationClaimType: "work_not_delivered_in_full",
    allegationFreeText: "Videos 1 and 2 arrived and are live on our site. Video 3 was due 12 July and has not been delivered.",
    allegationAmountContested: "33",
    status: caseStatus,
    infoRequestCount: infoRequests.length,
    infoRequests,
    responseDeadline,
    caseHash,
    openedAt: new Date(now - 9 * 86400 * 1000).toISOString(),
    registryAnchorTx: null,
  });

  // closed historical case
  await Case.create({
    caseNumber: "CASE-0137",
    payoutRef: "5",
    openedBy: "platform",
    allegationClaimType: "work_not_delivered_in_full",
    allegationFreeText: "Icon set incomplete.",
    allegationAmountContested: "60",
    status: "CLOSED",
    infoRequestCount: 0,
    infoRequests: [],
    responseDeadline: "2026-07-12T00:00:00Z",
    caseHash: canonicalHash({ payoutRef: "5", openedAt: "2026-07-10T00:00:00Z" }),
    openedAt: "2026-07-10T00:00:00Z",
    registryAnchorTx: null,
  });

  // --- evidence on record ---
  const ev = (caseRef: string | null, payoutRef: string, submittedBy: "platform" | "recipient" | "agent", type: string, title: string, fileOrText: string, extra: Partial<EvidenceSeed> = {}) =>
    ({ caseRef, payoutRef, submittedBy, type, title, fileOrText, sha256: sha256Hex(fileOrText), submittedAt: "2026-07-14T00:00:00Z", ...extra });
  interface EvidenceSeed { caseRef: string | null; payoutRef: string; submittedBy: string; type: string; title: string; fileOrText: string; sha256: string; submittedAt: string; showOnlyAfterReply?: boolean; kind?: string }

  const evidenceRows: EvidenceSeed[] = [
    ev("CASE-0142", "1", "platform", "work order", "Work order — three product videos", "Northbeam Studios work order for three product videos.", { kind: "doc" }),
    ev("CASE-0142", "1", "recipient", "deliverable", "final_hero_v3.mp4", "Video 1 hero film bytes.", { kind: "video" }),
    ev("CASE-0142", "1", "recipient", "deliverable", "feature_walkthrough_final.mp4", "Video 2 feature walkthrough bytes.", { kind: "video" }),
    ev("CASE-0142", "1", "platform", "checklist", "Delivery checklist export", "Northbeam delivery checklist export.", { kind: "doc" }),
    ev("CASE-0142", "1", "recipient", "message", "Screen recording — expired transfer link", "Screen recording of the expired transfer-link page.", { showOnlyAfterReply: true, kind: "video" }),
    ev("CASE-0142", "1", "agent", "chain event", "Payment record on Arc", `Payment 1 on Arc: tx ${IDS.payTx}`, { kind: "doc" }),
  ];
  for (const e of evidenceRows) await Evidence.create(e);

  // --- response (Maya's reply) — present unless awaiting_response ---
  if (opts.withReply && stage !== "awaiting_response") {
    await ResponseModel.create({
      caseRef: "CASE-0142",
      author: "recipient",
      authorName: "Maya Reyes",
      text: "I sent Video 3 on 11 July through a file-transfer link, a day before the deadline. The link expired after seven days and I didn't keep the delivery confirmation. I've attached a screen recording of the expired link page. I can re-deliver the file today if that helps resolve this.",
      evidenceRefs: [],
      submittedAt: "2026-07-24T16:44:00Z",
    });
  }

  // --- agent brief v2 (the 2-of-3 case) ---
  const checks = [
    { check: "Video 1 file on record", expected: "1 file", found: "final_hero_v3.mp4", result: "pass" },
    { check: "Video 2 file on record", expected: "1 file", found: "feature_walkthrough_final.mp4", result: "pass" },
    { check: "Video 3 file on record", expected: "1 file", found: "none", result: "missing" },
    { check: "Payment matches work order amount", expected: "100 USDC", found: "100 USDC on chain", result: "pass" },
  ];
  await Brief.create({
    caseRef: "CASE-0142",
    payoutRef: "1",
    version: 2,
    checks,
    inconsistencies: ["The response states the work was delivered; no file or delivery confirmation for Video 3 appears in the evidence record."],
    missingItems: ["Video 3 final file · delivery confirmation for Video 3."],
    generatedAt: "2026-07-24T16:45:00Z",
    agentVersion: "finne-proof-agent/0.1",
  });

  // --- decision (only when stage=decided) ---
  if (stage === "decided") {
    const decisionBody = {
      caseRef: "CASE-0142",
      outcome: "refund",
      decidedByName: "Dana Whitfield",
      decidedByWallet: IDS.northbeamWallet,
      reason:
        "The work order covers three videos of equal value. Two are on file and confirmed delivered. No file or delivery confirmation for the third video appears in the record, and the reply did not add one within the response window. The contested 33 USDC returns to the refund address fixed when the payment was made; the remaining 67 USDC stays with Maya Reyes.",
      decidedAt: "2026-07-29T15:42:00Z",
    };
    const decisionHash = canonicalHash(decisionBody);
    await Decision.create({ ...decisionBody, decisionHash, refundTxHash: IDS.refundTx, executedAt: "2026-07-29T15:42:00Z", registryAnchorTx: null });

    // mark payment refunded
    await Payout.updateOne({ paymentId: "1" }, { $set: { status: opts.scenario === "B" ? "DEBT_OUTSTANDING" : "REFUNDED", refundTxHash: IDS.refundTx } });

    // anchor job (queued; no real worker in this build)
    await AnchorJob.create({
      kind: "decision", entityId: "CASE-0142", paymentId: "1", hash: decisionHash,
      disputeDeadline: 0, outcome: outcomeCode("refund"), status: "queued", attempts: 0, lastError: null, anchorTx: null,
    });
  }

  // --- chain events (for the demo status strip) ---
  await ChainEvent.insertMany([
    { txHash: IDS.payTx, logIndex: 0, block: 1, contract: "RefundProtocol", eventName: "PaymentCreated", decodedArgs: { paymentId: "1" }, seenAt: "2026-07-14T14:06:00Z" },
    { txHash: "0xabc1", logIndex: 0, block: 2, contract: "FinneCaseRegistry", eventName: "CaseOpened", decodedArgs: { caseNumber: "CASE-0142" }, seenAt: "2026-07-22T09:19:00Z" },
    { txHash: IDS.refundTx, logIndex: 0, block: 3, contract: "RefundProtocol", eventName: "Refund", decodedArgs: { paymentId: "1" }, seenAt: "2026-07-29T15:42:00Z" },
  ]);

  const env = loadEnv();
  void env;

  return {
    caseNumber: "CASE-0142",
    paymentIds: ["1", "2", "3", "4", "5"],
    scenario: opts.scenario,
    stage,
  };
}

function makePayout(
  paymentId: string, recipientKey: string, recipientWalletLabel: string, amount: string,
  purpose: string, paidDaysAgo: number, disputeDeadline: string, lockupEnd: string, status: string, paidLabel: string,
) {
  const WALLET: Record<string, string> = {
    maya: IDS.mayaWallet,
    jonah: "0x1a2B3c4D5e6F000000000000000000000000Aa11",
    priya: "0x1a2B3c4D5e6F000000000000000000000000Bb22",
    tomas: "0x1a2B3c4D5e6F000000000000000000000000Cc33",
    alex: "0x1a2B3c4D5e6F000000000000000000000000Dd44",
  };
  void recipientWalletLabel;
  const paidAt = new Date(Date.now() - paidDaysAgo * 86400 * 1000).toISOString();
  return {
    paymentId,
    chain: loadEnv().arc.chainName,
    contractAddress: loadEnv().arc.refundProtocolAddress ?? "",
    txHash: paymentId === "1" ? IDS.payTx : `0x${paymentId.padStart(64, "0")}`,
    amount,
    refundTo: IDS.northbeamWallet,
    platformKey: "northbeam",
    recipientKey,
    recipientWallet: WALLET[recipientKey] ?? recipientWalletLabel,
    workOrderRef: recipientKey === "maya" ? `maya:${purpose}` : null,
    trancheIndex: null,
    disputeDeadline,
    lockupEnd,
    paidAt,
    status,
    registryAnchorTx: null,
    refundTxHash: status === "REFUNDED" || status === "DEBT_OUTSTANDING" ? IDS.refundTx : null,
    withdrawTxHash: status === "WITHDRAWN" ? `0xwithdraw${paymentId}` : null,
    paidLabel,
  };
}

/* When run directly: connect + seed + exit. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { connectDb } = await import("./db.ts");
  const { disconnectDb } = await import("./db.ts");
  await connectDb();
  const scenario = (process.argv.includes("--scenario=B") || process.env.SEED_SCENARIO === "B") ? "B" : "A";
  const withReply = !process.argv.includes("--no-reply");
  const stage = process.env.SEED_STAGE;
  const result = await seedDemoWorld({ scenario, withReply, stage });
  // eslint-disable-next-line no-console
  console.log("[seed] demo world built:", result);
  await disconnectDb();
  process.exit(0);
}
