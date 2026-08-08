import { randomUUID } from "node:crypto";
import type { Address, Hash, LocalAccount } from "viem";
import { getWalletClient, caseRegistryAddress, getPublicClient } from "./chain/client.ts";
import { CASE_REGISTRY_ABI } from "./chain/abis.ts";
import { AnchorJob, Payout, Case, Decision, Response as ResponseModel } from "./models/index.ts";

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

/**
 * Lease filter: a job is claimable if it has never been leased (leasedUntil is
 * null) OR its lease has expired (leasedUntil < now). MongoDB's `$lt` with a
 * string operand does NOT match `null`, so without the explicit null branch a
 * freshly-enqueued job (leasedUntil defaults to null) is never picked up.
 */
function leaseQuery() {
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  return { $or: [{ leasedUntil: null }, { leasedUntil: { $lt: leaseUntil } }] };
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
        { $and: [eligibleQuery(), leaseQuery()] },
        { $set: { status: "in_flight", leaseOwner: WORKER_ID, leasedUntil: leaseUntil } },
        { sort: { _id: 1 }, new: true },
      );
      if (!job) break;
      // wallet.account is a LocalAccount (built from privateKeyToAccount in
      // getWalletClient); the union type is narrowed here so processJob gets a
      // local-signing account and viem broadcasts via eth_sendRawTransaction.
      await processJob(job, registry, wallet.account as unknown as LocalAccount);
    }
  } catch (e) {
    console.error("[anchor-worker] drain error:", e instanceof Error ? e.message : e);
  }
}

