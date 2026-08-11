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
   Evidence documents — upload/link/download flow + case-party RBAC.
   Proves: allocate → complete records an ARBITER_ONLY evidence doc; a non-party
   (platform_viewer) CANNOT download (403); a link is SHARED; a work-order
   contract attaches to the work order.
   ========================================================================== */

let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

const arbiterWallet = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const customerWallet = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const recipientWallet = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
let arbiterId = "";
let customerId = "";
let merchantId = "";
let viewerId = "";

async function ensureUsers(): Promise<void> {
  const arbiter = await User.findOneAndUpdate(
    { email: "arbiter@test" },
    { $set: { email: "arbiter@test", passwordHash: "x", role: "arbiter", displayName: "Dana", platformKey: "northbeam" } },
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
    { $set: { email: "viewer@test", passwordHash: "x", role: "platform_viewer", displayName: "Park", platformKey: "northbeam" } },
    { upsert: true, new: true },
  );
  arbiterId = String(arbiter._id);
  customerId = String(customer._id);
  merchantId = String(merchant._id);
  viewerId = String(viewer._id);
}

function authAs(userId: string, role: Role, displayName: string): string {
  return createToken({ userId, role, displayName });
}
const arbiterToken = () => authAs(arbiterId, "arbiter", "Dana");
const customerToken = () => authAs(customerId, "customer", "Northstar");
const merchantToken = () => authAs(merchantId, "merchant", "Maya");
const viewerToken = () => authAs(viewerId, "platform_viewer", "Park");

