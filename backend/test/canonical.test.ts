import { describe, it, expect } from "vitest";
import { canonicalizeJSON, canonicalHash, sha256Hex } from "../src/canonical.ts";

/* Canonicalization + hashing tests (PRD §9.4, FIN-19).
   Determinism is the load-bearing property — the same logical value must hash
   to the same bytes in every service, or anchored hashes diverge. */

describe("canonical JSON", () => {
  it("sorts keys at every depth", () => {
    expect(canonicalizeJSON({ b: 1, a: 2 })).toBe(canonicalizeJSON({ a: 2, b: 1 }));
    expect(canonicalizeJSON({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalizeJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  it("skips undefined-valued properties (absent == undefined)", () => {
    expect(canonicalizeJSON({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("is deterministic regardless of key insertion order, nested", () => {
    const a = { payout: { refundTo: "0x1", amount: "100" }, case: { id: "C1" } };
    const b = { case: { id: "C1" }, payout: { amount: "100", refundTo: "0x1" } };
    expect(canonicalizeJSON(a)).toBe(canonicalizeJSON(b));
  });

  it("produces a stable keccak256 hash for the same content", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects non-finite numbers and class instances; elides undefined-valued props", () => {
    expect(() => canonicalizeJSON({ x: NaN })).toThrow(/non-finite/);
    // undefined-valued properties are skipped (PRD §9.4: absent == undefined)
    expect(canonicalizeJSON({ x: undefined })).toBe("{}");
    expect(() => canonicalizeJSON(new Date())).toThrow(/plain objects/);
  });

  it("rejects circular references", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalizeJSON(a)).toThrow(/circular/);
  });
});

describe("sha256Hex", () => {
  it("produces a stable hex fingerprint", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("hello")).not.toBe(sha256Hex("goodbye"));
  });
});
