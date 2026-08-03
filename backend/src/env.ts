/* ============================================================================
   Environment loading + boot-fail assertions (P4, §16.2).
   This is the FIRST statement of config loading. The backend refuses to boot
   when money-moving key material is present in its environment — the only
   permitted key is the registry operator key, which anchors hashes and can
   never move USDC (C2 has no transfer code; C1 doesn't know it).

   Run this before anything else touches process.env.
   ========================================================================== */

const PERMITTED_PRIVATE_KEY = "REGISTRY_OPERATOR_PRIVATE_KEY";

// Any name matching these patterns is money-moving key material. Covers raw
// private keys plus recovery material (mnemonic/seed phrase/keystore) the agent
// service already rejects (GAP-S1) — the backend must reject them too.
const FORBIDDEN_KEY_PATTERN = /PRIVATE_KEY|MNEMONIC|SEED_PHRASE|KEYSTORE/i;

/** Throws if a forbidden key appears in the environment. */
export function assertNoMoneyKeys(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of Object.keys(env)) {
    if (!FORBIDDEN_KEY_PATTERN.test(name)) continue;
    if (name === PERMITTED_PRIVATE_KEY) continue; // the single hash-anchor key
    throw new Error(
      `boot-fail: money-moving key "${name}" present in backend environment. ` +
        `Backend holds only the registry operator key. (PRD §16.2, P4, GAP-S1)`,
    );
  }
}

export interface Env {
  mongoUrl: string;
  backendPort: number;
  internalToken: string;
  sessionSecret: string;
  demoMode: boolean;
  arc: {
    rpcUrl: string;
    chainId: number;
    chainName: string;
    explorerUrl: string;
    refundProtocolAddress: string | null;
    caseRegistryAddress: string | null;
    usdcAddress: string | null;
  };
  registryOperatorKey: string | null;
  responseWindowHours: number;
  /** Block to start indexing from (the contract deploy block). 0 = head-at-boot. */
  indexerStartBlock: bigint;
}

/* ============================================================================
   Deployed contract addresses — Arc testnet (hard-coded defaults).
   These are the live deployments from contracts/.env.deploy + scripts/deploy-arc.sh.
   Hard-coding them means the app works on a fresh clone with no .env and the
   contracts never need redeploying. A .env / environment override still wins,
   so a different deployment (e.g. a second testnet run) can point at new
   addresses without touching code. The arbiter baked into RefundProtocol at
   construction is immutable and documented in contracts/.env.deploy.
   ========================================================================== */
const DEFAULT_REFUND_PROTOCOL_ADDRESS = "0x6EE86fEE126C94CD3bE0d2a5187F69368965f989";
const DEFAULT_CASE_REGISTRY_ADDRESS = "0x9Db75cf6B7Ecb6efDac5C141E17bE3884a3e6D4d";

let loaded: Env | null = null;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  if (loaded) return loaded;

  // P4: boot-fail on forbidden keys (must run before the key is read below).
  assertNoMoneyKeys(env);

  const demoMode = env.DEMO_MODE !== "false"; // only literal 'false' disables (PRD §18.2)

  loaded = {
    mongoUrl: env.MONGO_URL || "mongodb://127.0.0.1:27017/finne",
    backendPort: parseIntOr(env.BACKEND_PORT, 4000),
    internalToken: env.INTERNAL_TOKEN || "dev-internal",
    sessionSecret: env.SESSION_SECRET || "change-me",
    demoMode,
    arc: {
      rpcUrl: env.ARC_RPC_URL || "http://127.0.0.1:8545",
      chainId: parseIntOr(env.ARC_CHAIN_ID, 31338),
      chainName: env.ARC_CHAIN_NAME || "arc-local",
      explorerUrl: env.ARC_EXPLORER_URL || "",
      // Hard-coded deployed addresses (see constants above). An explicit env
      // override wins, but absent that the app points at the live Arc testnet
      // contracts without any .env setup.
      refundProtocolAddress: env.REFUND_PROTOCOL_ADDRESS || DEFAULT_REFUND_PROTOCOL_ADDRESS,
      caseRegistryAddress: env.CASE_REGISTRY_ADDRESS || DEFAULT_CASE_REGISTRY_ADDRESS,
      usdcAddress: env.USDC_ADDRESS || null,
    },
    registryOperatorKey: env.REGISTRY_OPERATOR_PRIVATE_KEY || null,
    responseWindowHours: parseIntOr(env.RESPONSE_WINDOW_HOURS, 72),
    // INDEXER_START_BLOCK: the contract deploy block — lets a fresh backend
    // index from contract birth instead of head, so historical PaymentCreated
    // events aren't missed (0 = head-at-boot, the old behaviour).
    indexerStartBlock: BigInt(parseIntOr(env.INDEXER_START_BLOCK, 0)),
  };
  return loaded;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
