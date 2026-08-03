import type { Log } from "viem";
import { fetchChainLogs, decodeLog, readDebt } from "./chain/reads.ts";
import { ChainEvent, Meta, Payout } from "./models/index.ts";
import { confirmRefundExecuted, confirmWithdrawn, recordDetectedPayment } from "./services.ts";
import { loadEnv } from "./env.ts";
import { fromBaseUnitsDisplay } from "./usdc.ts";

/* ============================================================================
   Indexer (PRD §12, C3). A poll loop that watches a ROLLING WINDOW of recent
   contract activity and drives the backend state machines — the chain is the
   source of truth.

   Each tick scans the last INDEXER_LOOKBACK_BLOCKS for any pay/refund/withdraw/
   anchor events from the contracts — NOT the whole chain from deploy. This
   catches every fresh action over the window; the {txHash, logIndex} unique
   index dedupes anything already seen, so overlapping windows are safe.

   This avoids walking the entire chain (the contract was deployed millions of
   blocks ago) and instead follows recent activity — exactly what's needed for a
   live system: new pays, refunds, withdrawals, and anchors, recorded as they
   happen. A one-shot backfill (backfill.ts) is used when historical catch-up is
   explicitly needed.
   ========================================================================== */

// Poll interval — Arc testnet's public RPC rate-limits aggressively, so we poll
// every 30s. Events are idempotent (the unique txHash+logIndex index dedupes),
// so a slower poll loses no data.
const POLL_MS = 30_000;
const STALE_THRESHOLD_MS = 90_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startIndexer(): void {
  if (running) return;
  running = true;
  timer = setInterval(tick, POLL_MS);
  // fire one immediately so we don't wait on boot
  void tick();
  const lookback = loadEnv().indexerLookbackBlocks;
  console.log("[indexer] scanning last", lookback.toString(), "blocks every", POLL_MS, "ms");
}

