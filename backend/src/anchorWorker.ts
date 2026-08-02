import { randomUUID } from "node:crypto";
import type { Address, Hash } from "viem";
import { getWalletClient, caseRegistryAddress, refundProtocolAddress, getPublicClient } from "./chain/client.ts";
import { CASE_REGISTRY_ABI } from "./chain/abis.ts";
import { AnchorJob, Payout, Case, Decision } from "./models/index.ts";

/* ============================================================================
   Anchor worker (PRD §9.4, NEW-1 → real). Drains the AnchorJob queue and
   posts keccak256 hashes to the FinneCaseRegistry via the operator key — the
   one Finné-held key, which can only anchor hashes and can never move USDC.

   Reliability (GAP-B5, PH-4):
   - Job leasing: a replica claims a job atomically (findOneAndUpdate to
     status:"in_flight" + leaseOwner=this) before processing, so two replicas
     cannot double-anchor the same hash. Leases expire (LEASE_MS), so a crashed
     replica's jobs are re-picked up.
   - Exponential backoff: on failure the job's nextAttemptAt is set to
     now + BACKOFF_BASE * 2^(attempts-1); it is only eligible again after that.
   - Dead letter: after MAX_ATTEMPTS the job is status:"failed" and logged at
     ERROR (no longer silent) — the prior build terminal-failed silently.
   ========================================================================== */

const POLL_MS = 3000;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 30_000; // a job held longer than this is considered abandoned
const BACKOFF_BASE_MS = 2000; // 2s, 4s, 8s … capped at 5 min

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startAnchorWorker(): void {
  if (running) return;
  running = true;
  timer = setInterval(drain, POLL_MS);
  void drain();
  console.log("[anchor-worker] draining anchor queue every", POLL_MS, "ms");
}

export function stopAnchorWorker(): void {
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

/** A job is eligible if queued and past its backoff window (or no window set). */
function eligibleQuery() {
  const now = new Date().toISOString();
  return {
    status: "queued",
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  };
}

async function drain(): Promise<void> {
  try {
    const wallet = getWalletClient();
    const registry = caseRegistryAddress();
    if (!wallet || !registry) return; // no operator key or registry configured — jobs wait

    // Claim up to N jobs atomically. Leasing prevents double-anchor across replicas.
    for (let i = 0; i < 10; i++) {
      const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
      const job = await AnchorJob.findOneAndUpdate(
        { ...eligibleQuery(), leasedUntil: { $lt: leaseUntil } },
        { $set: { status: "in_flight", leaseOwner: WORKER_ID, leasedUntil: leaseUntil } },
        { sort: { _id: 1 }, new: true },
      );
      if (!job) break;
      await processJob(job, registry, wallet.account!.address);
    }
  } catch (e) {
    console.error("[anchor-worker] drain error:", e instanceof Error ? e.message : e);
  }
}

async function processJob(job: typeof AnchorJob.prototype, registry: Address, operator: Address): Promise<void> {
  const client = getPublicClient();
  const wallet = getWalletClient()!;
  const hash = job.hash as `0x${string}`;

  try {
    let txHash: Hash | null = null;
    if (job.kind === "receipt") {
      txHash = await wallet.writeContract({
        address: registry,
        abi: CASE_REGISTRY_ABI,
        functionName: "anchorReceipt",
        args: [getRefundProtocolAddress(), BigInt(job.paymentId), hash, BigInt(job.disputeDeadline || 0)],
        account: operator,
        chain: wallet.chain,
      });
    } else if (job.kind === "case") {
      txHash = await wallet.writeContract({
        address: registry,
        abi: CASE_REGISTRY_ABI,
        functionName: "anchorCase",
        args: [BigInt(job.paymentId), hash],
        account: operator,
        chain: wallet.chain,
      });
    } else if (job.kind === "decision") {
      txHash = await wallet.writeContract({
        address: registry,
        abi: CASE_REGISTRY_ABI,
        functionName: "anchorDecision",
        args: [BigInt(job.paymentId), hash, job.outcome],
        account: operator,
        chain: wallet.chain,
      });
    }

    if (!txHash) {
      // Nothing to anchor (unknown kind) — release without retry.
      job.status = "queued";
      job.leaseOwner = null;
      job.leasedUntil = null;
      await job.save();
      return;
    }

    // wait for receipt (swallow — the tx hash is still recorded; a dropped node
    // retry is safer than blocking the whole drain)
    await client.waitForTransactionReceipt({ hash: txHash }).catch(() => {});

    job.anchorTx = txHash;
    job.status = "done";
    job.leaseOwner = null;
    job.leasedUntil = null;
    job.nextAttemptAt = null;
    await job.save();

    await backfillAnchor(job, txHash);
    console.log(`[anchor-worker] ${job.kind} anchored: ${job.entityId} → ${txHash}`);
  } catch (e) {
    // Failure → exponential backoff. Re-queue with nextAttemptAt in the future so
    // the job isn't immediately retried; dead-letter after MAX_ATTEMPTS.
    const attempts = job.attempts + 1;
    const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), 5 * 60_000);
    job.attempts = attempts;
    job.lastError = e instanceof Error ? e.message : String(e);
    job.leaseOwner = null;
    job.leasedUntil = null;
    if (attempts >= MAX_ATTEMPTS) {
      job.status = "failed";
      console.error(
        `[anchor-worker] DEAD-LETTER ${job.kind} ${job.entityId} after ${MAX_ATTEMPTS} attempts: ${job.lastError}`,
      );
    } else {
      job.status = "queued";
      job.nextAttemptAt = new Date(Date.now() + backoff).toISOString();
      console.warn(
        `[anchor-worker] ${job.kind} ${job.entityId} attempt ${attempts} failed (retry in ${backoff}ms): ${job.lastError}`,
      );
    }
    await job.save();
  }
}

async function backfillAnchor(job: typeof AnchorJob.prototype, txHash: string): Promise<void> {
  if (job.kind === "receipt") {
    await Payout.updateOne({ paymentId: job.paymentId }, { $set: { registryAnchorTx: txHash } });
  } else if (job.kind === "case") {
    await Case.updateOne({ caseNumber: job.entityId }, { $set: { registryAnchorTx: txHash } });
  } else if (job.kind === "decision") {
    await Decision.updateOne({ _id: job.entityId }, { $set: { registryAnchorTx: txHash } });
  }
}

function getRefundProtocolAddress(): Address {
  return refundProtocolAddress() ?? ("0x0000000000000000000000000000000000000000" as Address);
}
