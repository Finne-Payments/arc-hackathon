import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.ts";
import { Payout, Case, User, WorkOrder, Evidence } from "../src/models/index.ts";
import { createToken } from "../src/auth.ts";
import { canonicalHash } from "../src/canonical.ts";
import type { Role } from "../src/rbac.ts";
import { resetLocalStore } from "../src/integrations/storage/localStore.ts";

/* ============================================================================
   Evidence documents — upload/link/download flow + arbiter-only RBAC.
   Proves: allocate → complete records an ARBITER_ONLY evidence doc; a recipient
   CANNOT download (403, evidence:download is reviewer-only); a link is SHARED;
   a work-order contract attaches to the work order.
   ========================================================================== */

let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

const reviewerWallet = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const recipientWallet = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
let reviewerId = "";
let recipientId = "";

async function ensureUsers(): Promise<void> {
  const reviewer = await User.findOneAndUpdate(
    { email: "reviewer@test" },
    { $set: { email: "reviewer@test", passwordHash: "x", role: "reviewer", displayName: "Dana", platformKey: "northbeam" } },
    { upsert: true, new: true },
  );
  const recipient = await User.findOneAndUpdate(
    { email: "recipient@test" },
    { $set: { email: "recipient@test", passwordHash: "x", role: "recipient", displayName: "Maya", platformKey: "northbeam", walletAddress: recipientWallet } },
    { upsert: true, new: true },
  );
  reviewerId = String(reviewer._id);
  recipientId = String(recipient._id);
}

function authAs(userId: string, role: Role, displayName: string): string {
  return createToken({ userId, role, displayName });
}
const reviewerToken = () => authAs(reviewerId, "reviewer", "Dana");
const recipientToken = () => authAs(recipientId, "recipient", "Maya");

async function seedEscrowedPayout(paymentId: string): Promise<void> {
  await Payout.create({
    paymentId,
    chain: "arc-local",
    contractAddress: "0x1",
    txHash: "0xT" + paymentId,
    amount: "100",
    refundTo: reviewerWallet,
    platformKey: "northbeam",
    recipientKey: "maya",
    recipientWallet,
    workOrderRef: null,
    trancheIndex: null,
    disputeDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    lockupEnd: new Date(Date.now() + 86_400_000).toISOString(),
    status: "ESCROWED",
    receiptHash: canonicalHash({ paymentId }),
    paidAt: new Date().toISOString(),
  });
}

