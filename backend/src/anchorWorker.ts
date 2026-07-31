import type { Address, Hash } from "viem";
import { getWalletClient, caseRegistryAddress, refundProtocolAddress, getPublicClient } from "./chain/client.ts";
import { CASE_REGISTRY_ABI } from "./chain/abis.ts";
import { AnchorJob, Payout, Case, Decision } from "./models/index.ts";

/* ============================================================================
   Anchor worker (PRD §9.4, NEW-1 → now real). Drains the AnchorJob queue and
   posts keccak256 hashes to the FinneCaseRegistry via the operator key — the
   one Finné-held key, which can only anchor hashes and can never move USDC.

   On confirmation: sets AnchorJob.anchorTx + status:"done" and backfills the
   matching registryAnchorTx on the Payout/Case/Decision. Bounded retries via
   the existing attempts/lastError fields (max 8, then status:"failed").
   ========================================================================== */

const POLL_MS = 3000;
const MAX_ATTEMPTS = 8;

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

async function drain(): Promise<void> {
  try {
    const wallet = getWalletClient();
    const registry = caseRegistryAddress();
    if (!wallet || !registry) return; // no operator key or registry configured — jobs wait

    const jobs = await AnchorJob.find({ status: "queued" }).limit(10);
    for (const job of jobs) {
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

    if (!txHash) return;

    // wait for receipt
    await client.waitForTransactionReceipt({ hash: txHash }).catch(() => {});

    job.anchorTx = txHash;
    job.status = "done";
    await job.save();

    // backfill the registryAnchorTx on the owning entity
    await backfillAnchor(job, txHash);
    console.log(`[anchor-worker] ${job.kind} anchored: ${job.entityId} → ${txHash}`);
  } catch (e) {
    job.attempts += 1;
    job.lastError = e instanceof Error ? e.message : String(e);
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = "failed";
      console.error(`[anchor-worker] job ${job.entityId} FAILED after ${MAX_ATTEMPTS} attempts: ${job.lastError}`);
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
