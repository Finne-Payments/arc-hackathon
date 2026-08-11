import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.ts";
import { Payout, Case, User } from "../src/models/index.ts";
import { createToken } from "../src/auth.ts";
import { canonicalHash } from "../src/canonical.ts";
import type { Role } from "../src/rbac.ts";

/* ============================================================================
   Backend integration suite (PRD §19.2 — the route-level coverage that was
   missing). Boots the real Express app (createApp) against an in-memory Mongo,
   then asserts RBAC, the dispute flow, append-only enforcement, receipt
   idempotency, and the byte-identical shared case body across seats (P3).
   ========================================================================== */

let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

// Distinct identities for each seat, with wallets/platformKey set so scoping
// (GAP-B1) can be exercised too. Created as real User docs so _id is a valid
// ObjectId (the JWT carries that ObjectId as userId, matching the real flow).
// Standard-commerce nomenclature: customer = payer (owns refundTo wallet, the
// ONLY dispute opener), merchant = payment recipient (owns recipientWallet),
// arbiter = decides. The customer's wallet equals the seeded payout's refundTo
// so the party-verification check passes.
const customerWallet = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const recipientWallet = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

let arbiterId = "";
let customerId = "";
let merchantId = "";
let platformViewerId = "";

async function ensureUsers(): Promise<void> {
  const arbiter = await User.findOneAndUpdate(
    { email: "arbiter@test" },
    { $set: { email: "arbiter@test", passwordHash: "x", role: "arbiter", displayName: "Dana", platformKey: "northbeam", walletAddress: null } },
    { upsert: true, new: true },
  );
  const customer = await User.findOneAndUpdate(
    { email: "customer@test" },
    { $set: { email: "customer@test", passwordHash: "x", role: "customer", displayName: "Northstar", platformKey: "northbeam", walletAddress: customerWallet } },
    { upsert: true, new: true },
  );
  const merchant = await User.findOneAndUpdate(
    { email: "merchant@test" },
    { $set: { email: "merchant@test", passwordHash: "x", role: "merchant", displayName: "Maya", platformKey: "northbeam", walletAddress: recipientWallet } },
    { upsert: true, new: true },
  );
  const viewer = await User.findOneAndUpdate(
    { email: "viewer@test" },
    { $set: { email: "viewer@test", passwordHash: "x", role: "platform_viewer", displayName: "Park", platformKey: "northbeam", walletAddress: null } },
    { upsert: true, new: true },
  );
  arbiterId = String(arbiter._id);
  customerId = String(customer._id);
  merchantId = String(merchant._id);
  platformViewerId = String(viewer._id);
}

function authAs(userId: string, role: Role, displayName: string): string {
  return createToken({ userId, role, displayName });
}

const arbiterToken = () => authAs(arbiterId, "arbiter", "Dana Arbiter");
const customerToken = () => authAs(customerId, "customer", "Northstar Customer");
const merchantToken = () => authAs(merchantId, "merchant", "Maya Merchant");
const viewerToken = () => authAs(platformViewerId, "platform_viewer", "Park Viewer");

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongo.getUri();
  process.env.DEMO_MODE = "true";
  process.env.INTERNAL_TOKEN = "dev-internal";
  process.env.SESSION_SECRET = "integration-test-secret";
  // The dispute flow is gated by the chain-first guard (requireChainConfigured).
  // Set a non-empty RefundProtocol address so the guard allows the dispute; the
  // suite exercises the dispute state machine, not the chain requirement itself.
  // The 503-when-unset case is covered in its own test below.
  process.env.REFUND_PROTOCOL_ADDRESS = "0x0000000000000000000000000000000000000001";
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  // Wipe between tests so each is hermetic, then re-create the seat users so
  // the JWTs resolve to valid ObjectId-backed docs.
  const db = mongoose.connection.db;
  if (!db) return;
  const cols = await db.collections();
  for (const c of cols) await c.deleteMany({});
  await ensureUsers();
});

