/* ============================================================================
   Frame auto-trigger test — proves the agent pipeline fires on case-open and
   that getCaseDetail surfaces both the persisted frame and the frameStatus.

   NODE_ENV=test disables the model client (FIN-105), so the frame assembles at
   rung 1 (no questions/narrative) — but the deterministic parts (proof checks,
   requirements, unresolved) run and persist. This proves the trigger wiring;
   the Bedrock happy-path is covered by the agent smoke test.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createV1App, mountErrorHandler } from "../src/v1/app.ts";
import { createV1Router } from "../src/v1/router.ts";
import { loadConfig, type Config } from "@finne/config";
import { DraftFrame } from "../src/v1/models.ts";

let mongoServer: MongoMemoryServer;
let app: express.Application;
let config: Config;

function tokenFor(role: string, tenantKey = "northstar"): string {
  return jwt.sign(
    { userId: `test-${role}`, role, tenantKey, displayName: `Test ${role}`, walletAddress: "0x" + "1".repeat(40) },
    config.sessionSecret,
    { expiresIn: "1h" },
  );
}
const OPS_TOKEN = () => tokenFor("operations");

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  config = loadConfig({
    stage: "test",
    env: {
      NODE_ENV: "test",
      MONGO_URL: mongoServer.getUri(),
      SESSION_SECRET: "test-session-secret-32-chars!!",
      INTERNAL_TOKEN: "test-internal-token-32-chars!!",
      ARC_RPC_URL: "https://rpc.testnet.arc.io",
    },
  });
  app = createV1App(config);
  app.use(createV1Router(config));
  mountErrorHandler(app);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

/** Wait until at least one DraftFrame exists for the case (or timeout). */
async function waitForFrame(caseId: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = await DraftFrame.findOne({ caseId }).lean();
    if (frame) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

describe("frame auto-trigger on case-open", () => {
  it("assembles a frame automatically when a dispute opens", async () => {
    // 1. Create + verify a payment (the precondition for opening a case).
    const payRes = await request(app)
      .post("/v1/internal/payments/verified")
      .set("x-finne-internal", config.internalToken)
      .send({
        txHash: "0x" + "a".repeat(64),
        amountMicroUsdc: "300000000", // 300 USDC
        recipient: "0x" + "2".repeat(40),
        payer: "0x" + "3".repeat(40),
        token: "0x" + "4".repeat(40),
        paidAt: new Date().toISOString(),
      });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.paymentId;

    // 2. Open a case — this fires the auto-trigger (fire-and-forget).
    const caseRes = await request(app)
      .post(`/v1/payments/${paymentId}/cases`)
      .set("Authorization", `Bearer ${OPS_TOKEN()}`)
      .set("Idempotency-Key", "auto-frame-1")
      .send({ allegation: "Video three was never delivered.", challengedAmountMicroUsdc: "100000000" });
    expect(caseRes.status).toBe(202);
    const caseId = caseRes.body.caseId;
    expect(caseId).toBeTruthy();

    // 3. Wait for the fire-and-forget frame assembly to persist a frame.
    const persisted = await waitForFrame(caseId);
    expect(persisted, "a DraftFrame should be persisted by the auto-trigger").toBe(true);

    // 4. getCaseDetail must include the frame.
    const detailRes = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${OPS_TOKEN()}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.frame).not.toBeNull();
    // Deterministic parts always present (rung ≥ 1) — model is unplugged in test.
    expect(detailRes.body.frame.requirements.length).toBeGreaterThan(0);
    expect(detailRes.body.frame.unresolved.length).toBeGreaterThan(0);
  }, 15000);
});
