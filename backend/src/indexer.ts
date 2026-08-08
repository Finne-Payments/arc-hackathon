import type { Log } from "viem";
import { decodeAbiParameters, parseAbiParameter } from "viem";
import { fetchChainLogs, decodeLog, readDebt } from "./chain/reads.ts";
import { ChainEvent, Meta, Payout, Case, Decision } from "./models/index.ts";
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
    // If we can't reach the RPC for the current block, SKIP this tick entirely
    // rather than falling back to 0n. The old .catch(() => 0n) made fromBlock = 0,
    // so fetchChainLogs(0) tried to scan from genesis → the Arc RPC rejects that
    // as "exceeds defined limit" → tick threw every cycle → the heartbeat never
    // advanced → /status reported stale:true forever and no payout was ever
    // detected. Bailing here keeps the last heartbeat's block and retries next tick.
    const latestBlock = await publicClient.getBlockNumber().catch(() => null);
    if (latestBlock === null) return;

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
      // The Withdrawal event only carries (to, amount) — not WHICH payments
      // were withdrawn. The contract's withdraw(uint256[]) takes an array of
      // payment IDs; those IDs are in the transaction calldata. Decode them
      // so we mark ONLY the actually-withdrawn payments, not every open
      // payout for the recipient (which was marking all of them at once).
      let withdrawnIds: string[] = [];
      try {
        const client = (await import("./chain/client.ts")).getPublicClient();
        const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
        // withdraw(uint256[]) selector = first 4 bytes. The rest is the
        // ABI-encoded uint256[] array.
        if (tx.input && tx.input.length > 10) {
          const calldata = tx.input.slice(10); // strip the 4-byte selector
          const decoded = decodeAbiParameters(
            [parseAbiParameter("uint256[]")],
            `0x${calldata}` as `0x${string}`,
          );
          const ids = decoded[0] as bigint[];
          withdrawnIds = ids.map((id) => String(id));
        }
      } catch {
        // Calldata decode failed — fall back to the old behavior below.
      }

      if (withdrawnIds.length > 0) {
        // We know the exact payment IDs from the calldata — mark only those.
        for (const id of withdrawnIds) {
          await confirmWithdrawn(id, txHash).catch(() => {});
        }
      } else {
        // Fallback: couldn't decode calldata. Use the recipient address +
        // the withdrawn amount to find the best match (avoid marking all).
        const to = String(args.to ?? args[0] ?? "");
        const amountBase = BigInt((args.amount ?? args[1] ?? 0) as bigint | number | string);
        const payouts = await Payout.find({
          recipientWallet: to,
          status: { $nin: ["WITHDRAWN", "REFUNDED", "DEBT_SETTLED"] },
        }).lean();
        // Mark payouts whose individual amount matches, preferring exact match.
        for (const p of payouts) {
          const pAmountBase = BigInt(Math.round(Number(p.amount) * 1_000_000));
          if (pAmountBase === amountBase) {
            await confirmWithdrawn(p.paymentId, txHash).catch(() => {});
          }
        }
      }
      break;
    }
    // ── FinneCaseRegistry reconciliation ────────────────────────────────────
    // The anchor worker is the PRIMARY writer of registryAnchorTx, but if it
    // dead-letters (or the operator key is briefly unset), the on-chain event
    // still fires. These handlers read the event back and set registryAnchorTx
    // idempotently — a safety net so the UI's "anchored on chain" chip fills in
    // even when the worker didn't record it. Case-scoped events match by
    // onChainCaseId (keccak256 of caseNumber), which the worker stamps on the
    // Case doc; if that's missing we set it defensively. All handlers swallow
    // (PRD §13.4 — never crash the indexer); the ChainEvent row is already saved.
    case "CaseOpened": {
      const onChainCaseId = String(args.caseId ?? args[0] ?? "");
      if (!onChainCaseId) break;
      await Case.updateOne(
        { onChainCaseId, registryAnchorTx: null },
        { $set: { registryAnchorTx: txHash } },
      ).catch(() => {});
      // Defensive: if the worker hasn't stamped onChainCaseId yet (anchor job
      // still queued), stamp it now so subsequent events for this case resolve.
      await Case.updateOne(
        { onChainCaseId: null, registryAnchorTx: txHash },
        { $set: { onChainCaseId } },
      ).catch(() => {});
      break;
    }
    case "HumanDecisionRecorded": {
      const onChainCaseId = String(args.caseId ?? args[0] ?? "");
      if (!onChainCaseId) break;
      // Mark the case's anchor first, then its active decision (the indexer can't
      // tell which Decision doc from the event alone, so we set the case's anchor
      // and the decision that still lacks one for this case).
      await Case.updateOne(
        { onChainCaseId, registryAnchorTx: null },
        { $set: { registryAnchorTx: txHash } },
      ).catch(() => {});
      const caseDoc = await Case.findOne({ onChainCaseId }).lean().catch(() => null);
      if (caseDoc) {
        await Decision.updateOne(
          { caseRef: caseDoc.caseNumber, registryAnchorTx: null },
          { $set: { registryAnchorTx: txHash } },
        ).catch(() => {});
      }
      break;
    }
    case "ReceiptRegistered": {
      // The receipt anchor already works (paymentId is numeric), so the worker is
      // the reliable writer here. Reconcile only as a fallback: match by the tx
      // hash against any payout whose anchor is still null AND whose anchor job
      // pointed at this payment — there's no on-chain-id field on Payout, so we
      // match by txHash which the worker recorded on the AnchorJob, not the doc.
      // Cheapest correct action: no-op (ChainEvent is already persisted); the
      // worker backfills this reliably. Kept as a documented case for clarity.
      break;
    }
    // CaseClosed / CorrectionVerified / ResponseSubmitted / AnalysisAnchored /
    // CaseUnderReview / CorrectionInstructionRecorded: no Mongo field today for
    // on-chain close/outcome status, and these steps are off-chain by design
    // (critical-only scope). Record-only via the ChainEvent insert above.
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
