/* ============================================================================
   @finne/config tests (FND-04) — positive/negative environment validation.
   ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, isPlaceholder, assertNoMoneyKeys, parseManifest, ARC_TESTNET_DEFAULTS } from "../src/index.ts";

function makeEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "local",
    MONGO_URL: "mongodb://127.0.0.1:27017/finne",
    SESSION_SECRET: "local-dev-secret-minimum-16-chars",
    INTERNAL_TOKEN: "local-internal-token-min-16",
    ARC_RPC_URL: "https://rpc.testnet.arc.io",
    ARC_CHAIN_ID: "5042002",
    ...overrides,
  };
}

describe("config loading — local stage", () => {
  beforeEach(() => {});

  it("loads with sensible local defaults", () => {
    const config = loadConfig({ env: makeEnv(), stage: "local" });
    expect(config.stage).toBe("local");
    expect(config.demoMode).toBe(true);
    expect(config.port).toBe(4000);
    expect(config.responseWindowHours).toBe(72);
    expect(config.arc.chainId).toBe(5042002);
    expect(config.arc.usdcAddress).toBeNull();
  });

  it("accepts wallet inventory from env", () => {
    const config = loadConfig({
      env: makeEnv({
        PLATFORM_PAYOUT_WALLET: "0x1111111111111111111111111111111111111111",
        REVIEWER_WALLET: "0x2222222222222222222222222222222222222222",
      }),
      stage: "local",
    });
    expect(config.wallets.platformPayout).toBe("0x1111111111111111111111111111111111111111");
    expect(config.wallets.reviewer).toBe("0x2222222222222222222222222222222222222222");
  });
});

describe("config loading — staging/submission gates (FND-04 step 3)", () => {
  it("fails on placeholder SESSION_SECRET in staging", () => {
    expect(() =>
      loadConfig({ env: makeEnv({ SESSION_SECRET: "change-me-now-please!" }), stage: "staging" }),
    ).toThrow();
  });

  it("fails on placeholder INTERNAL_TOKEN in submission", () => {
    expect(() =>
      loadConfig({ env: makeEnv({ INTERNAL_TOKEN: "dev-internal-token!!" }), stage: "submission" }),
    ).toThrow();
  });

  it("fails on missing USDC address in staging", () => {
    expect(() =>
      loadConfig({ env: makeEnv(), stage: "staging" }),
    ).toThrow(/ARC_USDC_ADDRESS is required/);
  });

  it("fails on missing registry address in staging", () => {
    expect(() =>
      loadConfig({
        env: makeEnv({ ARC_USDC_ADDRESS: "0x3600000000000000000000000000000000000000" }),
        stage: "staging",
      }),
    ).toThrow(/CASE_REGISTRY_ADDRESS is required/);
  });

  it("fails on non-local HTTP rpc url in staging", () => {
    expect(() =>
      loadConfig({
        env: makeEnv({
          ARC_RPC_URL: "http://rpc.example.com",
          ARC_USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
          CASE_REGISTRY_ADDRESS: "0x9Db75cf6B7Ecb6efDac5C141E17bE3884a3e6D4d",
        }),
        stage: "staging",
      }),
    ).toThrow(/HTTPS/);
  });

  it("passes staging with all required values set", () => {
    const config = loadConfig({
      env: makeEnv({
        SESSION_SECRET: "real-staging-secret-32-chars-min!!",
        INTERNAL_TOKEN: "real-staging-internal-32-chars!!",
        ARC_USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
        CASE_REGISTRY_ADDRESS: "0x9Db75cf6B7Ecb6efDac5C141E17bE3884a3e6D4d",
      }),
      stage: "staging",
    });
    expect(config.stage).toBe("staging");
  });
});

describe("boot-fail money-key guard (P4)", () => {
  it("allows REGISTRY_OPERATOR_PRIVATE_KEY", () => {
    expect(() =>
      assertNoMoneyKeys({ REGISTRY_OPERATOR_PRIVATE_KEY: "0xabc" }),
    ).not.toThrow();
  });

  it("rejects ARBITER_PRIVATE_KEY", () => {
    expect(() =>
      assertNoMoneyKeys({ ARBITER_PRIVATE_KEY: "0xabc" }),
    ).toThrow(/Money-moving key/);
  });

  it("rejects PAYER_PRIVATE_KEY", () => {
    expect(() =>
      assertNoMoneyKeys({ PAYER_PRIVATE_KEY: "0xabc" }),
    ).toThrow(/Money-moving key/);
  });

  it("rejects MNEMONIC", () => {
    expect(() =>
      assertNoMoneyKeys({ MNEMONIC: "abandon abandon" }),
    ).toThrow(/Money-moving key/);
  });

  it("rejects SEED_PHRASE", () => {
    expect(() =>
      assertNoMoneyKeys({ SEED_PHRASE: "abandon" }),
    ).toThrow(/Money-moving key/);
  });
});

describe("placeholder detection", () => {
  it("detects common placeholders", () => {
    expect(isPlaceholder("change-me")).toBe(true);
    expect(isPlaceholder("changeme")).toBe(true);
    expect(isPlaceholder("your-secret-here")).toBe(true);
    expect(isPlaceholder("dev-internal")).toBe(true);
    expect(isPlaceholder("xxx")).toBe(true);
  });

  it("passes real values", () => {
    expect(isPlaceholder("a-real-secret-32-chars-long!!")).toBe(false);
    expect(isPlaceholder(null)).toBe(false);
    expect(isPlaceholder(undefined)).toBe(false);
  });
});

describe("deployment manifest", () => {
  it("ARC_TESTNET_DEFAULTS is well-formed", () => {
    // The defaults have _pending_ fields until CON-06 deploys — the schema
    // validation would reject them, so we just check the shape.
    expect(ARC_TESTNET_DEFAULTS.schemaVersion).toBe(1);
    expect(ARC_TESTNET_DEFAULTS.chainId).toBe(5042002);
    expect(ARC_TESTNET_DEFAULTS.registry.name).toBe("FinneCaseRegistry");
  });

  it("parses a valid manifest", () => {
    const valid = JSON.stringify({
      schemaVersion: 1,
      stage: "submission",
      chainId: 5042002,
      chainName: "Arc Testnet",
      rpcUrl: "https://rpc.testnet.arc.io",
      explorerUrl: "https://testnet.arcscan.app",
      registry: {
        name: "FinneCaseRegistry",
        address: "0x9Db75cf6B7Ecb6efDac5C141E17bE3884a3e6D4d",
        deploymentTx: "0x" + "a".repeat(64),
        deploymentBlock: 1000,
        deployer: "0x" + "1".repeat(40),
        compilerVersion: "0.8.24",
        optimizerRuns: 200,
        abiHash: "0x" + "b".repeat(64),
        bytecodeHash: "0x" + "c".repeat(64),
        verificationUrl: "https://testnet.arcscan.app/address/0x9Db",
      },
      usdc: { address: "0x" + "3".repeat(40), decimals: 6, name: "USDC" },
      roleHolders: {
        registryAdmin: "0x" + "4".repeat(40),
        platform: "0x" + "5".repeat(40),
        reviewer: "0x" + "6".repeat(40),
        agent: "0x" + "7".repeat(40),
      },
      gitCommit: "abc1234",
      deployedAt: "2026-08-04T12:00:00.000Z",
    });
    const manifest = parseManifest(valid);
    expect(manifest.chainId).toBe(5042002);
    expect(manifest.registry.address).toBe("0x9Db75cf6B7Ecb6efDac5C141E17bE3884a3e6D4d");
  });
});