export function stopIndexer(): void {
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

async function writeHeartbeat(block: bigint): Promise<void> {
  await Meta.findOneAndUpdate(
    { key: "indexer:heartbeat" },
    { value: { at: new Date().toISOString(), block: Number(block) }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}

async function tick(): Promise<void> {
  try {
    const env = loadEnv();
    if (!env.arc.refundProtocolAddress && !env.arc.caseRegistryAddress) return;

    const client = await import("./chain/client.ts");
    const publicClient = client.getPublicClient();
    const latestBlock = await publicClient.getBlockNumber().catch(() => 0n);

    // Rolling window: scan the last LOOKBACK_BLOCKS for any contract activity.
    // No persistent cursor — the window is the safety net. The {txHash, logIndex}
    // unique index dedupes events seen in overlapping windows.
    const lookback = env.indexerLookbackBlocks;
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0n;

    const logs = await fetchChainLogs(fromBlock);

    for (const log of logs) {
      const decoded = decodeLog(log as Log);
      if (!decoded) continue;

      // Idempotent insert — skip if already seen.
      const txHash = log.transactionHash ?? "0x";
      const logIndex = Number(log.logIndex ?? 0);
      const blockNum = Number(log.blockNumber ?? 0);
      try {
        await ChainEvent.create({
          txHash,
          logIndex,
          block: blockNum,
          contract: String(log.address),
          eventName: decoded.eventName,
          decodedArgs: decoded.args,
          seenAt: new Date().toISOString(),
        });
      } catch {
        continue; // E11000 duplicate — already seen in an earlier window
      }

      await dispatch(decoded.eventName, decoded.args, txHash, log.blockNumber ?? null);
    }

    await writeHeartbeat(latestBlock);
  } catch (e) {
    console.error("[indexer] tick error:", e instanceof Error ? e.message : e);
    // next tick re-scans the same rolling window — nothing to recover
  }
}

/** Dispatch a decoded chain event to the appropriate backend service call. */
export async function dispatch(
  eventName: string,
  args: Record<string, unknown>,
  txHash: string,
  blockNumber: bigint | null,
): Promise<void> {
  switch (eventName) {
    case "PaymentCreated": {
      const paymentID = String(args.paymentID ?? args[0] ?? "");
      const to = String(args.to ?? args[1] ?? "");
      const amountBase = BigInt((args.amount ?? args[2] ?? 0) as bigint | number | string);
      const amount = fromBaseUnitsDisplay(amountBase); // base units → "33.34"
      const refundTo = String(args.refundTo ?? args[4] ?? "");
      // The real on-chain release timestamp (block.timestamp + lockupSeconds[recipient]).
      // Snapshotted in the contract at pay() time — the source of truth for when the
      // recipient may withdraw. Carried through to lockupEnd so the UI never shows a
      // bogus 30-day window for an instant-settlement (lockup=0) recipient.
      const releaseTimestamp = (args.releaseTimestamp ?? args[3] ?? null) as bigint | null;
      // The REAL block timestamp — not wall-clock time. This is what the chain
      // recorded, so it must be what the receipt shows as paidAt. Fetch the
      // block; fall back to now only if the RPC fails (rare, and better than
      // blocking the indexer). Also fetch the tx sender (the payer) so
      // recordDetectedPayment can resolve their platformKey for scoping.
      let blockTimestamp = new Date().toISOString();
      let txSender = "";
      if (blockNumber !== null) {
        try {
          const client = (await import("./chain/client.ts")).getPublicClient();
          const block = await client.getBlock({ blockNumber });
          blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
          // Get the sender from the transaction (who called pay()).
          const tx = await client.getTransaction({ hash: txHash as `0x${string}` }).catch(() => null);
          if (tx?.from) txSender = tx.from;
        } catch {
          // RPC failure — keep the wall-clock fallback (PRD §13.4: never crash).
        }
      }
      await recordDetectedPayment({
        paymentId: paymentID,
        chain: loadEnv().arc.chainName,
        contractAddress: loadEnv().arc.refundProtocolAddress ?? "",
        txHash,
        to,
        amount,
        refundTo,
        blockTimestamp,
        txSender,
        releaseTimestamp: releaseTimestamp !== null ? String(releaseTimestamp) : undefined,
      }).catch(() => {});
      break;
    }
    case "Refund": {
      const paymentID = String(args.paymentID ?? args[0] ?? "");
      // debtRecorded = the recipient now has debt > 0 (scenario B)
      const payout = await Payout.findOne({ paymentId: paymentID }).lean();
      const recipientAddr = payout?.recipientWallet;
      let debtRecorded = false;
      if (recipientAddr) {
        const debt = await readDebt(recipientAddr as `0x${string}`);
        debtRecorded = debt !== null && debt > 0n;
      }
      await confirmRefundExecuted(paymentID, txHash, debtRecorded).catch(() => {});
      break;
    }
    case "Withdrawal": {
      const to = String(args.to ?? args[0] ?? "");
      // resolve which payments were withdrawn — find the recipient's escrowed payouts
      const payouts = await Payout.find({ recipientWallet: to, status: "WITHDRAWABLE" }).lean();
      for (const p of payouts) {
        await confirmWithdrawn(p.paymentId, txHash).catch(() => {});
      }
      break;
    }
    // Registry events (ReceiptAnchored, CaseOpened, DecisionAnchored) are record-only —
    // the backend already knows its anchors; the indexer just observes them.
    default:
      break;
  }
}

/** Compute whether the indexer heartbeat is stale (used by /status). */
export async function isIndexerStale(): Promise<boolean> {
  const meta = await Meta.findOne({ key: "indexer:heartbeat" });
  if (!meta) return true;
  const at = (meta.value as { at?: string }).at;
  if (!at) return true;
  return Date.now() - new Date(at).getTime() > STALE_THRESHOLD_MS;
}