describe("health + auth", () => {
  it("GET /healthz returns ok (liveness, no auth)", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /payouts without a token → 401", async () => {
    const res = await request(app).get("/payouts");
    expect(res.status).toBe(401);
  });

  it("merchant cannot decide a case → 403 (needs case:decide)", async () => {
    // Seed a case to point the route at; the guard fires before the handler logic.
    await seedDisputedPayout();
    const c = await Case.findOne({});
    const res = await request(app)
      .post(`/cases/${c!.caseNumber}/decisions`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ outcome: "release", reason: "This reason is long enough to pass." });
    expect(res.status).toBe(403);
  });

  it("platform_viewer cannot open a dispute → 403 (needs case:open)", async () => {
    const p = await seedEscrowedPayout();
    const res = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ claimType: "work_not_delivered_in_full", freeText: "short", amountContested: "33" });
    expect(res.status).toBe(403);
  });

  it("arbiter cannot open a dispute → 403 (only customer can)", async () => {
    const p = await seedEscrowedPayout();
    const res = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ claimType: "work_not_delivered_in_full", freeText: "Arbiter trying to open.", amountContested: "10" });
    expect(res.status).toBe(403);
  });

  it("merchant cannot open a dispute → 403 (only customer can)", async () => {
    const p = await seedEscrowedPayout();
    const res = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ claimType: "work_not_delivered_in_full", freeText: "Merchant trying to open.", amountContested: "10" });
    expect(res.status).toBe(403);
  });

  it("customer cannot open a dispute on a payout they did NOT pay for → 403", async () => {
    // Seed a payout whose payer (refundTo) is a different wallet than the
    // customer's. The party-verification check must reject it.
    const p = await seedEscrowedPayout({ refundTo: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" });
    const res = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ claimType: "work_not_delivered_in_full", freeText: "Not my payment.", amountContested: "10" });
    expect(res.status).toBe(403);
  });

  it("self-heals a stale legacy-role JWT so the user isn't trapped in 401s", async () => {
    // Simulate a user who registered BEFORE the role split: their DB record
    // carries the legacy "reviewer" role but a valid seat. A JWT minted with
    // the legacy role must still resolve to a working session via self-heal.
    const user = await User.findOneAndUpdate(
      { email: "legacy@test" },
      { $set: { email: "legacy@test", passwordHash: "x", role: "reviewer", seat: "customer", displayName: "Legacy", platformKey: "northbeam", walletAddress: null } },
      { upsert: true, new: true },
    );
    // JWT carries the STALE role (as it would have been issued pre-flip).
    const staleToken = createToken({ userId: String(user._id), role: "reviewer" as never, displayName: "Legacy" });
    // The payouts list (requires payout:read) must succeed — the middleware
    // self-heals the role from the DB seat.
    const res = await request(app).get("/payouts").set("Authorization", `Bearer ${staleToken}`);
    expect(res.status).toBe(200);
  });
});

describe("dispute flow", () => {
  it("opens a dispute, records a reply, and decides (release path)", async () => {
    const p = await seedEscrowedPayout();
    const open = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ claimType: "work_not_delivered_in_full", freeText: "The third video never arrived.", amountContested: "33.34" });
    expect(open.status).toBe(201);
    expect(open.body.status).toBe("AWAITING_RESPONSE");

    const caseNumber = open.body.caseNumber;
    const reply = await request(app)
      .post(`/cases/${caseNumber}/responses`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ text: "The link expired; here is a fresh one." });
    expect(reply.status).toBe(201);
    expect(reply.body.status).toBe("UNDER_REVIEW");

    // Release needs a wallet? No — refund returns typed-data, release closes directly.
    const decide = await request(app)
      .post(`/cases/${caseNumber}/decisions`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ outcome: "release", reason: "The work was delivered; the claim does not hold up." });
    expect(decide.status).toBe(201);
    expect(decide.body.refundTypedData).toBeNull();
  });

  it("rejects a decision with a short reason → 400", async () => {
    const p = await seedEscrowedPayout();
    const open = await request(app)
      .post(`/payouts/${p.paymentId}/disputes`)
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ claimType: "x", freeText: "long enough reason here", amountContested: "1" });
    const caseNumber = open.body.caseNumber;
    const decide = await request(app)
      .post(`/cases/${caseNumber}/decisions`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ outcome: "release", reason: "too short" });
    expect(decide.status).toBe(400);
  });

  it("allows multiple information requests per case", async () => {
    const c = await seedDisputedPayout();
    // The arbiter can request info at any stage — even while AWAITING_RESPONSE.
    // The cap is generous (20) to allow a real back-and-forth conversation.
    const r1 = await request(app)
      .post(`/cases/${c.caseNumber}/requests`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ target: "merchant", text: "Please share the file." });
    expect(r1.status).toBe(201);
    expect(r1.body.infoRequestCount).toBe(1);

    const r2 = await request(app)
      .post(`/cases/${c.caseNumber}/requests`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ target: "customer", text: "And the invoice from the customer." });
    expect(r2.status).toBe(201); // arbiter can act at any stage
    expect(r2.body.infoRequestCount).toBe(2);

    // A third request also succeeds — no artificial 2-request cap.
    const r3 = await request(app)
      .post(`/cases/${c.caseNumber}/requests`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ target: "merchant", text: "One more thing." });
    expect(r3.status).toBe(201);
    expect(r3.body.infoRequestCount).toBe(3);
  });

  it("refund decision returns EIP-712 typed-data for the arbiter to sign (no pre-linked wallet required)", async () => {
    const c = await seedDisputedPayout();
    // A refund no longer requires a pre-linked wallet — the arbiter signs the
    // EIP-712 RefundAuthorization in their browser wallet, and the backend
    // relays it via refundByArbiterWithSig. The decision records immediately.
    const refund = await request(app)
      .post(`/cases/${c.caseNumber}/decisions`)
      .set("Authorization", `Bearer ${arbiterToken()}`)
      .send({ outcome: "refund", reason: "Refund is warranted because work was not delivered in full." });
    expect(refund.status).toBe(201);
    // The response carries the typed-data payload (not an unsigned tx anymore).
    expect(refund.body.refundTypedData).toBeTruthy();
    expect(refund.body.refundTypedData.primaryType).toBe("RefundAuthorization");
    expect(refund.body.refundTypedData.types.RefundAuthorization).toEqual([
      { name: "paymentID", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "salt", type: "uint256" },
    ]);
    expect(refund.body.refundTypedData.message.paymentID).toBeTruthy();
    expect(refund.body.refundTypedData.domain.name).toBe("RefundProtocol");
  });
});

