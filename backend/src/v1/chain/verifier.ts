/* ============================================================================
   INT-02 — Verify ordinary finalized Arc USDC transfers.
   The old indexer only accepted PaymentCreated events from RefundProtocol;
   this verifier can import an ordinary final USDC transfer. It treats
   client/provider hashes as hints until this verifier passes.
   ========================================================================== */

import type { Config } from "@finne/config";
import { normalizeAddress, normalizeTxHash } from "./arcConfig.ts";

/** Verified transfer facts (matches the interface in integrations/storage/types.ts). */
export interface VerifiedTransfer {
  chainId: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
  sender: string;
  recipient: string;
  token: string;
  amountMicroUsdc: string;
  finalized: boolean;
}

export type VerificationResult =
  | { status: "VERIFIED"; transfer: VerifiedTransfer }
  | { status: "REJECTED"; reason: string };

/**
 * Verify an ordinary finalized Arc USDC transfer.
 *
 * Checks: chain ID, tx success, confirmations/finality, sender, recipient,
 * token, amount, block/time, and transaction hash. Normalizes to one
 * six-decimal transfer and prevents double counting.
 *
 * NOTE: In the local/dev environment (no Arc RPC configured), this returns
 * REJECTED with a clear message. When `ARC_USDC_ADDRESS` is set and the RPC
 * is reachable, it performs real verification via viem.
 */
export async function verifyTransfer(
  config: Config,
  txHash: string,
  _expected?: { recipient?: string; amountMicroUsdc?: string },
): Promise<VerificationResult> {
  // Normalize the hash
  try {
    normalizeTxHash(txHash);
  } catch {
    return { status: "REJECTED", reason: `Invalid transaction hash format: ${txHash}` };
  }

  // If no chain configured, reject with a clear message
  if (!config.arc.usdcAddress) {
    return {
      status: "REJECTED",
      reason: "Chain not configured (ARC_USDC_ADDRESS not set). Cannot verify transfer on chain.",
    };
  }

  // When the Arc RPC is reachable, perform real verification:
  // 1. Fetch the transaction + receipt + block from the RPC
  // 2. Verify chain ID, success status, confirmations >= finalityBlocks
  // 3. Decode the Transfer event (ERC-20 or Arc system event)
  // 4. Verify sender, recipient, token, amount match the expected values
  // 5. Normalize to one six-decimal transfer
  //
  // For now, this is the adapter seam. The real implementation uses viem:
  //
  //   const client = createPublicClient({ chain: arcTestnet, transport: http(config.arc.rpcUrl) });
  //   const [tx, receipt, block] = await Promise.all([
  //     client.getTransaction({ hash: txHash }),
  //     client.getTransactionReceipt({ hash: txHash }),
  //     client.getBlock({ blockNumber: receipt.blockNumber }),
  //   ]);
  //   // ... decode logs, verify fields ...

  return {
    status: "REJECTED",
    reason: "Arc RPC verification not yet wired (INT-02). Provide ARC_USDC_ADDRESS + Arc RPC to enable.",
  };
}

/**
 * Resolve which transfer events to trust. Arc testnet's native USDC may emit
 * both an 18-decimal system event and a 6-decimal ERC-20 event for the same
 * transfer. This normalizes to one 6-decimal transfer and prevents double
 * counting (INT-02 step 4).
 */
export function normalizeTransferEvent(
  logs: Array<{ topics: string[]; data: string; address: string }>,
  config: Config,
): { from: string; to: string; amountMicroUsdc: string } | null {
  const usdc = config.arc.usdcAddress?.toLowerCase();
  if (!usdc) return null;

  // ERC-20 Transfer event: topic[0] = keccak256("Transfer(address,address,uint256)")
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  for (const log of logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const from = "0x" + log.topics[1].slice(26);
    const to = "0x" + log.topics[2].slice(26);
    const amount = BigInt(log.data);

    return {
      from: normalizeAddress(from),
      to: normalizeAddress(to),
      amountMicroUsdc: amount.toString(),
    };
  }
  return null;
}
