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
}

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
      refundProtocolAddress: env.REFUND_PROTOCOL_ADDRESS || null,
      caseRegistryAddress: env.CASE_REGISTRY_ADDRESS || null,
      usdcAddress: env.USDC_ADDRESS || null,
    },
    registryOperatorKey: env.REGISTRY_OPERATOR_PRIVATE_KEY || null,
    responseWindowHours: parseIntOr(env.RESPONSE_WINDOW_HOURS, 72),
  };
  return loaded;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
