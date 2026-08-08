import { describe, it, expect } from "vitest";
import { runChecks, type CheckInput } from "../src/proof/checks.ts";

/* FIN-113 / FIN-114 / FIN-115 — the checks engine: grace window (clause 4) and
   acceptance status (clause 7) are the two new checks that "flip the picture"
   in the demo. They cite their clauses, enabling clickable citations (FIN-115). */

const CLAUSES = { graceWindowHours: 48, acceptancePeriodDays: 14 };

const base = (over: Partial<CheckInput>): CheckInput => ({
  payment: { amountMicroUsdc: "300000000", recipient: "0xr", payer: "0xp", paidAt: "2026-06-01T00:00:00Z" },
  challengedAmountMicroUsdc: "100000000",
  claimType: "non_delivery",
  allegation: "Video three was never delivered.",
  disputeOpenedAt: "2026-06-20T00:00:00Z",
  deliverables: [{ name: "Video 3", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" }],
  deliveryTimestamps: { "Video 3": "2026-06-02T00:00:00Z" },
  rejectionTimestamps: { "Video 3": null },
  clauses: CLAUSES,
  ...over,
});

describe("FIN-113 check 8: grace window (clause 4)", () => {
  it("passes on time", () => {
    const f = runChecks(base({ deliveryTimestamps: { "Video 3": "2026-06-01T00:00:00Z" } }));
    const g = f.find((x) => x.checkId === "grace_window:Video 3");
    expect(g?.result).toBe("pass");
    expect(g?.clauseRef).toBe(4);
  });

  it("passes inside the 48h window (one day late)", () => {
    const f = runChecks(base({})); // default: delivered 2 June, due 1 June = 24h late
    const g = f.find((x) => x.checkId === "grace_window:Video 3");
    expect(g?.result).toBe("pass");
    expect(g?.found).toContain("24h late, inside window");
  });

  it("fails outside the window", () => {
    const f = runChecks(base({ deliveryTimestamps: { "Video 3": "2026-06-05T00:00:00Z" } })); // 4 days late
    const g = f.find((x) => x.checkId === "grace_window:Video 3");
    expect(g?.result).toBe("fail");
  });

  it("fails when a written rejection is present inside the window", () => {
    const f = runChecks(base({ rejectionTimestamps: { "Video 3": "2026-06-01T12:00:00Z" } }));
    const g = f.find((x) => x.checkId === "grace_window:Video 3");
    expect(g?.result).toBe("fail");
    expect(g?.found).toContain("rejected in writing");
  });

  it("is missing when no delivery timestamp", () => {
    const f = runChecks(base({ deliveryTimestamps: { "Video 3": null } }));
    const g = f.find((x) => x.checkId === "grace_window:Video 3");
    expect(g?.result).toBe("missing");
  });
});

describe("FIN-114 check 9: acceptance status (clause 7)", () => {
  it("passes when disputed before deemed acceptance", () => {
    const f = runChecks(base({ disputeOpenedAt: "2026-06-10T00:00:00Z" })); // before 16 June
    const a = f.find((x) => x.checkId === "acceptance_status:Video 3");
    expect(a?.result).toBe("pass");
    expect(a?.clauseRef).toBe(7);
  });

  it("fails when disputed after deemed acceptance (the demo beat)", () => {
    const f = runChecks(base({})); // dispute 20 June, deemed accepted 16 June
    const a = f.find((x) => x.checkId === "acceptance_status:Video 3");
    expect(a?.result).toBe("fail");
    expect(a?.found).toContain("2026-06-16"); // deemed-accepted date
    expect(a?.found).toContain("2026-06-20"); // dispute date
  });

  it("passes at the boundary (dispute on the deemed-accepted day)", () => {
    // Deemed accepted = submission (2 June) + 14 days = 16 June. Dispute on 16 June
    // is at the boundary — disputedBeforeAcceptance uses <=, so 16 June is "before".
    const f = runChecks(base({ disputeOpenedAt: "2026-06-16T00:00:00Z" }));
    const a = f.find((x) => x.checkId === "acceptance_status:Video 3");
    expect(a?.result).toBe("pass");
  });

  it("is missing when no submission timestamp", () => {
    const f = runChecks(base({ deliveryTimestamps: { "Video 3": null } }));
    const a = f.find((x) => x.checkId === "acceptance_status:Video 3");
    expect(a?.result).toBe("missing");
  });
});

describe("FIN-115 checks engine — clause citations enabled", () => {
  it("the two clause-citing checks (8 & 9) are present in findings", () => {
    const f = runChecks(base({}));
    const checkTypes = new Set(f.map((x) => x.checkId.split(":")[0]));
    expect(checkTypes.has("grace_window")).toBe(true); // check 8, clause 4
    expect(checkTypes.has("acceptance_status")).toBe(true); // check 9, clause 7
  });

  it("every clause-citing finding carries its clauseRef (for clickable citations)", () => {
    const f = runChecks(base({}));
    const clauseFindings = f.filter((x) => x.checkId.startsWith("grace_window:") || x.checkId.startsWith("acceptance_status:"));
    expect(clauseFindings.length).toBeGreaterThan(0);
    expect(clauseFindings.every((x) => x.clauseRef !== undefined)).toBe(true);
  });

  it("the demo case (3 deliverables) yields findings across all four check types", () => {
    const f = runChecks(base({
      deliverables: [
        { name: "Video 1", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" },
        { name: "Video 2", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" },
        { name: "Video 3", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" },
      ],
      deliveryTimestamps: { "Video 1": "2026-05-30T00:00:00Z", "Video 2": "2026-05-31T00:00:00Z", "Video 3": "2026-06-02T00:00:00Z" },
      rejectionTimestamps: { "Video 1": null, "Video 2": null, "Video 3": null },
    }));
    const types = new Set(f.map((x) => x.checkId.split(":")[0]));
    // amount + delivery + grace_window + acceptance_status = 4 check types
    expect(types.size).toBe(4);
    expect(f.length).toBe(10); // 1 + 3 + 3 + 3
  });
});

/* -------------------------------------------------------------------------- */
/* Check 10 — order of performance (Northwind scenario clause 4.1)            */
/* Evaluation (b): did the payment happen in the right order — i.e. AFTER     */
/* acceptance? The load-bearing finding in the Northwind × Kestrel dispute.   */
/* -------------------------------------------------------------------------- */

// A Northwind-scenario-shaped input: M3 (UI motion assets), submitted 15 Jun,
// paid 17 Jun (BEFORE any acceptance), rejected 20 Jun. Deemed-acceptance
// window 7 business days ~ 7 days here for the check.
const NW = (over: Partial<CheckInput>): CheckInput => ({
  payment: { amountMicroUsdc: "500000000", recipient: "0xkestrel", payer: "0xnorthwind", paidAt: "2026-06-17T00:00:00Z" },
  challengedAmountMicroUsdc: "500000000",
  claimType: "non_delivery",
  allegation: "Payment released before acceptance of M3.",
  disputeOpenedAt: "2026-06-23T00:00:00Z",
  deliverables: [{ name: "UI motion assets", due: "2026-06-15T00:00:00Z", acceptanceCriteria: "hero animations per spec" }],
  deliveryTimestamps: { "UI motion assets": "2026-06-15T00:00:00Z" }, // submitted 15 Jun
  rejectionTimestamps: { "UI motion assets": "2026-06-20T00:00:00Z" },
  acceptanceTimestamps: { "UI motion assets": null }, // no written acceptance
  clauses: { graceWindowHours: 48, acceptancePeriodDays: 14, deemedAcceptanceDays: 7 },
  ...over,
});

describe("check 10: order of performance (clause 4.1)", () => {
  it("FAILS the Northwind beat — paid before deemed acceptance, no written acceptance", () => {
    // paid 17 Jun; submitted 15 Jun + 7d deemed = 22 Jun → paid before deemed.
    const f = runChecks(NW({}));
    const o = f.find((x) => x.checkId === "payment_ordering:UI motion assets");
    expect(o?.result).toBe("fail");
    expect(o?.clauseRef).toBe(41);
    expect(o?.found).toContain("wrong order");
  });

  it("PASSES when paid after written acceptance (correct order)", () => {
    const f = runChecks(NW({
      payment: { amountMicroUsdc: "500000000", recipient: "0xkestrel", payer: "0xnorthwind", paidAt: "2026-06-21T00:00:00Z" },
      acceptanceTimestamps: { "UI motion assets": "2026-06-20T00:00:00Z" }, // accepted 20 Jun, paid 21 Jun
    }));
    const o = f.find((x) => x.checkId === "payment_ordering:UI motion assets");
    expect(o?.result).toBe("pass");
    expect(o?.found).toContain("after acceptance");
  });

  it("FAILS when paid BEFORE written acceptance", () => {
    const f = runChecks(NW({
      // accepted retroactively 24 Jun, but paid 17 Jun → wrong order.
      acceptanceTimestamps: { "UI motion assets": "2026-06-24T00:00:00Z" },
    }));
    const o = f.find((x) => x.checkId === "payment_ordering:UI motion assets");
    expect(o?.result).toBe("fail");
  });

  it("PASSES when paid on/after deemed acceptance (no written acceptance)", () => {
    const f = runChecks(NW({
      payment: { amountMicroUsdc: "500000000", recipient: "0xkestrel", payer: "0xnorthwind", paidAt: "2026-06-22T00:00:00Z" },
      acceptanceTimestamps: { "UI motion assets": null }, // none — rely on deemed
    }));
    // deemed = 15 Jun + 7d = 22 Jun; paid 22 Jun → on/after deemed.
    const o = f.find((x) => x.checkId === "payment_ordering:UI motion assets");
    expect(o?.result).toBe("pass");
  });

  it("is MISSING when no acceptance and no submission timestamp", () => {
    const f = runChecks(NW({ deliveryTimestamps: { "UI motion assets": null } }));
    const o = f.find((x) => x.checkId === "payment_ordering:UI motion assets");
    expect(o?.result).toBe("missing");
  });

  it("is inert (no payment_ordering findings) when acceptanceTimestamps is absent", () => {
    // The demo/non-delivery cases never populate acceptanceTimestamps, so the
    // check must not emit spurious findings for them.
    const f = runChecks(base({}));
    expect(f.some((x) => x.checkId.startsWith("payment_ordering:"))).toBe(false);
  });
});
