/* ============================================================================
   Local job queue — in-memory implementation for dev/test (BE-07, AWS-02).
   When SQS_QUEUE_URL is configured, a real SQS adapter replaces this.
   Supports leasing, idempotency, and dead-lettering with the same semantics.
   ========================================================================== */

import { generateId } from "@finne/domain";
import type { JobQueue, QueueMessage } from "./types.ts";

interface QueuedJob {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  status: "queued" | "in_flight" | "done" | "failed";
  leaseOwner: string | null;
  leasedUntil: number | null;
  attempts: number;
  enqueuedAt: number;
  availableAt: number;
  lastError: string | null;
}

const VISIBILITY_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 8;

/**
 * In-memory job queue. Used when SQS_QUEUE_URL is not configured.
 * In staging/submission, the SQS adapter replaces this with the same interface.
 */
export class LocalJobQueue implements JobQueue {
  private jobs = new Map<string, QueuedJob>();
  private idemIndex = new Map<string, string>(); // idempotencyKey → jobId
  private dlq: QueuedJob[] = [];

  async enqueue(type: string, payload: Record<string, unknown>, opts?: { idempotencyKey?: string; delaySeconds?: number }): Promise<string> {
    // Idempotency: if this key was already enqueued, return the existing jobId
    if (opts?.idempotencyKey) {
      const existing = this.idemIndex.get(opts.idempotencyKey);
      if (existing) return existing;
    }

    const jobId = generateId("job");
    const now = Date.now();
    const job: QueuedJob = {
      jobId,
      type,
      payload,
      idempotencyKey: opts?.idempotencyKey,
      status: "queued",
      leaseOwner: null,
      leasedUntil: null,
      attempts: 0,
      enqueuedAt: now,
      availableAt: now + (opts?.delaySeconds ?? 0) * 1000,
      lastError: null,
    };
    this.jobs.set(jobId, job);
    if (opts?.idempotencyKey) this.idemIndex.set(opts.idempotencyKey, jobId);
    return jobId;
  }

  async dequeue(max: number): Promise<QueueMessage[]> {
    const now = Date.now();
    const available: QueuedJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === "queued" && job.availableAt <= now) {
        available.push(job);
      }
      // Reclaim expired leases
      if (job.status === "in_flight" && job.leasedUntil !== null && job.leasedUntil < now) {
        available.push(job);
      }
      if (available.length >= max) break;
    }
    available.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

    const claimed: QueueMessage[] = [];
    for (const job of available.slice(0, max)) {
      job.status = "in_flight";
      job.leaseOwner = generateId("worker").slice(0, 12);
      job.leasedUntil = now + VISIBILITY_TIMEOUT_MS;
      job.attempts++;
      claimed.push({ jobId: job.jobId, type: job.type, payload: job.payload });
    }
    return claimed;
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "done";
      // Keep completed jobs for a short window for status polling, then they're GC'd
    }
  }

  async deadLetter(jobId: string, reason: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = "failed";
      job.lastError = reason;
      this.dlq.push({ ...job });
      this.jobs.delete(jobId);
    } else {
      // Re-queue with exponential backoff
      job.status = "queued";
      job.leaseOwner = null;
      job.leasedUntil = null;
      job.lastError = reason;
      job.availableAt = Date.now() + Math.min(1000 * 2 ** job.attempts, 300_000);
    }
  }

  /** Get job status (for GET /v1/jobs/:jobId). */
  getStatus(jobId: string): { jobId: string; status: string; error: string | null } | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      const dlqJob = this.dlq.find((j) => j.jobId === jobId);
      if (dlqJob) return { jobId, status: "failed", error: dlqJob.lastError };
      return null;
    }
    return { jobId, status: job.status, error: job.lastError };
  }
}

/** Singleton local queue. */
let _queue: LocalJobQueue | null = null;
export function getJobQueue(): JobQueue {
  if (!_queue) _queue = new LocalJobQueue();
  return _queue;
}
