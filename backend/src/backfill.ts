/* ============================================================================
   backfill — one-shot reconcile of the DB with the on-chain truth.

   Replaces fabricated/Anvil-seeded payouts with the real PaymentCreated /
   Refund / Withdrawal events read from the chain, then advances the indexer
   cursor so live indexing continues from head. Idempotent: re-running re-reads
   the same events and the services layer no-ops on already-recorded paymentIds.

   Run:
     INDEXER_START_BLOCK=<contract deploy block> \
     node --env-file=.env --import tsx/esm src/backfill.ts
   ========================================================================== */

import type { Log } from "viem";
import { connectDb, disconnectDb } from "./db.ts";
import { loadEnv } from "./env.ts";
import { fetchChainLogsRange } from "./chain/reads.ts";
import { decodeLog } from "./chain/reads.ts";
import { dispatch } from "./indexer.ts";
import { ChainEvent, Meta, Payout, Case, Decision, Evidence, Response, AnchorJob, Brief } from "./models/index.ts";

/** Wipe the fabricated/seed data so the real on-chain records are clean.
 *  Preserves the indexer cursor + heartbeat (Meta) — those are bookkeeping. */
async function wipeFabricatedData(): Promise<void> {
  const collections = [Payout, Case, Decision, Evidence, Response, AnchorJob, Brief, ChainEvent] as Array<
    { deleteMany: (f?: unknown) => Promise<{ deletedCount: number }>; collection: { name: string } }
  >;
  for (const c of collections) {
    const r = await c.deleteMany({});
    console.log(`  wiped ${r.deletedCount} from ${c.collection.name}`);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.arc.refundProtocolAddress && !env.arc.caseRegistryAddress) {
    console.error("No contract addresses configured — nothing to backfill.");
    process.exit(1);
  }

  await connectDb();
  console.log("[backfill] connected to MongoDB");

  const startBlock = env.indexerStartBlock;
  console.log(`[backfill] reading chain events from block ${startBlock} → head`);

  console.log("[backfill] wiping fabricated/seed data (preserving indexer cursor)…");
  await wipeFabricatedData();

  // Read the full history in chunks (the RPC caps log queries at 100k blocks).
  const logs = await fetchChainLogsRange(startBlock, "latest");
  console.log(`[backfill] ${logs.length} chain logs read`);

  let processed = 0;
  for (const log of logs) {
    const decoded = decodeLog(log as Log);
    if (!decoded) continue;
    const txHash = log.transactionHash ?? "0x";
    // record the ChainEvent idempotently so the UI's event strip shows them
    try {
      await ChainEvent.create({
        txHash,
        logIndex: Number(log.logIndex ?? 0),
        block: Number(log.blockNumber ?? 0),
        contract: String(log.address),
        eventName: decoded.eventName,
        decodedArgs: decoded.args,
        seenAt: new Date().toISOString(),
      });
    } catch {
      // duplicate — already in the event log
    }
    await dispatch(decoded.eventName, decoded.args, txHash);
    processed++;
  }
  console.log(`[backfill] dispatched ${processed} events`);

  // Advance the cursor to head so the live indexer picks up only new events.
  const client = await import("./chain/client.ts");
  const head = await client.getPublicClient().getBlockNumber().catch(() => 0n);
  await Meta.findOneAndUpdate(
    { key: "indexer:cursor" },
    { value: { block: Number(head) }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
  console.log(`[backfill] cursor advanced to head (block ${head})`);

  // Report what's now in the DB.
  const payouts = await Payout.find({}).lean();
  console.log(`[backfill] done. ${payouts.length} payout(s) now in DB:`);
  for (const p of payouts) {
    console.log(
      `   paymentId=${p.paymentId}  recipient=${p.recipientWallet}  refundTo=${p.refundTo}  tx=${(p.txHash ?? "").slice(0, 14)}…  status=${p.status}`,
    );
  }

  await disconnectDb();
}

main().catch((e) => {
  console.error("[backfill] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
