/* ============================================================================
   Northwind × Kestrel scenario pack seed tests.
   Proves: seed inserts the ToS clauses + the top-3 governing-law pointers;
   seeding is idempotent (a second call is a no-op); the pack is isolated
   from the demo pack by packRef; clause-number-0 law lines now validate
   (regression for the latent .positive() bug).
   Uses mongodb-memory-server.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { PolicyClause } from "../src/v1/models.ts";
import {
  seedNorthwindPack,
  NORTHWIND_PACK_REF,
  NORTHWIND_JURISDICTION,
  loadNorthwindClauseParameters,
} from "../src/seed/northwind-pack.ts";
import { seedDemoPolicyPack, DEMO_PACK_REF } from "../src/seed/policy-pack.ts";

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
  await PolicyClause.deleteMany({});
});

describe("Northwind scenario pack seed", () => {
  it("inserts the ToS clauses + the top-3 (+supplement) governing-law pointers", async () => {
    await seedNorthwindPack();
    const rows = await PolicyClause.find({ packRef: NORTHWIND_PACK_REF }).lean();
    // 5 numbered clauses (31/41/42/51/61) + 4 law pointers = 9 rows.
    expect(rows.length).toBe(9);

    const numbered = rows.filter((r) => r.clauseNumber > 0).map((r) => r.clauseNumber).sort((a, b) => a - b);
    expect(numbered).toEqual([31, 41, 42, 51, 61]);

    const lawLines = rows.filter((r) => r.clauseNumber === 0);
    // 3 top governing-law pointers + 1 flagged SOGSA supplement = 4 law lines.
    expect(lawLines.length).toBe(4);
    expect(lawLines.every((r) => r.jurisdiction === NORTHWIND_JURISDICTION)).toBe(true);
  });

  it("is idempotent — a second call inserts nothing", async () => {
    await seedNorthwindPack();
    const first = await PolicyClause.countDocuments({ packRef: NORTHWIND_PACK_REF });
    await seedNorthwindPack(); // no-op
    const second = await PolicyClause.countDocuments({ packRef: NORTHWIND_PACK_REF });
    expect(second).toBe(first);
  });

  it("is isolated from the demo pack by packRef (no clause-number collisions across packs)", async () => {
    await seedNorthwindPack();
    await seedDemoPolicyPack();
    const nwNumbers = (await PolicyClause.find({ packRef: NORTHWIND_PACK_REF }).lean())
      .map((r) => r.clauseNumber).sort((a, b) => a - b);
    const demoNumbers = (await PolicyClause.find({ packRef: DEMO_PACK_REF }).lean())
      .map((r) => r.clauseNumber).sort((a, b) => a - b);
    // Demo owns 4/7/9 (+0 law line); Northwind owns 31/41/42/51/61 (+0 law lines).
    // The 0 law line exists in both packs but under different packRefs — that's fine.
    const demoNumbered = demoNumbers.filter((n) => n > 0);
    const nwNumbered = nwNumbers.filter((n) => n > 0);
    expect(demoNumbered).toEqual([4, 7, 9]);
    expect(nwNumbered).toEqual([31, 41, 42, 51, 61]);
    expect(demoNumbered.some((n) => nwNumbered.includes(n))).toBe(false);
  });

  it("regression: clause-number-0 law lines now validate and persist (the demo law line lands too)", async () => {
    // Previously the schema required clauseNumber .positive(), which rejected 0,
    // so neither the demo law line nor these pointers could be seeded. Both
    // packs now insert their 0-rows.
    await seedDemoPolicyPack();
    const demoLaw = await PolicyClause.findOne({ packRef: DEMO_PACK_REF, clauseNumber: 0 }).lean();
    expect(demoLaw).not.toBeNull();
    expect(demoLaw?.jurisdiction).toBe("Ireland");

    await seedNorthwindPack();
    const nwLaw = await PolicyClause.find({ packRef: NORTHWIND_PACK_REF, clauseNumber: 0 }).lean();
    expect(nwLaw.length).toBeGreaterThan(0);
  });

  it("loadNorthwindClauseParameters returns the scenario windows (with safe defaults)", async () => {
    // Unseeded → defaults.
    const before = await loadNorthwindClauseParameters();
    expect(before.acceptanceWindowDays).toBe(7);
    expect(before.deemedAcceptanceDays).toBe(7);
    expect(before.graceWindowHours).toBe(48);

    await seedNorthwindPack();
    const after = await loadNorthwindClauseParameters();
    expect(after.acceptanceWindowDays).toBe(7); // clause 31
    expect(after.deemedAcceptanceDays).toBe(7); // clause 31
    expect(after.graceWindowHours).toBe(48); // clause 51
  });
});