async function seedEscrowedPayout(paymentId: string): Promise<void> {
  await Payout.create({
    paymentId,
    chain: "arc-local",
    contractAddress: "0x1",
    txHash: "0xT" + paymentId,
    amount: "100",
    refundTo: arbiterWallet,
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
    openedBy: "customer",
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
  it("allocates a presigned upload for case evidence (merchant can add evidence)", async () => {
    await seedDisputedCase("CASE-001", "PAY-1");
    const res = await request(app)
      .post("/cases/CASE-001/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
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
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "contract.md", mimeType: "text/markdown", declaredSizeBytes: 30 });
    const complete = await request(app)
      .post(`/cases/CASE-002/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
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
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ mimeType: "application/pdf", declaredSizeBytes: 100 });
    expect(res.status).toBe(400);
  });

  it("allows the arbiter to download an evidence file", async () => {
    await seedDisputedCase("CASE-004", "PAY-4");
    const alloc = await request(app)
      .post("/cases/CASE-004/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "doc.txt", mimeType: "text/plain", declaredSizeBytes: 11 });
    await request(app)
      .post(`/cases/CASE-004/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Doc", filename: "doc.txt" });
    const ev = await Evidence.findOne({ caseRef: "CASE-004" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-004/evidence/${ev!._id}/download`)
      .set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("forbids a platform_viewer (non-case-party) from downloading an evidence file → 403", async () => {
    await seedDisputedCase("CASE-005", "PAY-5");
    const alloc = await request(app)
      .post("/cases/CASE-005/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "doc.txt", mimeType: "text/plain", declaredSizeBytes: 11 });
    await request(app)
      .post(`/cases/CASE-005/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Doc", filename: "doc.txt" });
    const ev = await Evidence.findOne({ caseRef: "CASE-005" }).lean();
    // A platform_viewer is NOT a case party → evidence:download is denied.
    const res = await request(app)
      .get(`/cases/CASE-005/evidence/${ev!._id}/download`)
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(403);
  });

  it("records a YouTube link as SHARED evidence", async () => {
    await seedDisputedCase("CASE-006", "PAY-6");
    const res = await request(app)
      .post("/cases/CASE-006/evidence/links")
      .set("Authorization", `Bearer ${merchantToken()}`)
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
      .set("Authorization", `Bearer ${merchantToken()}`)
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
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ filename: "master-agreement.pdf", mimeType: "application/pdf", declaredSizeBytes: 5000 });
    expect(alloc.status).toBe(201);

    const complete = await request(app)
      .post(`/payouts/PAY-8/documents/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${customerToken()}`)
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
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "malware.exe", mimeType: "application/x-msdownload", declaredSizeBytes: 100 });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized payload on allocate → 400", async () => {
    await seedDisputedCase("CASE-011", "PAY-11");
    const res = await request(app)
      .post("/cases/CASE-011/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "huge.mp4", mimeType: "video/mp4", declaredSizeBytes: 26 * 1024 * 1024 });
    expect(res.status).toBe(400);
  });

  it("sanitizes a path-traversal filename (the stored key has no ../)", async () => {
    await seedDisputedCase("CASE-012", "PAY-12");
    const res = await request(app)
      .post("/cases/CASE-012/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "../../etc/passwd.pdf", mimeType: "application/pdf", declaredSizeBytes: 100 });
    expect(res.status).toBe(201);
    expect(res.body.objectKey).not.toContain("../");
    expect(res.body.objectKey).toContain("passwd.pdf");
  });

  it("accepts a direct video upload (mp4)", async () => {
    await seedDisputedCase("CASE-013", "PAY-13");
    const alloc = await request(app)
      .post("/cases/CASE-013/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "demo.mp4", mimeType: "video/mp4", declaredSizeBytes: 2000 });
    expect(alloc.status).toBe(201);
    const complete = await request(app)
      .post(`/cases/CASE-013/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
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
        .set("Authorization", `Bearer ${merchantToken()}`)
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
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Bad", linkUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("rejects a localhost / bare-IP link → 400 (SSRF guard)", async () => {
    await seedDisputedCase("CASE-022", "PAY-22");
    const res = await request(app)
      .post("/cases/CASE-022/evidence/links")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Bad", linkUrl: "http://127.0.0.1/admin" });
    expect(res.status).toBe(400);
  });
});

describe("storage path isolation (objectKey never reaches clients)", () => {
  it("strips objectKey from the shared case body evidence", async () => {
    await seedDisputedCase("CASE-030", "PAY-30");
    const alloc = await request(app)
      .post("/cases/CASE-030/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "contract.pdf", mimeType: "application/pdf", declaredSizeBytes: 50 });
    await request(app)
      .post(`/cases/CASE-030/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "The contract", filename: "contract.pdf" });

    // Fetch the shared case body as the recipient — the objectKey must NOT be present.
    const res = await request(app)
      .get("/cases/CASE-030")
      .set("Authorization", `Bearer ${merchantToken()}`);
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
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ filename: "spec.pdf", mimeType: "application/pdf", declaredSizeBytes: 50 });
    await request(app)
      .post(`/payouts/PAY-31/documents/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${customerToken()}`)
      .send({ filename: "spec.pdf" });

    // Open a dispute so the shared case body resolves the work order.
    await Case.create({
      caseNumber: "CASE-031", payoutRef: "PAY-31", openedBy: "customer",
      allegationClaimType: "work_not_delivered_in_full", allegationFreeText: "x",
      allegationAmountContested: "10", status: "UNDER_REVIEW", infoRequestCount: 0,
      infoRequests: [], responseDeadline: new Date(Date.now() + 86400000).toISOString(),
      caseHash: canonicalHash({ caseNumber: "CASE-031" }), openedAt: new Date().toISOString(),
    });
    const res = await request(app).get("/cases/CASE-031").set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(200);
    const docs = (res.body.workOrder?.documents ?? []) as Record<string, unknown>[];
    expect(docs.length).toBe(1);
    expect(docs[0]).not.toHaveProperty("objectKey");
    expect(docs[0]).toHaveProperty("filename");
  });
});

