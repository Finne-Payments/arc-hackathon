import { describe, it, expect } from "vitest";
import { assertNoMoneyKeys } from "../src/env.ts";

/* Boot-fail assertions (P4, PRD §16.2). The backend refuses to start when
   money-moving key material is present — only the registry operator key is
   permitted, and it cannot move USDC. */

describe("env boot-fail assertions", () => {
  it("allows the registry operator key", () => {
    expect(() => assertNoMoneyKeys({ REGISTRY_OPERATOR_PRIVATE_KEY: "0xabc" })).not.toThrow();
  });

  it("allows no keys at all", () => {
    expect(() => assertNoMoneyKeys({})).not.toThrow();
  });

  it("fails on ARBITER_PRIVATE_KEY", () => {
    expect(() => assertNoMoneyKeys({ ARBITER_PRIVATE_KEY: "0x1" })).toThrow(/money-moving key/);
  });

  it("fails on PAYER_PRIVATE_KEY and RECIPIENT_PRIVATE_KEY", () => {
    expect(() => assertNoMoneyKeys({ PAYER_PRIVATE_KEY: "0x2" })).toThrow();
    expect(() => assertNoMoneyKeys({ RECIPIENT_PRIVATE_KEY: "0x3" })).toThrow();
  });

  it("fails on any other *_PRIVATE_KEY regardless of value", () => {
    expect(() => assertNoMoneyKeys({ SOME_OTHER_PRIVATE_KEY: "" })).toThrow(/money-moving key/);
    // case-insensitive name match
    expect(() => assertNoMoneyKeys({ random_private_key: "x" })).toThrow();
  });

  it("still fails when the operator key is present alongside a forbidden key", () => {
    expect(() =>
      assertNoMoneyKeys({ REGISTRY_OPERATOR_PRIVATE_KEY: "0xok", ARBITER_PRIVATE_KEY: "0xbad" }),
    ).toThrow();
  });
});
