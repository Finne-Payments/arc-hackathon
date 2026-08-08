/* ============================================================================
   policy-pack seed tests (FIN-110 / FIN-111 / FIN-112).

   Proves the demo policy pack actually seeds: the three numbered clauses
   (4/7/9) AND the governing-law row (clauseNumber 0) carrying the law library
   (lawLines[]) + disclaimer. This is the first test to exercise the seed path
   — it regressed silently for the whole project's history because clauseNumber
   0 was rejected by a `.positive()` gate and the seed's try/catch swallowed
   the throw before insertMany ever ran.

   Model-only (no HTTP) — the v1 /v1/policy-clauses route was removed during the
   consolidation onto the single escrow App; clauses now reach the client via
   the legacy GET /cases/:id response, so the seed coverage is what matters.
   Mongo-backed; runs in its own fork (vitest fileParallelism=false serializes
   Mongo files so they don't race on the mongodb-memory-server binary).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { PolicyClause } from "../src/v1/models.ts";
import { seedDemoPolicyPack, DEMO_PACK_REF, DEMO_LAW_LINES, DEMO_LAW_DISCLAIMER } from "../src/seed/policy-pack.ts";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

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
});