describe("preview — case-party access + content", () => {
  it("returns extracted text for a text/markdown evidence preview (case party)", async () => {
    await seedDisputedCase("CASE-040", "PAY-40");
    const content = "# Agreement\nDeliverable: 3 videos. Fee: 5000 USDC.";
    const alloc = await request(app)
      .post("/cases/CASE-040/evidence/uploads")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ filename: "notes.md", mimeType: "text/markdown", declaredSizeBytes: content.length });
    // PUT the bytes to the local store (simulating the client upload step).
    const { getLocalStore } = await import("../src/integrations/storage/localStore.ts");
    getLocalStore().setUploadBytes(alloc.body.uploadId, new TextEncoder().encode(content));
    await request(app)
      .post(`/cases/CASE-040/evidence/uploads/${alloc.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Agreement", filename: "notes.md" });
    const ev = await Evidence.findOne({ caseRef: "CASE-040" }).lean();

    const res = await request(app)
      .get(`/cases/CASE-040/evidence/${ev!._id}/preview`)
      .set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("text");
    expect(res.body.content).toContain("Agreement");
    expect(res.body.filename).toBe("notes.md");
  });

  it("returns the URL for a link evidence preview", async () => {
    await seedDisputedCase("CASE-041", "PAY-41");
    await request(app)
      .post("/cases/CASE-041/evidence/links")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Demo", linkUrl: "https://www.loom.com/share/abc" });
    const ev = await Evidence.findOne({ caseRef: "CASE-041" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-041/evidence/${ev!._id}/preview`)
      .set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("link");
    expect(res.body.content).toContain("loom.com");
  });

  it("allows the recipient (case party) to preview", async () => {
    await seedDisputedCase("CASE-042", "PAY-42");
    await request(app)
      .post("/cases/CASE-042/evidence/links")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Demo", linkUrl: "https://youtu.be/abc123" });
    const ev = await Evidence.findOne({ caseRef: "CASE-042" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-042/evidence/${ev!._id}/preview`)
      .set("Authorization", `Bearer ${merchantToken()}`);
    expect(res.status).toBe(200);
  });

  it("forbids a platform_viewer (non-case-party) from previewing → 403", async () => {
    await seedDisputedCase("CASE-043", "PAY-43");
    await request(app)
      .post("/cases/CASE-043/evidence/links")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ title: "Demo", linkUrl: "https://youtu.be/abc123" });
    const ev = await Evidence.findOne({ caseRef: "CASE-043" }).lean();
    const res = await request(app)
      .get(`/cases/CASE-043/evidence/${ev!._id}/preview`)
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(403);
  });

  it("404s for an unknown evidence id", async () => {
    await seedDisputedCase("CASE-044", "PAY-44");
    const res = await request(app)
      .get(`/cases/CASE-044/evidence/000000000000000000000000/preview`)
      .set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(404);
  });
});

describe("conversation-aware frame (responses + info requests)", () => {
  it("produces a frame after a response + info request, reflecting the conversation", async () => {
    // Seed a disputed case with an arbiter info request already on it.
    await seedDisputedCase("CASE-050", "PAY-50");
    const { Case: CaseModel } = await import("../src/models/index.ts");
    await CaseModel.updateOne(
      { caseNumber: "CASE-050" },
      { $push: { infoRequests: { target: "merchant", text: "When was the second video delivered?", requestedAt: new Date().toISOString(), answeredAt: null } } },
    );

    // The recipient responds (a chat message) → triggers frame re-assembly.
    const reply = await request(app)
      .post("/cases/CASE-050/responses")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send({ text: "The second video was delivered on May 3rd — see the attached file." });
    expect(reply.status).toBe(201);

    // Give the fire-and-forget frame assembly a beat to land, then fetch the
    // shared case body which carries the assembled frame.
    await new Promise((r) => setTimeout(r, 300));
    const res = await request(app).get("/cases/CASE-050").set("Authorization", `Bearer ${arbiterToken()}`);
    expect(res.status).toBe(200);
    // A frame should exist (the conversation triggered re-assembly). At minimum
    // the deterministic rung-1 parts (requirements/unresolved) are present even
    // with the model unplugged in NODE_ENV=test.
    expect(res.body.frame).toBeTruthy();
  });
});
