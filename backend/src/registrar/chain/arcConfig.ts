/* ============================================================================
   INT-01 — Typed Arc Testnet configuration + adapter boundaries.
   Centralizes all Arc/Circle address + chain values. No scattered literals.
   ========================================================================== */

import type { Config } from "@finne/config";

/** Normalize an EVM address to lowercase (canonical form for storage/hashing). */
export function normalizeAddress(addr: string): string {
  if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  return addr.toLowerCase();
}

/** Normalize a transaction hash to lowercase. */
export function normalizeTxHash(hash: string): string {
  if (!hash.match(/^0x[a-fA-F0-9]{64}$/)) {
    throw new Error(`Invalid transaction hash: ${hash}`);
  }
  return hash.toLowerCase();
}

/** Build an explorer link for a transaction or address. */
export function explorerTxUrl(config: Config, txHash: string): string {
  return `${config.arc.explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(config: Config, address: string): string {
  return `${config.arc.explorerUrl}/address/${address}`;
}

/**
 * Validate that an address is on the allowlisted chain and is not zero.
 * Wrong-chain / zero / unallowlisted values fail before persistence (INT-01).
 */
export function validateChainAddress(addr: string | null | undefined, label: string): string {
  if (!addr) throw new Error(`${label} is required.`);
  if (addr === "0x" + "0".repeat(40)) throw new Error(`${label} is zero address.`);
  return normalizeAddress(addr);
}

/** Chain config summary for the meta endpoint (no secrets). */
export function chainMeta(config: Config) {
  return {
    chainId: config.arc.chainId,
    chainName: config.arc.chainName,
    rpcUrl: config.arc.rpcUrl,
    explorerUrl: config.arc.explorerUrl,
    usdcAddress: config.arc.usdcAddress,
    registryAddress: config.arc.registryAddress,
    finalityBlocks: config.arc.finalityBlocks,
  };
}
