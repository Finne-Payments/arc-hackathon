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

export function arbiterAddress(): Address | null {
  // The arbiter address comes from /config (the platform's registered arbiter).
  // For chain view reads it's read from config at call time; this is a placeholder
  // resolved by the caller.
  return null;
}