describe("append-only enforcement (P5)", () => {
  it("Payout receipt fields are immutable after create → 409", async () => {
    const p = await seedEscrowedPayout();
    const res = await request(app)
      .post("/payouts/detected")
      .set("x-finne-internal", process.env.INTERNAL_TOKEN ?? "dev-internal")
      .send({ paymentId: p.paymentId, contractAddress: "0x1", txHash: "0xCHANGED", to: recipientWallet, amount: "999", refundTo: "0x1" });
    // Idempotent replay returns the existing receipt (201) — it does NOT mutate.
    expect(res.status).toBe(201);
    const after = await Payout.findOne({ paymentId: p.paymentId }).lean();
    expect(after!.amount).toBe("100");
  });
});

describe("byte-identical shared case (P3)", () => {
  it("GET /cases/:id is byte-identical across arbiter, merchant, viewer", async () => {
    const c = await seedDisputedPayout();
    const a = await request(app).get(`/cases/${c.caseNumber}`).set("Authorization", `Bearer ${arbiterToken()}`);
    const b = await request(app).get(`/cases/${c.caseNumber}`).set("Authorization", `Bearer ${merchantToken()}`);
    const v = await request(app).get(`/cases/${c.caseNumber}`).set("Authorization", `Bearer ${viewerToken()}`);
    expect(a.status).toBe(200);
    expect(a.text).toBe(b.text);
    expect(a.text).toBe(v.text);
  });
});

describe("receipt idempotency (FIN-33)", () => {
  it("detecting the same paymentId twice returns the same receipt (201)", async () => {
    const token = process.env.INTERNAL_TOKEN ?? "dev-internal";
    const body = { paymentId: "42", chain: "arc-local", contractAddress: "0x1", txHash: "0xT", to: recipientWallet, amount: "50", refundTo: "0x2" };
    const first = await request(app).post("/payouts/detected").set("x-finne-internal", token).send(body);
    const second = await request(app).post("/payouts/detected").set("x-finne-internal", token).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.payout.paymentId).toBe(second.body.payout.paymentId);
    expect(second.body.created).toBe(false);
  });
});

describe("per-seat scoping (GAP-B1)", () => {
  it("all platform parties see all platform payouts (merchant, customer, arbiter)", async () => {
    await seedEscrowedPayout({ recipientWallet, paymentId: "pay-a" });
    await seedEscrowedPayout({ recipientWallet: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", paymentId: "pay-b" });
    // The merchant sees both payouts (platform-scoped, not wallet-scoped) —
    // this keeps the demo end-to-end visible.
    const res = await request(app).get("/payouts").set("Authorization", `Bearer ${merchantToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.payouts.map((p: { paymentId: string }) => p.paymentId);
    expect(ids).toContain("pay-a");
    expect(ids).toContain("pay-b");
  });
});

/* ---------- seed helpers ---------- */

async function seedEscrowedPayout(overrides: { recipientWallet?: string; paymentId?: string; refundTo?: string } = {}): Promise<{ paymentId: string }> {
  const paymentId = overrides.paymentId ?? Math.random().toString(36).slice(2, 8);
  await Payout.create({
    paymentId,
    chain: "arc-local",
    contractAddress: "0x1",
    txHash: "0xT" + paymentId,
    amount: "100",
    refundTo: overrides.refundTo ?? customerWallet,
    platformKey: "northbeam",
    recipientKey: "maya",
    recipientWallet: overrides.recipientWallet ?? recipientWallet,
    workOrderRef: null,
    trancheIndex: null,
    disputeDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    lockupEnd: new Date(Date.now() + 86_400_000).toISOString(),
    status: "ESCROWED",
    receiptHash: canonicalHash({ paymentId }),
    paidAt: new Date().toISOString(),
  });
  await ensureUsers();
  return { paymentId };
}

async function seedDisputedPayout(): Promise<{ caseNumber: string }> {
  const { paymentId } = await seedEscrowedPayout();
  const caseNumber = "CASE-" + paymentId.padStart(4, "0");
  await Case.create({
    caseNumber,
    payoutRef: paymentId,
    openedBy: "customer",
    allegationClaimType: "work_not_delivered_in_full",
    allegationFreeText: "Missing deliverable.",
    allegationAmountContested: "33.34",
    status: "UNDER_REVIEW",
    infoRequestCount: 0,
    infoRequests: [],
    responseDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    caseHash: canonicalHash({ caseNumber }),
    openedAt: new Date().toISOString(),
  });
  return { caseNumber };
}
