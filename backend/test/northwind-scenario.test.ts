/* ============================================================================
   Northwind × Kestrel runnable-scenario tests.
   Proves: the seed links Payout↔WorkOrder↔Case; it is idempotent; and the
   end-to-end agent pipeline (assembleForCaseByNumber) yields the load-bearing
   order-of-performance FAIL finding (clause 41) for the M3 tranche. Also proves
   the new WorkOrder deliverable timestamp fields are backward-compatible.
   Uses mongodb-memory-server. Models unplugged → rung ≥ 1 (deterministic parts).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Payout, WorkOrder, Case } from "../src/models/index.ts";
import { DraftFrame } from "../src/registrar/models.ts";
import {
  seedNorthwindScenario,
  NORTHWIND_CASE_NUMBER,
  NORTHWIND_PAYMENT_ID,
} from "../src/seed/northwind-scenario.ts";
import { assembleForCaseByNumber } from "../src/registrar/frameOrchestrator.ts";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Payout.deleteMany({}),
    WorkOrder.deleteMany({}),
    Case.deleteMany({}),
    DraftFrame.deleteMany({}),
  ]);
});

describe("Northwind scenario seed", () => {
  it("inserts a linked Payout + WorkOrder + Case", async () => {
    await seedNorthwindScenario();
    const payout = await Payout.findOne({ paymentId: NORTHWIND_PAYMENT_ID }).lean();
    const workOrder = await WorkOrder.findOne({ paymentId: NORTHWIND_PAYMENT_ID }).lean();
    const caseDoc = await Case.findOne({ caseNumber: NORTHWIND_CASE_NUMBER }).lean();

    expect(payout).not.toBeNull();
    expect(workOrder).not.toBeNull();
    expect(caseDoc).not.toBeNull();
    // Linkage: Case.payoutRef → Payout.paymentId → WorkOrder.paymentId.
    expect(caseDoc!.payoutRef).toBe(NORTHWIND_PAYMENT_ID);
    expect(workOrder!.paymentId).toBe(NORTHWIND_PAYMENT_ID);
    // The contested tranche amount.
    expect(payout!.amount).toBe("500");
    expect(caseDoc!.allegationAmountContested).toBe("500");
    // The premature M3 release timestamp.
    expect(payout!.paidAt).toBe("2025-06-17T00:00:00Z");
  });

  it("is idempotent — a second call inserts nothing", async () => {
    await seedNorthwindScenario();
    const first = await Case.countDocuments({});
    await seedNorthwindScenario();
    const second = await Case.countDocuments({});
    expect(second).toBe(first);
  });

  it("records the M3 lifecycle timestamps on the contested deliverable", async () => {
    await seedNorthwindScenario();
    const wo = await WorkOrder.findOne({ paymentId: NORTHWIND_PAYMENT_ID }).lean();
    const m3 = wo!.deliverables.find((d) => d.name === "UI motion assets");
    expect(m3).toBeDefined();
    expect(m3!.submittedAt).toBe("2025-06-15T00:00:00Z");
    expect(m3!.acceptedAt).toBeNull(); // meaningful null — no written acceptance
    expect(m3!.rejectedAt).toBe("2025-06-20T00:00:00Z");
    // M1/M2 were accepted in the correct order.
    const m1 = wo!.deliverables.find((d) => d.name.startsWith("M1"));
    expect(m1!.acceptedAt).toBe("2025-05-16T00:00:00Z");
  });
});

describe("Northwind scenario — end-to-end ordering finding", () => {
  it("assembleForCaseByNumber yields the clause-41 ordering FAIL for M3", async () => {
    await seedNorthwindScenario();

    // The model is unplugged in test → the frame degrades to rung 1, but the
    // deterministic proof checks + outcome requirements always persist.
    const result = await assembleForCaseByNumber(NORTHWIND_CASE_NUMBER);
    expect(result.degradeLevel).toBeLessThanOrEqual(1); // rung 0 or 1, never 2
    expect(result.frame).not.toBeNull();

    // The persisted frame must carry the ordering requirement: the PLATFORM_UPHELD
    // outcome line references the clause-41 ordering finding.
    const frameDoc = await DraftFrame.findOne({ caseId: NORTHWIND_CASE_NUMBER })
      .sort({ createdAt: -1 }).lean();
    expect(frameDoc).not.toBeNull();

    const platformReq = frameDoc!.requirements.find(
      (r: { outcome: string }) => r.outcome === "PLATFORM_UPHELD",
    ) as { filledParams?: Record<string, string> } | undefined;
    expect(platformReq).toBeDefined();
    // The ordering-aware template cites clause 41 in the filled text/params.
    const orderingParam = platformReq!.filledParams?.orderingFailed;
    expect(orderingParam).toBeTruthy();
    expect(orderingParam).toContain("payment_ordering:");
  }, 20000);
});

describe("WorkOrder deliverable timestamps — backward compatibility", () => {
  it("a legacy work order (no timestamp fields) yields 'missing' ordering findings, not 'fail'", async () => {
    // A work order shaped exactly like the legacy 3-field deliverable — no
    // submittedAt/acceptedAt/rejectedAt. The paymentOrdering check is opt-in
    // (inert when acceptanceTimestamps is absent), so no ordering finding fires.
    const paymentId = "legacy-wo-test";
    await Payout.create({
      paymentId, chain: "arc", contractAddress: "0x1", txHash: "0xT" + paymentId,
      amount: "100", refundTo: "0xp", platformKey: "p", recipientKey: "r",
      recipientWallet: "0xr", workOrderRef: null, trancheIndex: null,
      disputeDeadline: new Date(Date.now() + 86_400_000).toISOString(),
      lockupEnd: new Date(Date.now() + 86_400_000).toISOString(),
      status: "ESCROWED", receiptHash: "0x", paidAt: new Date().toISOString(),
    });
    await WorkOrder.create({
      platformKey: "p", recipientKey: "r", description: "legacy", amount: "100",
      currency: "USDC", status: "open", paymentId,
      deliverables: [{ name: "Video", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "x" }],
      documents: [],
    });

    // Run the frame pipeline for a case on this legacy work order.
    const caseNumber = "CASE-LEGACY01";
    await Case.create({
      caseNumber, payoutRef: paymentId, openedBy: "platform",
      allegationClaimType: "non_delivery", allegationFreeText: "legacy",
      allegationAmountContested: "100", status: "UNDER_REVIEW", infoRequestCount: 0,
      infoRequests: [], responseDeadline: new Date(Date.now() + 86_400_000).toISOString(),
      caseHash: "0x", openedAt: new Date().toISOString(),
    });

    const result = await assembleForCaseByNumber(caseNumber);
    expect(result.frame).not.toBeNull();
    // The frame persists (deterministic parts); no spurious ordering finding.
    const frameDoc = await DraftFrame.findOne({ caseId: caseNumber }).lean();
    const platformReq = frameDoc!.requirements.find(
      (r: { outcome: string }) => r.outcome === "PLATFORM_UPHELD",
    ) as { filledParams?: Record<string, string> } | undefined;
    // Legacy case → no ordering finding → the ordering param is "none".
    expect(platformReq!.filledParams?.orderingFailed).toBe("none");
  }, 20000);
});
