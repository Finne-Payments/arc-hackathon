import type { Log } from "viem";
import { fetchChainLogs, decodeLog, readDebt } from "./chain/reads.ts";
import { ChainEvent, Meta, Payout } from "./models/index.ts";
import { confirmRefundExecuted, confirmWithdrawn, recordDetectedPayment } from "./services.ts";
import { loadEnv } from "./env.ts";
import { fromBaseUnitsDisplay } from "./usdc.ts";

/* ============================================================================
   Indexer (PRD §12, C3). A 2-second poll loop that watches chain events and
   drives the backend state machines — the chain is the source of truth.

   Pipeline per tick:
     getLogs(fromCursor) → sort → dedupe via ChainEvent unique index →
     dispatch by eventName → advance cursor → write heartbeat

   Idempotent: the {txHash, logIndex} unique index means replays create no
   duplicates (PRD §12.2). Backend hook 409/404 are expected chatter.
   ========================================================================== */

const POLL_MS = 2000;
const STALE_THRESHOLD_MS = 15_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startIndexer(): void {
  if (running) return;
  running = true;
  timer = setInterval(tick, POLL_MS);
  // fire one immediately so we don't wait 2s on boot
  void tick();
  console.log("[indexer] watching chain events every", POLL_MS, "ms");
}

export function stopIndexer(): void {
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

async function getCursor(): Promise<bigint> {
  const meta = await Meta.findOne({ key: "indexer:cursor" });
  if (meta && meta.value?.block) return BigInt(meta.value.block as number);
  return 0n;
}

async function setCursor(block: bigint): Promise<void> {
  await Meta.findOneAndUpdate(
    { key: "indexer:cursor" },
    { value: { block: Number(block) }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
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
    const fromBlock = await getCursor();
    const latestBlock = await publicClient.getBlockNumber().catch(() => fromBlock);
    if (latestBlock <= fromBlock) {
      await writeHeartbeat(latestBlock);
      return;
    }

    const logs = await fetchChainLogs(fromBlock + 1n);

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
        continue; // E11000 duplicate — already dispatched
      }

      await dispatch(decoded.eventName, decoded.args, txHash);
    }

    await setCursor(latestBlock);
    await writeHeartbeat(latestBlock);
  } catch (e) {
    console.error("[indexer] tick error:", e instanceof Error ? e.message : e);
    // backoff is implicit — next tick retries; cursor untouched
  }
}

/** Dispatch a decoded chain event to the appropriate backend service call. */
async function dispatch(eventName: string, args: Record<string, unknown>, txHash: string): Promise<void> {
  switch (eventName) {
    case "PaymentCreated": {
      const paymentID = String(args.paymentID ?? args[0] ?? "");
      const to = String(args.to ?? args[1] ?? "");
      const amountBase = BigInt((args.amount ?? args[2] ?? 0) as bigint | number | string);
      const amount = fromBaseUnitsDisplay(amountBase); // base units → "33.34"
      const refundTo = String(args.refundTo ?? args[4] ?? "");
      await recordDetectedPayment({
        paymentId: paymentID,
        chain: loadEnv().arc.chainName,
        contractAddress: loadEnv().arc.refundProtocolAddress ?? "",
        txHash,
        to,
        amount,
        refundTo,
        blockTimestamp: new Date().toISOString(),
        txSender: "",
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
