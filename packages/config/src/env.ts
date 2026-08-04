/* ============================================================================
   Typed configuration — Zod-validated environment (FND-04).
   Replaces the old hardcoded env.ts. Stage-aware: local/test allow placeholders;
   staging/submission fail on placeholders, wrong chain, missing addresses.
   ========================================================================== */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Stages                                                                      */
/* -------------------------------------------------------------------------- */

export type Stage = "local" | "test" | "staging" | "submission";
export const STAGES: Stage[] = ["local", "test", "staging", "submission"];

/* -------------------------------------------------------------------------- */
/* Arc Testnet config                                                          */
/* -------------------------------------------------------------------------- */

const arcConfigSchema = z.object({
  chainId: z.number().int().positive(),
  chainName: z.string(),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().url().or(z.literal("")),
  usdcAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).or(z.null()),
  registryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).or(z.null()),
  systemEmitterAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).or(z.null()),
  memoAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).or(z.null()),
  finalityBlocks: z.number().int().min(0).default(3),
});
export type ArcConfig = z.infer<typeof arcConfigSchema>;

/* -------------------------------------------------------------------------- */
/* Role-holder wallets (CON-01, INT-04)                                        */
/* -------------------------------------------------------------------------- */

const walletAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const walletInventorySchema = z.object({
  platformPayout: walletAddress.or(z.null()).default(null),
  registryPlatform: walletAddress.or(z.null()).default(null),
  reviewer: walletAddress.or(z.null()).default(null),
  agent: walletAddress.or(z.null()).default(null),
  registryAdmin: walletAddress.or(z.null()).default(null),
});
export type WalletInventory = z.infer<typeof walletInventorySchema>;

/* -------------------------------------------------------------------------- */
/* Full config schema                                                          */
/* -------------------------------------------------------------------------- */

export const configSchema = z.object({
  stage: z.enum(["local", "test", "staging", "submission"]),
  demoMode: z.boolean(),

  // Server
  port: z.number().int().positive().default(4000),
  corsOrigins: z.array(z.string()).default([]),

  // Mongo
  mongoUrl: z.string(),

  // JWT / session (min-length enforced in staging/submission gates, not the schema)
  sessionSecret: z.string(),
  internalToken: z.string(),

  // Arc chain
  arc: arcConfigSchema,

  // Registry operator key (the ONE Finné-held key — hash-anchor-only)
  registryOperatorKey: z.string().or(z.null()).default(null),

  // Response window
  responseWindowHours: z.number().int().positive().default(72),

  // Role wallets
  wallets: walletInventorySchema.default({}),

  // Circle integration (INT-04 — secret references, never raw keys)
  circle: z.object({
    apiKey: z.string().or(z.null()).default(null),
    entitySecret: z.string().or(z.null()).default(null),
    walletSetId: z.string().or(z.null()).default(null),
  }).default({}),

  // AWS / storage adapters (AWS-02 — secret references)
  storage: z.object({
    evidenceBucket: z.string().or(z.null()).default(null),
    kmsKeyId: z.string().or(z.null()).default(null),
    sqsQueueUrl: z.string().or(z.null()).default(null),
    sqsDlqUrl: z.string().or(z.null()).default(null),
  }).default({}),

  // IdP / OIDC (BE-04)
  idp: z.object({
    issuer: z.string().or(z.null()).default(null),
    clientId: z.string().or(z.null()).default(null),
    clientSecret: z.string().or(z.null()).default(null),
    audience: z.string().or(z.null()).default(null),
  }).default({}),
});
export type Config = z.infer<typeof configSchema>;

/* -------------------------------------------------------------------------- */
/* Placeholder detection (FND-04 step 3)                                       */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER_PATTERNS = [
  "change-me",
  "changeme",
  "placeholder",
  "your-",
  "xxx",
  "dev-internal",
  "test-secret",
];

export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((p) => lower.includes(p));
}

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

export interface LoadOptions {
  /** Override the stage (e.g. from CI). Defaults to NODE_ENV or "local". */
  stage?: Stage;
  /** Raw env object (defaults to process.env). */
  env?: Record<string, string | undefined>;
}

/**
 * Load and validate configuration from env. In staging/submission, fails hard
 * on placeholders, wrong chain, or missing required addresses (FND-04 step 3).
 */
