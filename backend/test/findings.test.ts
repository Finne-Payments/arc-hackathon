import { describe, it, expect } from "vitest";
import {
  validateBriefPayload,
  ForbiddenFindingFieldError,
  InvalidBriefError,
} from "../src/findings.ts";

/* Agent brief verdict-guard tests (P1, PRD §13.3). The agent reports findings
   only; any verdict-shaped key at any depth is rejected → 422. */

const VALID = {
  payoutRef: "1",
  caseRef: "CASE-0142",
  checks: [{ check: "Video 1", expected: "1 file", found: "x.mp4", result: "pass" }],
  inconsistencies: [],
  missingItems: [],
};

describe("brief verdict-guard", () => {
  it("accepts a clean findings-only brief", () => {
    expect(() => validateBriefPayload(structuredClone(VALID))).not.toThrow();
  });

  it("rejects a forbidden recommendation key at the top level", () => {
    const bad = structuredClone(VALID);
    (bad as Record<string, unknown>).recommendation = "approve";
    expect(() => validateBriefPayload(bad)).toThrow(ForbiddenFindingFieldError);
  });

  it("rejects a forbidden verdict key nested inside a check", () => {
    const bad = structuredClone(VALID);
    (bad.checks[0] as Record<string, unknown>).verdict = "guilty";
    expect(() => validateBriefPayload(bad)).toThrow(ForbiddenFindingFieldError);
  });

  it("rejects an unknown check field", () => {
    const bad = structuredClone(VALID);
    (bad.checks[0] as Record<string, unknown>).confidence = 0.9;
    expect(() => validateBriefPayload(bad)).toThrow(InvalidBriefError);
  });

  it("rejects an invalid result value", () => {
    const bad = structuredClone(VALID);
    bad.checks[0].result = "approved";
    expect(() => validateBriefPayload(bad)).toThrow(InvalidBriefError);
  });

  it("forbids keys like approve/reject/decision/outcome at any depth", () => {
    for (const key of ["approve", "reject", "decision", "outcome", "suggestion", "conclusion", "ruling"]) {
      const bad = structuredClone(VALID);
      (bad as Record<string, unknown>)[key] = "x";
      expect(() => validateBriefPayload(bad)).toThrow(ForbiddenFindingFieldError);
    }
  });
});