async function seedDisputedCase(caseNumber: string, paymentId: string): Promise<void> {
  await seedEscrowedPayout(paymentId);
  await Case.create({
    caseNumber,
    payoutRef: paymentId,
    openedBy: "platform",
    allegationClaimType: "work_not_delivered_in_full",
    allegationFreeText: "Missing deliverable.",
    allegationAmountContested: "33",
    status: "UNDER_REVIEW",
    infoRequestCount: 0,
    infoRequests: [],
    responseDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    caseHash: canonicalHash({ caseNumber }),
    openedAt: new Date().toISOString(),
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongo.getUri();
  process.env.DEMO_MODE = "true";
  process.env.INTERNAL_TOKEN = "dev-internal";
  process.env.SESSION_SECRET = "evidence-doc-test-secret";
  await mongoose.connect(mongo.getUri());
  app = createApp();
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  const cols = await db.collections();
  for (const c of cols) await c.deleteMany({});
  await ensureUsers();
  resetLocalStore();
});

describe("evidence document upload + RBAC", () => {
  it("allocates a presigned upload for case evidence (recipient can add evidence)", async () => {
    await seedDisputedCase("CASE-001", "PAY-1");
    const res = await request(app)
      .post("/cases/CASE-001/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "proof.pdf", mimeType: "application/pdf", declaredSizeBytes: 2048 });
    expect(res.status).toBe(201);
    expect(res.body.uploadId).toBeTruthy();
    expect(res.body.objectKey).toContain("evidence/case/CASE-001/");
    expect(res.body.uploadUrl).toContain(res.body.uploadId);
  });

  it("finalizes an upload and records ARBITER_ONLY evidence with objectKey + sha256", async () => {
    await seedDisputedCase("CASE-002", "PAY-2");
    const alloc = await request(app)
      .post("/cases/CASE-002/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "contract.md", mimeType: "text/markdown", declaredSizeBytes: 30 });
    const complete = await request(app)
      .post(`/cases/CASE-002/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "The contract", filename: "contract.md" });
    expect(complete.status).toBe(201);
    expect(complete.body.sha256).toHaveLength(64);

    // The evidence doc should be recorded as ARBITER_ONLY with the file metadata.
    const ev = await Evidence.findOne({ caseRef: "CASE-002" }).lean();
    expect(ev).toBeTruthy();
    expect(ev!.visibility).toBe("ARBITER_ONLY");
    expect(ev!.source).toBe("upload");
    expect(ev!.objectKey).toBeTruthy();
    expect(ev!.mimeType).toBe("text/markdown");
  });

  it("rejects evidence upload with a missing filename → 400", async () => {
    await seedDisputedCase("CASE-003", "PAY-3");
    const res = await request(app)
      .post("/cases/CASE-003/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ mimeType: "application/pdf", declaredSizeBytes: 100 });
    expect(res.status).toBe(400);
  });

  it("allows the reviewer (arbiter) to download an evidence file", async () => {
    await seedDisputedCase("CASE-004", "PAY-4");
    const alloc = await request(app)
      .post("/cases/CASE-004/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "doc.txt", mimeType: "text/plain", declaredSizeBytes: 11 });
    await request(app)
      .post(`/cases/CASE-004/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Doc", filename: "doc.txt" });
    const ev = await Evidence.findOne({ caseRef: "CASE-004" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-004/evidence/${ev!._id}/download`)
      .set("Authorization", `Bearer ${reviewerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("forbids a recipient from downloading an evidence file → 403 (evidence:download is reviewer-only)", async () => {
    await seedDisputedCase("CASE-005", "PAY-5");
    const alloc = await request(app)
      .post("/cases/CASE-005/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "doc.txt", mimeType: "text/plain", declaredSizeBytes: 11 });
    await request(app)
      .post(`/cases/CASE-005/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Doc", filename: "doc.txt" });
    const ev = await Evidence.findOne({ caseRef: "CASE-005" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-005/evidence/${ev!._id}/download`)
      .set("Authorization", `Bearer ${recipientToken()}`);
    expect(res.status).toBe(403);
  });

  it("records a YouTube link as SHARED evidence", async () => {
    await seedDisputedCase("CASE-006", "PAY-6");
    const res = await request(app)
      .post("/cases/CASE-006/evidence/links")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Demo recording", linkUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(res.status).toBe(201);
    const ev = await Evidence.findOne({ caseRef: "CASE-006" }).lean();
    expect(ev).toBeTruthy();
    expect(ev!.source).toBe("link");
    expect(ev!.visibility).toBe("SHARED");
    expect(ev!.linkUrl).toContain("youtube.com");
    expect(ev!.kind).toBe("video");
  });

  it("rejects a non-http(s) link → 400", async () => {
    await seedDisputedCase("CASE-007", "PAY-7");
    const res = await request(app)
      .post("/cases/CASE-007/evidence/links")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Bad link", linkUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });
});

describe("work order documents (payment-time contracts)", () => {
  it("allocates + finalizes a contract attached to a work order", async () => {
    await seedEscrowedPayout("PAY-8");
    // The work order must exist (created via metadata); create it directly here.
    await WorkOrder.create({
      platformKey: "northbeam",
      recipientKey: "maya",
      description: "Videos",
      deliverables: [],
      amount: "100",
      currency: "USDC",
      status: "open",
      paymentId: "PAY-8",
      documents: [],
    });
    const alloc = await request(app)
      .post("/payouts/PAY-8/documents/uploads")
      .set("Authorization", `Bearer ${reviewerToken()}`)
      .send({ filename: "master-agreement.pdf", mimeType: "application/pdf", declaredSizeBytes: 5000 });
    expect(alloc.status).toBe(201);

    const complete = await request(app)
      .post(`/payouts/PAY-8/documents/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${reviewerToken()}`)
      .send({ filename: "master-agreement.pdf" });
    expect(complete.status).toBe(201);
    expect(complete.body.documentId).toBeTruthy();

    const wo = await WorkOrder.findOne({ paymentId: "PAY-8" }).lean();
    expect(wo!.documents).toHaveLength(1);
    expect(wo!.documents![0].filename).toBe("master-agreement.pdf");
    expect(wo!.documents![0].objectKey).toBeTruthy();
  });
});

describe("upload policy enforcement (routes)", () => {
  it("rejects an unsupported file type on allocate → 400", async () => {
    await seedDisputedCase("CASE-010", "PAY-10");
    const res = await request(app)
      .post("/cases/CASE-010/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "malware.exe", mimeType: "application/x-msdownload", declaredSizeBytes: 100 });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized payload on allocate → 400", async () => {
    await seedDisputedCase("CASE-011", "PAY-11");
    const res = await request(app)
      .post("/cases/CASE-011/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "huge.mp4", mimeType: "video/mp4", declaredSizeBytes: 26 * 1024 * 1024 });
    expect(res.status).toBe(400);
  });

  it("sanitizes a path-traversal filename (the stored key has no ../)", async () => {
    await seedDisputedCase("CASE-012", "PAY-12");
    const res = await request(app)
      .post("/cases/CASE-012/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "../../etc/passwd.pdf", mimeType: "application/pdf", declaredSizeBytes: 100 });
    expect(res.status).toBe(201);
    expect(res.body.objectKey).not.toContain("../");
    expect(res.body.objectKey).toContain("passwd.pdf");
  });

  it("accepts a direct video upload (mp4)", async () => {
    await seedDisputedCase("CASE-013", "PAY-13");
    const alloc = await request(app)
      .post("/cases/CASE-013/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "demo.mp4", mimeType: "video/mp4", declaredSizeBytes: 2000 });
    expect(alloc.status).toBe(201);
    const complete = await request(app)
      .post(`/cases/CASE-013/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Product demo", filename: "demo.mp4" });
    expect(complete.status).toBe(201);
    expect(complete.body.mimeType).toBe("video/mp4");
  });
});

describe("link evidence — multi-provider", () => {
  it("accepts YouTube, Loom, Vimeo, and a generic HTTPS link", async () => {
    await seedDisputedCase("CASE-020", "PAY-20");
    const links = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.loom.com/share/abcdef",
      "https://vimeo.com/123456789",
      "https://walkthroughs.example.com/v/1",
    ];
    for (const url of links) {
      const res = await request(app)
        .post("/cases/CASE-020/evidence/links")
        .set("Authorization", `Bearer ${recipientToken()}`)
        .send({ title: `Link to ${url}`, linkUrl: url });
      expect(res.status).toBe(201);
    }
    const evs = await Evidence.find({ caseRef: "CASE-020" }).lean();
    expect(evs.length).toBe(links.length);
    expect(evs.every((e) => e.source === "link" && e.visibility === "SHARED")).toBe(true);
  });

  it("rejects a non-http(s) link → 400", async () => {
    await seedDisputedCase("CASE-021", "PAY-21");
    const res = await request(app)
      .post("/cases/CASE-021/evidence/links")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Bad", linkUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("rejects a localhost / bare-IP link → 400 (SSRF guard)", async () => {
    await seedDisputedCase("CASE-022", "PAY-22");
    const res = await request(app)
      .post("/cases/CASE-022/evidence/links")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "Bad", linkUrl: "http://127.0.0.1/admin" });
    expect(res.status).toBe(400);
  });
});

describe("storage path isolation (objectKey never reaches clients)", () => {
  it("strips objectKey from the shared case body evidence", async () => {
    await seedDisputedCase("CASE-030", "PAY-30");
    const alloc = await request(app)
      .post("/cases/CASE-030/evidence/uploads")
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ filename: "contract.pdf", mimeType: "application/pdf", declaredSizeBytes: 50 });
    await request(app)
      .post(`/cases/CASE-030/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${recipientToken()}`)
      .send({ title: "The contract", filename: "contract.pdf" });

    // Fetch the shared case body as the recipient — the objectKey must NOT be present.
    const res = await request(app)
      .get("/cases/CASE-030")
      .set("Authorization", `Bearer ${recipientToken()}`);
    expect(res.status).toBe(200);
    const evs = res.body.evidence as Record<string, unknown>[];
    const uploaded = evs.find((e) => (e.title as string) === "The contract");
    expect(uploaded).toBeTruthy();
    expect(uploaded).not.toHaveProperty("objectKey");
    // Metadata the uploader needs (filename, sha, size) is still present.
    expect(uploaded).toHaveProperty("filename");
    expect(uploaded).toHaveProperty("sha256");
  });

  it("strips objectKey from work-order documents in the shared case body", async () => {
    await seedEscrowedPayout("PAY-31");
    await WorkOrder.create({
      platformKey: "northbeam", recipientKey: "maya", description: "x", deliverables: [],
      amount: "100", currency: "USDC", status: "open", paymentId: "PAY-31", documents: [],
    });
    const alloc = await request(app)
      .post("/payouts/PAY-31/documents/uploads")
      .set("Authorization", `Bearer ${reviewerToken()}`)
      .send({ filename: "spec.pdf", mimeType: "application/pdf", declaredSizeBytes: 50 });
    await request(app)
      .post(`/payouts/PAY-31/documents/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${reviewerToken()}`)
      .send({ filename: "spec.pdf" });

    // Open a dispute so the shared case body resolves the work order.
    await Case.create({
      caseNumber: "CASE-031", payoutRef: "PAY-31", openedBy: "platform",
      allegationClaimType: "work_not_delivered_in_full", allegationFreeText: "x",
      allegationAmountContested: "10", status: "UNDER_REVIEW", infoRequestCount: 0,
      infoRequests: [], responseDeadline: new Date(Date.now() + 86400000).toISOString(),
      caseHash: canonicalHash({ caseNumber: "CASE-031" }), openedAt: new Date().toISOString(),
    });
    const res = await request(app).get("/cases/CASE-031").set("Authorization", `Bearer ${reviewerToken()}`);
    expect(res.status).toBe(200);
    const docs = (res.body.workOrder?.documents ?? []) as Record<string, unknown>[];
    expect(docs.length).toBe(1);
    expect(docs[0]).not.toHaveProperty("objectKey");
    expect(docs[0]).toHaveProperty("filename");
  });
});