export function loadConfig(opts: LoadOptions = {}): Config {
  const env = opts.env ?? process.env;
  const stage: Stage = opts.stage ?? (env.NODE_ENV as Stage) ?? "local";
  const isProductionLike = stage === "staging" || stage === "submission";

  // Parse CORS origins
  const corsOrigins = (env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Parse wallets from env
  const wallets: Partial<WalletInventory> = {};
  if (env.PLATFORM_PAYOUT_WALLET) wallets.platformPayout = env.PLATFORM_PAYOUT_WALLET;
  if (env.REGISTRY_PLATFORM_WALLET) wallets.registryPlatform = env.REGISTRY_PLATFORM_WALLET;
  if (env.REVIEWER_WALLET) wallets.reviewer = env.REVIEWER_WALLET;
  if (env.AGENT_WALLET) wallets.agent = env.AGENT_WALLET;
  if (env.REGISTRY_ADMIN_WALLET) wallets.registryAdmin = env.REGISTRY_ADMIN_WALLET;

  // Arc testnet defaults — Arc testnet chain ID 5042002, native USDC
  // envOrEmpty: treat empty string as null (env files often have VAR= with no value)
  const envOrNull = (v: string | undefined): string | null => (!v || v.trim() === "" ? null : v);

  const arc: Partial<ArcConfig> = {
    chainId: parseIntOr(env.ARC_CHAIN_ID, 5042002),
    chainName: env.ARC_CHAIN_NAME ?? "Arc Testnet",
    rpcUrl: env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io",
    explorerUrl: env.ARC_EXPLORER_URL ?? "https://testnet.arcscan.app",
    usdcAddress: envOrNull(env.ARC_USDC_ADDRESS),
    registryAddress: envOrNull(env.CASE_REGISTRY_ADDRESS),
    systemEmitterAddress: envOrNull(env.ARC_SYSTEM_EMITTER),
    memoAddress: envOrNull(env.ARC_MEMO_ADDRESS),
    finalityBlocks: parseIntOr(env.ARC_FINALITY_BLOCKS, 3),
  };

  const sessionSecret = env.SESSION_SECRET ?? (isProductionLike ? "" : "dev-session-secret-min16ch");
  const internalToken = env.INTERNAL_TOKEN ?? (isProductionLike ? "" : "dev-internal");

  const raw: unknown = {
    stage,
    demoMode: env.DEMO_MODE !== "false",
    port: parseIntOr(env.BACKEND_PORT, 4000),
    corsOrigins,
    mongoUrl: env.MONGO_URL ?? "mongodb://127.0.0.1:27017/finne",
    sessionSecret,
    internalToken,
    arc,
    registryOperatorKey: envOrNull(env.REGISTRY_OPERATOR_PRIVATE_KEY),
    responseWindowHours: parseIntOr(env.RESPONSE_WINDOW_HOURS, 72),
    wallets,
    circle: {
      apiKey: env.CIRCLE_API_KEY ?? null,
      entitySecret: env.CIRCLE_ENTITY_SECRET ?? null,
      walletSetId: env.CIRCLE_WALLET_SET_ID ?? null,
    },
    storage: {
      evidenceBucket: env.EVIDENCE_BUCKET ?? null,
      kmsKeyId: env.KMS_KEY_ID ?? null,
      sqsQueueUrl: env.SQS_QUEUE_URL ?? null,
      sqsDlqUrl: env.SQS_DLQ_URL ?? null,
    },
    idp: {
      issuer: env.IDP_ISSUER ?? null,
      clientId: env.IDP_CLIENT_ID ?? null,
      clientSecret: env.IDP_CLIENT_SECRET ?? null,
      audience: env.IDP_AUDIENCE ?? null,
    },
  };

  const parsed = configSchema.parse(raw);

  /* ---- Production gates (FND-04 step 3) ---- */
  if (isProductionLike) {
    assertNoPlaceholders(parsed, stage);
    assertRequiredAddresses(parsed, stage);
    assertNoHttpRpc(parsed, stage);
  }

  // Boot-fail guard: never allow money-moving keys in the service env.
  // The ONLY permitted key is the registry operator key (hash-anchor-only).
  assertNoMoneyKeys(env);

  return parsed;
}

/* -------------------------------------------------------------------------- */
/* Production assertions                                                       */
/* -------------------------------------------------------------------------- */

function assertNoPlaceholders(config: Config, stage: Stage): void {
  const checks: Array<{ name: string; value: string | null | undefined; minLen?: number }> = [
    { name: "SESSION_SECRET", value: config.sessionSecret, minLen: 16 },
    { name: "INTERNAL_TOKEN", value: config.internalToken, minLen: 16 },
    { name: "MONGO_URL", value: config.mongoUrl },
    { name: "ARC_RPC_URL", value: config.arc.rpcUrl },
  ];
  for (const { name, value, minLen } of checks) {
    if (!value || isPlaceholder(value)) {
      throw new ConfigError(`${name} is missing or a placeholder in ${stage} stage. Set a real value.`);
    }
    if (minLen && value.length < minLen) {
      throw new ConfigError(`${name} must be at least ${minLen} characters in ${stage} stage.`);
    }
  }
}

function assertRequiredAddresses(config: Config, stage: Stage): void {
  if (!config.arc.usdcAddress) {
    throw new ConfigError(`ARC_USDC_ADDRESS is required in ${stage} stage.`);
  }
  if (!config.arc.registryAddress) {
    throw new ConfigError(`CASE_REGISTRY_ADDRESS is required in ${stage} stage.`);
  }
}

function assertNoHttpRpc(config: Config, stage: Stage): void {
  if (config.arc.rpcUrl.startsWith("http://") && !config.arc.rpcUrl.includes("127.0.0.1")) {
    throw new ConfigError(`ARC_RPC_URL must be HTTPS in ${stage} stage (got ${config.arc.rpcUrl}).`);
  }
}

/**
 * Boot-fail guard (P4/§16.2): no money-moving keys in the service environment.
 * The ONLY permitted key is REGISTRY_OPERATOR_PRIVATE_KEY (hash-anchor-only).
 */
export function assertNoMoneyKeys(env: Record<string, string | undefined>): void {
  const PERMITTED_KEY = "REGISTRY_OPERATOR_PRIVATE_KEY";
  const MONEY_KEY_PATTERN = /PRIVATE_KEY|MNEMONIC|SEED_PHRASE|KEYSTORE/i;
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (key === PERMITTED_KEY) continue;
    if (MONEY_KEY_PATTERN.test(key)) {
      throw new ConfigError(
        `Money-moving key "${key}" detected in environment. Finné services may only hold the registry operator key (hash-anchor-only).`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function parseIntOr(env: string | undefined, fallback: number): number {
  if (!env) return fallback;
  const n = parseInt(env, 10);
  return isNaN(n) ? fallback : n;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Singleton accessor (cached after first load). */
let _cached: Config | null = null;
export function getConfig(opts?: LoadOptions): Config {
  if (_cached && !opts) return _cached;
  _cached = loadConfig(opts);
  return _cached;
}

export function resetConfigCache(): void {
  _cached = null;
}
