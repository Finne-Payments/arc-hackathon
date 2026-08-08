/* ============================================================================
   Case-context builder tests — proves buildCaseContext degrades cleanly when
   on-chain reads, the WorkOrder, and the legacy Payout are all absent (the
   common local-dev case: no chain link, no indexed payment). The builder must
   never throw and must always return a usable StructuredCaseContext.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { buildCaseContext, contextToPromptText } from "../src/registrar/caseContext.ts";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

/** A minimal case detail with no chain link, no work order, no response. */
const thinDetail = {
  case: {
    caseId: "case_test",
    paymentId: "pay_none",
    claimType: "non_delivery",
    allegation: "Video three was never delivered.",
    challengedAmountMicroUsdc: "100000000",
    openedAt: "2026-06-20T00:00:00Z",
  },
  payment: {
    amountMicroUsdc: "300000000",
    recipient: "0xrecipient",
    payer: "0xplatform",
    paidAt: "2026-06-01T00:00:00Z",
    txHash: "0xnonexistent",
  },
  response: null,
  evidence: [],
  decision: null,
  analyses: [],
  correction: null,
  frame: null,
  frameStatus: null,
  clauses: [],
} as never; // cast: buildCaseContext only reads the fields it needs

describe("buildCaseContext degrade paths", () => {
  it("never throws and returns a structured context with no chain sources", async () => {
    const ctx = await buildCaseContext(thinDetail);
    expect(ctx).toBeTruthy();
    // Allegation + dispute always present (from the case doc).
    expect(ctx.allegation).toContain("Video three");
    expect(ctx.claimType).toBe("non_delivery");
    // No work order → placeholder deliverable.
    expect(ctx.deliverables.length).toBe(1);
    expect(ctx.deliverables[0].source).toBe("placeholder");
    // No on-chain read possible → null + flagged unavailable.
    expect(ctx.paymentOnChain).toBeNull();
    expect(ctx.onChainUnavailable).toBe(true);
    expect(ctx.chainFigures).toBeNull();
    expect(ctx.chainEvents).toEqual([]);
  });

  it("serializes to a verdict-free, sourced prompt block", async () => {
    const ctx = await buildCaseContext(thinDetail);
    const text = contextToPromptText(ctx);
    expect(text).toContain("CASE CONTEXT");
    expect(text).toContain("Video three");
    // Sourced labels present.
    expect(text).toMatch(/source/i);
    // Verdict-free: no outcome-action words in the context block itself.
    for (const word of ["refund", "reject", "approve", "release"]) {
      expect(text.toLowerCase()).not.toContain(`should ${word}`);
    }
  });

  it("handles a missing payment doc gracefully", async () => {
    const ctx = await buildCaseContext({ ...(thinDetail as object), payment: null } as never);
    expect(ctx.paymentAmountMicroUsdc).toBe("100000000"); // falls back to challenged
    expect(ctx.payer).toBe("");
    expect(ctx.paymentOnChain).toBeNull();
  });
});
