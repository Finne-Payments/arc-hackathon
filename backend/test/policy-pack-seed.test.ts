/* ============================================================================
   policy-pack seed tests (FIN-110 / FIN-111 / FIN-112).

   Proves the demo policy pack actually seeds end-to-end: the three numbered
   clauses (4/7/9) AND the governing-law row (clauseNumber 0) carrying the law
   library (lawLines[]) + disclaimer. This is the first test to exercise the
   seed path — it regressed silently for the whole project's history because
   clauseNumber 0 was rejected by a `.positive()` gate and the seed's
   try/catch swallowed the throw before insertMany ever ran.

   Mongo-backed; runs in its own fork (vitest fileParallelism=false serializes
   Mongo files so they don't race on the mongodb-memory-server binary).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PolicyClause } from "../src/v1/models.ts";
import { seedDemoPolicyPack, DEMO_PACK_REF, DEMO_LAW_LINES, DEMO_LAW_DISCLAIMER } from "../src/seed/policy-pack.ts";
import { createV1App, mountErrorHandler } from "../src/v1/app.ts";
import { createV1Router } from "../src/v1/router.ts";
import { loadConfig, type Config } from "@finne/config";

let mongoServer: MongoMemoryServer;
let app: express.Application;
let config: Config;

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

function tokenFor(role: string): string {
  return jwt.sign(
    { userId: `test-${role}`, role, tenantKey: "northstar", displayName: `Test ${role}`, walletAddress: "0x" + "1".repeat(40) },
    config.sessionSecret,
    { expiresIn: "1h" },
  );
}

describe("demo policy pack seed (FIN-110/111/112)", () => {
  it("seeds the three numbered clauses + the governing-law row", async () => {
    await seedDemoPolicyPack();
    const rows = await PolicyClause.find({ packRef: DEMO_PACK_REF }).sort({ clauseNumber: 1 }).lean();
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.clauseNumber)).toEqual([0, 4, 7, 9]);
  });

  it("is idempotent — a second run does not duplicate", async () => {
    await seedDemoPolicyPack();
    const count = await PolicyClause.countDocuments({ packRef: DEMO_PACK_REF });
    expect(count).toBe(4);
  });

  it("the governing-law row carries the three Irish notes in order + the disclaimer", async () => {
    const law = await PolicyClause.findOne({ packRef: DEMO_PACK_REF, clauseNumber: 0 }).lean();
    expect(law).toBeTruthy();
    expect(law!.lawLines).toBeTruthy();
    expect(law!.lawLines!.map((l) => l.note)).toEqual(DEMO_LAW_LINES.map((l) => l.note));
    expect(law!.lawLines!.map((l) => l.text)).toEqual(DEMO_LAW_LINES.map((l) => l.text));
    expect(law!.lawLines![0].sourceRefs.length).toBe(1); // Noreside — case-anchored
    expect(law!.lawLines![1].sourceRefs.length).toBe(0); // settled freedom-of-contract
    expect(law!.lawLines![2].sourceRefs.length).toBe(0); // settled civil standard of proof
    expect(law!.disclaimer).toBe(DEMO_LAW_DISCLAIMER);
  });

  it("GET /v1/policy-clauses returns the pack with the law library", async () => {
    const res = await request(app)
      .get("/v1/policy-clauses")
      .set("Authorization", `Bearer ${tokenFor("reviewer")}`);
    expect(res.status).toBe(200);
    const lawRow = res.body.clauses.find((c: { clauseNumber: number }) => c.clauseNumber === 0);
    expect(lawRow).toBeTruthy();
    expect(lawRow.lawLines.length).toBe(3);
    expect(lawRow.disclaimer).toBe(DEMO_LAW_DISCLAIMER);
    // Verdict-shaped keys must never appear anywhere on a served clause.
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/"verdict"|"liability"|"outcome"|"award"|"penalty"/i);
  });
});