async function processJob(job: typeof AnchorJob.prototype, registry: Address, operator: LocalAccount): Promise<void> {
  const client = getPublicClient();
  const wallet = getWalletClient()!;
  const hash = (job.hash ?? "0x0") as `0x${string}`;
  const args = job.args ?? {};

  // Pass the LocalAccount object (not a bare address) so viem signs the
  // transaction locally and broadcasts it via eth_sendRawTransaction. Arc's
  // public RPC rejects eth_sendTransaction (JSON-RPC accounts), which is what
  // viem falls back to when given a raw address — producing "Invalid
  // parameters" on every anchor attempt.
  try {
    let txHash: Hash | null = null;

    // Each kind maps 1:1 to a FinneCaseRegistry lifecycle function (CON-01→04).
    // The operator wallet holds PLATFORM_ROLE + REVIEWER_ROLE + AGENT_ROLE, so
    // it can sign every function the lifecycle needs.
    switch (job.kind) {
      case "receipt": {
        // registerReceipt(uint256 paymentId, bytes32 receiptHash, address payer,
        //                  address recipient, uint128 amountMicroUsdc, uint64 paidAt)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "registerReceipt",
          args: [
            BigInt(job.paymentId),
            hash,
            args.payer as Address,
            args.recipient as Address,
            BigInt(args.amountMicroUsdc ?? 0),
            BigInt(args.paidAt ?? 0),
          ],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "case": {
        // openCase(uint256 caseId, uint256 paymentId, bytes32 claimHash,
        //          uint128 challengedAmountMicroUsdc, uint64 responseDueAt)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "openCase",
          args: [
            BigInt(job.entityId),
            BigInt(args.paymentId ?? job.paymentId),
            hash,
            BigInt(args.challengedAmountMicroUsdc ?? 0),
            BigInt(args.responseDueAt ?? 0),
          ],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "response": {
        // submitResponse(uint256 caseId, bytes32 responseHash, address submittedBy)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "submitResponse",
          args: [BigInt(job.entityId), hash, (args.submittedBy ?? operator.address) as Address],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "under_review": {
        // markUnderReview(uint256 caseId) — REVIEWER_ROLE; OPEN|RESPONDED → UNDER_REVIEW.
        // MUST be processed before any recordDecision job for this caseId, otherwise
        // the contract reverts (recordDecision requires status UNDER_REVIEW). The
        // worker drains jobs in _id order, so enqueue this before the decision.
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "markUnderReview",
          args: [BigInt(job.entityId)],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "analysis": {
        // anchorAnalysis(uint256 caseId, bytes32 analysisHash, uint32 version)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "anchorAnalysis",
          args: [BigInt(job.entityId), hash, args.version ?? 1],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "decision": {
        // recordDecision(uint256 caseId, bytes32 decisionHash, uint8 outcome,
        //                 uint128 correctionAmountMicroUsdc)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "recordDecision",
          args: [
            BigInt(job.entityId),
            hash,
            args.outcome ?? job.outcome ?? 0,
            BigInt(args.correctionAmountMicroUsdc ?? 0),
          ],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "correction_outstanding": {
        // markCorrectionOutstanding(uint256 caseId, bytes32 correctionHash) — requires
        // the case to be DECIDED with a non-zero correction amount first.
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "markCorrectionOutstanding",
          args: [BigInt(job.entityId), hash],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "correction": {
        // recordCorrection(uint256 caseId, bytes32 correctionTxHash, bytes32 correctionHash)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "recordCorrection",
          args: [
            BigInt(job.entityId),
            (args.correctionTxHash ?? hash) as `0x${string}`,
            hash,
          ],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      case "close_no_correction": {
        // closeNoCorrection(uint256 caseId)
        txHash = await wallet.writeContract({
          address: registry,
          abi: CASE_REGISTRY_ABI,
          functionName: "closeNoCorrection",
          args: [BigInt(job.entityId)],
          account: operator,
          chain: wallet.chain,
        });
        break;
      }
      default: {
        // Unknown kind — release without retry so it doesn't wedge the queue.
        job.status = "queued";
        job.leaseOwner = null;
        job.leasedUntil = null;
        await job.save();
        console.warn(`[anchor-worker] unknown job kind "${job.kind}" for ${job.entityId} — released`);
        return;
      }
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
    // paymentId is the raw numeric string (the job's paymentId field, NOT entityId,
    // which is now the keccak uint256 form).
    await Payout.updateOne({ paymentId: job.paymentId }, { $set: { registryAnchorTx: txHash } });
  } else if (job.kind === "case") {
    // entityId is the keccak-derived on-chain caseId; backfill Mongo by caseNumber
    // (passed in args) and persist onChainCaseId so the indexer can reconcile
    // later CaseOpened/DecisionRecorded events by the same key.
    const caseNumber = job.args.caseNumber;
    if (caseNumber) {
      await Case.updateOne(
        { caseNumber },
        { $set: { registryAnchorTx: txHash, onChainCaseId: job.entityId } },
      );
    }
  } else if (job.kind === "decision") {
    // entityId is the case's on-chain caseId; the Mongo Decision is keyed by its
    // own _id (decisionId in args), NOT the caseId.
    const decisionId = job.args.decisionId;
    if (decisionId) {
      await Decision.updateOne({ _id: decisionId }, { $set: { registryAnchorTx: txHash } });
    }
  } else if (job.kind === "response") {
    // Match the response we just created by caseRef + responseHash. submittedAt
    // would be more precise but isn't on the job; caseRef+hash is unique enough.
    const caseNumber = job.args.caseNumber;
    if (caseNumber) {
      await ResponseModel.updateOne(
        { caseRef: caseNumber, responseHash: job.hash },
        { $set: { registryAnchorTx: txHash } },
      );
    }
  } else if (
    job.kind === "under_review" ||
    job.kind === "correction_outstanding" ||
    job.kind === "correction" ||
    job.kind === "close_no_correction"
  ) {
    // No dedicated Mongo field for these intermediate states; stamp the case's
    // registryAnchorTx to the latest anchor so the UI reflects ongoing on-chain
    // activity. Match by caseNumber (the keccak entityId isn't stored until the
    // case-open anchor lands — backfillAnchor for "case" sets onChainCaseId).
    const caseNumber = job.args.caseNumber;
    if (caseNumber) {
      await Case.updateOne({ caseNumber }, { $set: { registryAnchorTx: txHash } });
    }
  }
}
