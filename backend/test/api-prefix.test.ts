import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.ts";

/* ============================================================================
   Regression test for the production 404 on /api/auth/wallet.
   The SPA always calls /api/<x> (web/src/api.ts → API_BASE = "/api"), but the
   routers mount at /<x> with no /api prefix. In dev the Vite proxy strips /api,
   in docker-compose nginx strips it, and in the production single-container
   deploy the backend serves the SPA itself — so createApp() strips /api to
   keep every deploy target consistent. This suite pins that behavior.
   ========================================================================== */

let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongo.getUri();
  process.env.DEMO_MODE = "true";
  process.env.INTERNAL_TOKEN = "dev-internal";
  process.env.SESSION_SECRET = "api-prefix-test-secret";
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("/api prefix stripping", () => {
  it("strips /api so /api/healthz reaches the liveness route", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("keeps the bare path working (no /api prefix)", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("routes the frontend wallet login POST /api/auth/wallet (not 404)", async () => {
    // This is the exact path the browser posts in production. Before the fix it
    // hit Express verbatim and 404'd. Wallet login find-or-creates by address,
    // so a well-formed body returns 200 with a token.
    const res = await request(app)
      .post("/api/auth/wallet")
      .send({ walletAddress: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", seat: "customer" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
  });

  it("still serves the non-prefixed /auth/wallet path", async () => {
    const res = await request(app)
      .post("/auth/wallet")
      .send({ walletAddress: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", seat: "customer" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });
});
