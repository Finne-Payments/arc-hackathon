import { describe, it, expect } from "vitest";
import { fillOutcomeRequirements } from "../src/agent/frame-templates.ts";
import { computeUnresolved } from "../src/agent/frame-unresolved.ts";
import { runChecks } from "../src/proof/checks.ts";
import { phraseTurningQuestions } from "../src/agent/frame-questions.ts";
import { generateNarrative } from "../src/agent/narrative.ts";
import { validateDraftFrame, generateId } from "@finne/domain";
import { filterModelText, gateLine } from "../src/agent/post-filter.ts";

/* FIN-105 — models-unplugged: the full frame renders correctly with the model
   permanently failing. Every model-adjacent surface degrades; the loop never
   depends on the model (P8). This is also what local dev runs when no model
   container is up.

   We simulate "model permanently failing" by pointing the client at a disabled
   endpoint. The frame must still assemble at rung 1 (requirements + unresolved),
   validate clean, and never block a decision. */

const CLAUSES = { graceWindowHours: 48, acceptancePeriodDays: 14 };
const CHECK_INPUT = {
  payment: { amountMicroUsdc: "300000000", recipient: "0xrecipient", payer: "0xplatform", paidAt: "2026-06-01T00:00:00Z" },
  challengedAmountMicroUsdc: "100000000",
  claimType: "non_delivery",
  allegation: "Video three was never delivered.",
  disputeOpenedAt: "2026-06-20T00:00:00Z",
  deliverables: [{ name: "Video 3", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" }],
  deliveryTimestamps: { "Video 3": "2026-06-02T00:00:00Z" },
  rejectionTimestamps: { "Video 3": null },
  clauses: CLAUSES,
};

describe("FIN-105 models-unplugged degrade path", () => {
  // The model client degrades when MODEL_BASE_URL is unset/empty. In the test
  // environment no model is running, so phraseTurningQuestions / generateNarrative
  // return degraded results — exactly the FIN-105 unplugged scenario.

  it("checks run with no model — pure functions", () => {
    const findings = runChecks(CHECK_INPUT);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.result === "fail" || f.result === "pass")).toBe(true);
  });

  it("outcome requirements fill with no model (templates)", () => {
    const findings = runChecks(CHECK_INPUT);
    const reqs = fillOutcomeRequirements("non_delivery", findings);
    expect(reqs.length).toBe(4);
    expect(reqs.every((r) => r.provenance === "template")).toBe(true);
  });

  it("unresolved compute with no model (computed)", () => {
    const findings = runChecks(CHECK_INPUT);
    const items = computeUnresolved({
      hasResponse: false,
      evidenceBySide: { platform: 2, recipient: 0 },
      contestedAmountMicroUsdc: "100000000",
      deliverableAmountsMicroUsdc: ["100000000"],
      deliverablesWithoutCriteria: [],
      findings,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((u) => u.provenance === "computed")).toBe(true);
  });

  it("turning questions degrade to empty when model is disabled", async () => {
    const findings = runChecks(CHECK_INPUT);
    const { questions, degraded } = await phraseTurningQuestions("test context", findings);
    // Model disabled → degraded true, no questions. Frame renders rung 1.
    expect(degraded).toBe(true);
    expect(questions.length).toBe(0);
  });

  it("narrative degrades to null when model is disabled", async () => {
    const res = await generateNarrative("test context", "findings summary");
    expect(res.degraded).toBe(true);
    expect(res.text).toBeNull();
  });

  it("FIN-122: the canonical demo case yields the three agreed unresolved items", () => {
    // Addendum §E.1: the three agreed unresolved items are (1) an unanswered
    // reply, (2) uncountered evidence, (3) a contested amount not matching a
    // tranche. The demo case is set up so the other two kinds do NOT fire:
    // acceptance criteria are present (no absent_acceptance_criteria), and a
    // written rejection is recorded inside the window (no missing_written_rejection).
    const findings = runChecks({
      ...CHECK_INPUT,
      rejectionTimestamps: { "Video 3": "2026-06-01T12:00:00Z" }, // rejection present → no missing_written_rejection
      deliverables: [{ name: "Video 3", due: "2026-06-01T00:00:00Z", acceptanceCriteria: "30s clip" }], // criteria present
    });
    const items = computeUnresolved({
      hasResponse: false, // (1) unanswered reply
      evidenceBySide: { platform: 2, recipient: 0 }, // (2) uncountered evidence
      contestedAmountMicroUsdc: "70000000", // (3) 70M doesn't match the 100M tranche
      deliverableAmountsMicroUsdc: ["100000000"],
      deliverablesWithoutCriteria: [], // criteria present
      findings,
    });
    const kinds = items.map((u) => u.kind).sort();
    // The three agreed items (Addendum §E.1), alphabetically sorted.
    expect(kinds).toEqual([
      "contested_amount_mismatch",
      "unanswered_reply",
      "uncountered_evidence",
    ]);
    expect(items.length).toBe(3);
  });

  it("the full frame assembles + validates at rung 1 with the model unplugged", () => {
    const findings = runChecks(CHECK_INPUT);
    const requirements = fillOutcomeRequirements("non_delivery", findings);
    const unresolved = computeUnresolved({
      hasResponse: false,
      evidenceBySide: { platform: 2, recipient: 0 },
      contestedAmountMicroUsdc: "100000000",
      deliverableAmountsMicroUsdc: ["100000000"],
      deliverablesWithoutCriteria: [],
      findings,
    });
    // Build the frame as assembly would with questions empty (degraded).
    const frame = {
      schemaVersion: 1 as const,
      frameId: generateId("frame"),
      caseId: "case_test",
      questions: [], // degraded — no model
      requirements,
      unresolved,
      citationDepth: { platform: 2, recipient: 2 }, // structural count (FIN-126)
      modelDigest: null, // models-unplugged
      generatedAt: new Date().toISOString(),
    };
    // The frame MUST validate even with zero questions — this is the degrade contract.
    const validated = validateDraftFrame(frame);
    expect(validated.questions.length).toBe(0);
    expect(validated.requirements.length).toBe(4);
    expect(validated.unresolved.length).toBeGreaterThan(0);
  });
});

/* FIN-103 — outcome-word post-filter. Model lines with outcome words are
   blocked; template/computed lines pass through exempt. */
describe("FIN-103 outcome-word post-filter", () => {
  it("blocks the outcome-action words in model lines", () => {
    for (const word of ["refund", "reject", "approve", "release", "refunding", "rejected", "approval"]) {
      const res = filterModelText(`the platform should ${word} the payment`);
      expect(res.blocked, `expected "${word}" to be blocked`).toBe(true);
      expect(res.matched.map((m) => m.toLowerCase())).toContain(word.toLowerCase());
    }
  });

  it("passes clean text through", () => {
    const res = filterModelText("Was video three delivered within the clause-4 grace window?");
    expect(res.blocked).toBe(false);
    expect(res.text).toBe("Was video three delivered within the clause-4 grace window?");
  });

  it("exempts template and computed lines from filtering", () => {
    // A template line legitimately names outcomes — it must pass unfiltered.
    const tmpl = gateLine("For PLATFORM_UPHELD: the deliverable must be undelivered.", "template");
    expect(tmpl.degrade).toBe(false);
    expect(tmpl.text).toContain("PLATFORM_UPHELD");

    const comp = gateLine("Contested amount: 100000000 micro-USDC", "computed");
    expect(comp.degrade).toBe(false);
  });

  it("degrades (drops) model lines that trip the filter", () => {
    const res = gateLine("The platform should refund the recipient", "model");
    expect(res.degrade).toBe(true);
  });
});
