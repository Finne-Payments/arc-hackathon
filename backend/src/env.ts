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

/* ============================================================================
   FIN-102: no external model API in any environment. Inference runs on
   Finné-controlled machines with open weights (P9, D7). The self-hosted model
   (vLLM on AWS GPU / Ollama on the build laptop) needs NO vendor key — the
   endpoint is a plain HTTP URL on the internal Docker network. A vendor key
   present here means someone wired up an external API by mistake, and the
   backend refuses to boot. This is the proof that P9 holds.
   ========================================================================== */

// Vendor key name patterns. Matches the common external model providers. The
// self-hosted runtime (MODEL_BASE_URL) is a URL, not a key, so it never matches.
const FORBIDDEN_MODEL_KEY_PATTERN =
  /^(OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|GROQ_API_KEY|TOGETHER_API_KEY|TOGETHERAI_API_KEY|MISTRAL_API_KEY|COHERE_API_KEY|REPLICATE_API_TOKEN|PERPLEXITY_API_KEY|DEEPSEEK_API_KEY|FIREWORKS_API_KEY|AWS_BEDROCK_.*|BEDROCK_.*|HF_TOKEN|HUGGING_FACE_HUB_TOKEN|REPLICATE_.*|ANYSCALE_API_KEY)/i;

/** Throws if an external model vendor key is present (FIN-102, P9, D7). */
export function assertNoExternalModelKeys(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of Object.keys(env)) {
    if (!FORBIDDEN_MODEL_KEY_PATTERN.test(name)) continue;
    throw new Error(
      `boot-fail: external model API key "${name}" present in backend environment. ` +
        `Model inference runs on Finné-controlled machines with open weights (P9/D7/FIN-102). ` +
        `Remove the key; the self-hosted model needs no vendor credentials.`,
    );
  }
}

/* ============================================================================
   HACKATHON EXCEPTION — AWS Bedrock (model provider).

   P9/D7 (and FIN-102 above) hold that inference runs on self-hosted open
   weights and NO case content is sent to any external model API. Bedrock is a
   hosted (external) model service, so routing dispute content to it is a
   deliberate, temporary deviation from that posture — added for the hackathon
   only, because self-hosted GPUs are inaccessible during the build.

   The deviation must be impossible to trigger by accident. `MODEL_PROVIDER=bedrock`
   is refused at boot unless the operator ALSO sets the explicit opt-in flag
   `MODEL_BEDROCK_HACKATHON_OPT_IN=true`, and an AWS region is configured
   (Bedrock authenticates via IAM, not an API key — see model-client.ts). When
   the opt-in is absent, the default self-hosted posture is unchanged and every
   guardrail (FIN-102, FIN-103, FIN-130, FIN-133) still applies.
   ========================================================================== */

export type ModelProvider = "openai-compatible" | "bedrock";

/** Throws if the Bedrock provider is selected without the explicit hackathon opt-in. */
export function assertBedrockHackathonOptIn(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.MODEL_PROVIDER ?? "openai-compatible") !== "bedrock") return; // default posture unchanged
  if (env.MODEL_BEDROCK_HACKATHON_OPT_IN !== "true") {
    throw new Error(
      `boot-fail: MODEL_PROVIDER=bedrock selects a HOSTED external model (AWS Bedrock), ` +
        `which deviates from P9/D7 (no case content sent to an external model API). ` +
        `This is permitted only as an explicit hackathon exception. ` +
        `Set MODEL_BEDROCK_HACKATHON_OPT_IN=true to confirm you accept the deviation.`,
    );
  }
  if (!env.AWS_REGION) {
    throw new Error(
      `boot-fail: MODEL_PROVIDER=bedrock requires AWS_REGION (Bedrock authenticates via IAM, ` +
        `not an API key). Set AWS_REGION (and ensure the IAM principal has bedrock:InvokeModel).`,
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
  /**
   * Rolling lookback window (in blocks). Each tick the indexer scans this many
   * blocks of contract activity — not the whole chain from deploy. Picks up
   * fresh pays/refunds/withdrawals + anything in the recent window; dedupes via
   * the {txHash, logIndex} unique index so nothing is double-counted.
   */
  indexerLookbackBlocks: bigint;
  /**
   * Self-hosted model runtime (P9/D7, FIN-100/101). An OpenAI-compatible HTTP
   * endpoint on the internal Docker network — vLLM on an AWS GPU (prod) or
   * Ollama on the build laptop (dev). No vendor key; MODEL_BASE_URL is a URL.
   * The 5s hard timeout (P8) is the degrade contract: on failure the station
   * degrades silently to templates + computation.
   */
  model: {
    provider: ModelProvider; // "openai-compatible" (default) | "bedrock" (hackathon exception)
    baseUrl: string;
    name: string; // served model name (config only — never a model name in call sites, FIN-101)
    digest: string | null; // pinned digest, recorded in docs/models.md (FIN-100)
    timeoutMs: number; // hard timeout per call (P8); default 5000
    /** AWS region for the Bedrock client when provider=bedrock. */
    awsRegion: string | null;
  };
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
  // FIN-102: boot-fail on external model vendor keys (P9/D7). Runs before any
  // model config is read. Trivially passes when the self-hosted runtime is used.
  assertNoExternalModelKeys(env);
  // HACKATHON: refuse Bedrock unless the operator explicitly opted in (P9/D7).
  assertBedrockHackathonOptIn(env);

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
      // USDC address: ARC_USDC_ADDRESS is the documented convention (root .env,
      // CDK finne-stack, verifier.ts, router.ts). USDC_ADDRESS is accepted as a
      // back-compat alias (backend/.env). Without one, /config returns null and
      // the New Payout button stays disabled — no money can move.
      usdcAddress: env.ARC_USDC_ADDRESS || env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
    },
    registryOperatorKey: env.REGISTRY_OPERATOR_PRIVATE_KEY || null,
    responseWindowHours: parseIntOr(env.RESPONSE_WINDOW_HOURS, 72),
    // INDEXER_LOOKBACK_BLOCKS: rolling window of recent contract activity the
    // indexer scans each tick — not the whole chain from deploy. Default 5000
    // (~7 min of Arc blocks at ~510s/block) catches any fresh pay/refund/withdraw
    // even if a tick is missed. Replays are deduped by the unique index.
    indexerLookbackBlocks: BigInt(parseIntOr(env.INDEXER_LOOKBACK_BLOCKS, 5000)),
    model: {
      // Provider selects the inference backend. Default "openai-compatible" is
      // the self-hosted vLLM/Ollama posture (P9/D7). "bedrock" is the hackathon
      // exception — gated by assertBedrockHackathonOptIn above.
      provider: (env.MODEL_PROVIDER as ModelProvider) || "openai-compatible",
      // Self-hosted OpenAI-compatible endpoint. Default points at the compose
      // `model` service on the Docker network; dev (Ollama on Mac) overrides to
      // http://host.docker.internal:11434/v1. No vendor key is ever read.
      baseUrl: env.MODEL_BASE_URL || "http://model:8000/v1",
      name: env.MODEL_NAME || "Qwen/Qwen2.5-3B-Instruct",
      digest: env.MODEL_DIGEST || null,
      timeoutMs: parseIntOr(env.MODEL_TIMEOUT_MS, 5000), // P8 hard timeout
      awsRegion: env.AWS_REGION || null, // Bedrock client region (provider=bedrock)
    },
  };
  return loaded;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
