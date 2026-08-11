import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../env.ts";

/* ============================================================================
   Chain clients (PRD §7.3). The backend holds exactly ONE key — the registry
   operator key — which can only anchor hashes to the CaseRegistry and can never
   move USDC. All money-moving keys live in browser wallets / console scripts.

   The publicClient is read-only (no key). The walletClient signs anchor txs.
   Both degrade gracefully if the RPC is unreachable — the backend never crashes
   on a chain failure (PRD §13.4 resilience).
   ========================================================================== */

let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    const env = loadEnv();
    _publicClient = createPublicClient({
      chain: {
        id: env.arc.chainId,
        name: env.arc.chainName,
        // Arc uses USDC as the native gas token (18 decimals for gas accounting).
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: { default: { http: [env.arc.rpcUrl] } },
      },
      transport: http(env.arc.rpcUrl, { timeout: 10_000 }),
    });
  }
  return _publicClient;
}

export function getWalletClient(): WalletClient | null {
  const env = loadEnv();
  if (!env.registryOperatorKey) return null;
  if (!_walletClient) {
    const account = privateKeyToAccount(env.registryOperatorKey as Address);
    _walletClient = createWalletClient({
      account,
      chain: {
        id: env.arc.chainId,
        name: env.arc.chainName,
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: { default: { http: [env.arc.rpcUrl] } },
      },
      transport: http(env.arc.rpcUrl, { timeout: 15_000 }),
    });
  }
  return _walletClient;
}

/** The operator address (derived from the key) — used as the CaseRegistry caller. */
export function operatorAddress(): Address | null {
  const env = loadEnv();
  if (!env.registryOperatorKey) return null;
  return privateKeyToAccount(env.registryOperatorKey as Address).address;
}

export function refundProtocolAddress(): Address | null {
  const env = loadEnv();
  return (env.arc.refundProtocolAddress as Address | null) ?? null;
}

export function caseRegistryAddress(): Address | null {
  const env = loadEnv();
  return (env.arc.caseRegistryAddress as Address | null) ?? null;
}

export function usdcAddress(): Address | null {
  const env = loadEnv();
  return (env.arc.usdcAddress as Address | null) ?? null;
}

/**
 * Resolve the platform's arbiter address from the Platform collection.
 *
 * The arbiter is the address the RefundProtocol was constructed with (and the
 * only signer refundByArbiterWithSig will accept). It is registered once per
 * platform and surfaced via /config (public.ts reads the same field). Chain
 * reads — the case-room's arbiter-reserve figure — need the SAME address or
 * they read `balances(0)` and report a reserve of 0.
 *
 * Returns null if no Platform doc exists or the field is unset (the caller
 * degrades to a 0/empty read). Lazy-imports the model to avoid pulling mongoose
 * into the chain module graph at import time.
 */
export async function arbiterAddress(): Promise<Address | null> {
  try {
    const { Platform } = await import("../models/index.ts");
    const platform = await Platform.findOne({}).lean();
    const addr = platform?.arbiterAddress;
    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr as Address;
    return null;
  } catch {
    return null; // DB unavailable — degrade (caller reads 0)
  }
}

/* ============================================================================
   EIP-712 domain verification (EIP-5267).

   The signature-based refund path (refundByArbiterWithSig) is only valid if the
   typed-data domain the arbiter signs off-chain EXACTLY matches the domain the
   contract binds to on chain. A mismatch (different name/version, or pointing
   the relayer at a different verifyingContract) silently makes every signature
   recover to the wrong address → InvalidSignature revert, with no obvious cause.

   The contract exposes eip712Domain() (EIP-5267); this reads it and asserts the
   four fields that must match the off-chain payload the backend builds in
   buildRefundTypedData(): name "RefundProtocol", version "1", the configured
   chainId, and the configured refundProtocolAddress. Mismatches throw — the
   server boot surfaces the error rather than serving a broken refund path.

   Degradation: like the other chain clients, an RPC failure or a contract that
   doesn't implement eip712Domain (e.g. the old deployed bytecode, which predates
   the new functions) logs a warning and returns — it never crashes the backend.
   ========================================================================== */

export interface Eip712DomainOnChain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: Address;
}

/** Expected EIP-712 domain — the values buildRefundTypedData() hardcodes. */
export const EXPECTED_EIP712_NAME = "RefundProtocol";
export const EXPECTED_EIP712_VERSION = "1";

/**
 * Read eip712Domain() from the deployed RefundProtocol and assert it matches the
 * domain the backend builds for refund signatures. Resolves ok on match; throws
 * on a hard mismatch; returns null when the check cannot run (no address, no
 * client, RPC failure, or a contract that predates eip712Domain).
 */
export async function verifyEip712Domain(): Promise<Eip712DomainOnChain | null> {
  const env = loadEnv();
  const client = getPublicClient();
  const rp = env.arc.refundProtocolAddress as Address | null;
  if (!client || !rp) return null;
  try {
    // eip712Domain() returns (bytes1 fields, string name, string version,
    // uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions).
    const result = (await client.readContract({
      address: rp,
      abi: [
        {
          type: "function",
          name: "eip712Domain",
          stateMutability: "view",
          inputs: [],
          outputs: [
            { name: "fields", type: "bytes1" },
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
            { name: "salt", type: "bytes32" },
            { name: "extensions", type: "uint256[]" },
          ],
        },
      ],
      functionName: "eip712Domain",
      args: [],
    })) as [unknown, string, string, bigint, Address, `0x${string}`, bigint[]];

    const [, name, version, chainId, verifyingContract] = result;
    const onChain: Eip712DomainOnChain = { name, version, chainId, verifyingContract };

    const mismatches: string[] = [];
    if (name !== EXPECTED_EIP712_NAME) {
      mismatches.push(`name: expected "${EXPECTED_EIP712_NAME}", on-chain "${name}"`);
    }
    if (version !== EXPECTED_EIP712_VERSION) {
      mismatches.push(`version: expected "${EXPECTED_EIP712_VERSION}", on-chain "${version}"`);
    }
    if (chainId !== BigInt(env.arc.chainId)) {
      mismatches.push(`chainId: expected ${env.arc.chainId}, on-chain ${chainId}`);
    }
    if (verifyingContract.toLowerCase() !== rp.toLowerCase()) {
      mismatches.push(`verifyingContract: expected ${rp}, on-chain ${verifyingContract}`);
    }
    if (mismatches.length > 0) {
      throw new Error(
        `EIP-712 domain mismatch — refund signatures will revert InvalidSignature:\n  ` +
          mismatches.join("\n  "),
      );
    }
    return onChain;
  } catch (e) {
    // A revert from eip712Domain (e.g. the OLD deployed contract that predates
    // the new functions, or an RPC failure) is a soft-fail: log and return null
    // so boot continues. A *successful* read with wrong values (above) is a hard
    // throw — that's the dangerous case we want to catch.
    if (e instanceof Error && e.message.startsWith("EIP-712 domain mismatch")) throw e;
    console.warn(
      `[backend] eip712Domain() check skipped for ${rp}: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}
