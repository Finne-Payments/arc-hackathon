import type { Address, Log } from "viem";
import { decodeEventLog } from "viem";
import { getPublicClient, refundProtocolAddress, caseRegistryAddress } from "./client.ts";
import { REFUND_PROTOCOL_ABI, CASE_REGISTRY_ABI } from "./abis.ts";
import { fromBaseUnitsDisplay } from "../usdc.ts";

/* ============================================================================
   Chain read helpers — view reads + event log fetching.
   All degrade to null/empty on RPC failure (PRD §13.4 — never crash on chain).
   ========================================================================== */

export interface ChainFigures {
  arbiterReserve: string;
  recipientDebt: string;
}

/** Read the arbiter reserve and a recipient's debt from the RefundProtocol. */
export async function readChainFigures(arbiter: Address | null, recipient: Address | null): Promise<ChainFigures | null> {
  const client = getPublicClient();
  const rp = refundProtocolAddress();
  if (!client || !rp) return null;
  try {
    const tasks: Promise<unknown>[] = [];
    if (arbiter) tasks.push(client.readContract({ address: rp, abi: REFUND_PROTOCOL_ABI, functionName: "balances", args: [arbiter] }));
    else tasks.push(Promise.resolve(0n));
    if (recipient) tasks.push(client.readContract({ address: rp, abi: REFUND_PROTOCOL_ABI, functionName: "debts", args: [recipient] }));
    else tasks.push(Promise.resolve(0n));
    const [reserve, debt] = await Promise.all(tasks) as [bigint, bigint];
    return { arbiterReserve: fromBaseUnitsDisplay(reserve), recipientDebt: fromBaseUnitsDisplay(debt) };
  } catch {
    return null; // RPC failure — degrade, never error the route
  }
}

export interface PaymentOnChain {
  to: string;
  amount: bigint;
  releaseTimestamp: bigint;
  refundTo: string;
  withdrawnAmount: bigint;
  refunded: boolean;
}

/** Read a payment's on-chain state from the RefundProtocol. */
export async function readPayment(paymentId: bigint): Promise<PaymentOnChain | null> {
  const client = getPublicClient();
  const rp = refundProtocolAddress();
  if (!client || !rp) return null;
  try {
    const result = await client.readContract({
      address: rp,
      abi: REFUND_PROTOCOL_ABI,
      functionName: "payments",
      args: [paymentId],
    });
    const [to, amount, releaseTimestamp, refundTo, withdrawnAmount, refunded] = result as [string, bigint, bigint, string, bigint, boolean];
    return { to, amount, releaseTimestamp, refundTo, withdrawnAmount, refunded };
  } catch {
    return null;
  }
}

/** Read the current debt for a recipient (used by the indexer to decide debtRecorded). */
export async function readDebt(recipient: Address): Promise<bigint | null> {
  const client = getPublicClient();
  const rp = refundProtocolAddress();
  if (!client || !rp) return null;
  try {
    return (await client.readContract({ address: rp, abi: REFUND_PROTOCOL_ABI, functionName: "debts", args: [recipient] })) as bigint;
  } catch {
    return null;
  }
}

/** Fetch RefundProtocol + CaseRegistry logs since the given block. */
export async function fetchChainLogs(fromBlock: bigint): Promise<Log[]> {
  return fetchChainLogsRange(fromBlock, "latest");
}

/**
 * Fetch logs in a bounded [fromBlock, toBlock] range. Arc's RPC caps log
 * queries at 100k blocks; this chunks any larger range so a backfill from the
 * contract deploy block to head doesn't get rejected. Errors are surfaced (the
 * caller decides), not silently swallowed — silently-empty results were how the
 * indexer previously missed real PaymentCreated events.
 */
export async function fetchChainLogsRange(fromBlock: bigint, toBlock: bigint | "latest"): Promise<Log[]> {
  const client = getPublicClient();
  const rp = refundProtocolAddress();
  const registry = caseRegistryAddress();
  if (!client) return [];

  const end = toBlock === "latest" ? await client.getBlockNumber().catch(() => fromBlock) : toBlock;
  const CHUNK = 90_000n; // under the 100k RPC cap
  const out: Log[] = [];
  for (let start = fromBlock; start <= end; start += CHUNK) {
    const chunkEnd = start + CHUNK - 1n > end ? end : start + CHUNK - 1n;
    const tasks: Promise<Log[]>[] = [];
    if (rp) tasks.push(client.getLogs({ address: rp, fromBlock: start, toBlock: chunkEnd }));
    if (registry) tasks.push(client.getLogs({ address: registry, fromBlock: start, toBlock: chunkEnd }));
    if (tasks.length === 0) continue;
    const results = await Promise.all(tasks);
    out.push(...results.flat());
  }
  return out.sort((a, b) => {
    const blockDiff = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
    if (blockDiff !== 0) return blockDiff;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });
}

/** Decode a log into { eventName, args } using the known ABIs. */
export function decodeLog(log: Log): { eventName: string; args: Record<string, unknown> } | null {
  try {
    for (const abi of [REFUND_PROTOCOL_ABI, CASE_REGISTRY_ABI]) {
      const decoded = decodeEventLog({ abi, data: log.data ?? "0x", topics: log.topics ?? [] });
      if (decoded && decoded.eventName) {
        return { eventName: decoded.eventName, args: decoded.args as unknown as Record<string, unknown> };
      }
    }
  } catch {
    /* not a known event */
  }
  return null;
}
