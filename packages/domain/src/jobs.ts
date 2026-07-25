import { z } from "zod";
import { JOB_STATUSES, JOB_TYPES, type JobStatus } from "@agentdesk/shared";

export const createJobSchema = z.object({
  type: z.enum(JOB_TYPES),
  status: z.enum(JOB_STATUSES).default("QUEUED"),
  attempts: z.coerce.number().int().min(0).default(0),
  maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
  payload: z.record(z.unknown()).default({}),
  relatedTicketId: z.string().optional().nullable(),
  relatedIncidentId: z.string().optional().nullable()
});

export function canRetryJob(status: JobStatus, attempts: number, maxAttempts: number): boolean {
  return ["FAILED", "RETRYING"].includes(status) && attempts < maxAttempts;
}

export function shouldDeadLetterJob(status: JobStatus, attempts: number, maxAttempts: number): boolean {
  return status === "FAILED" && attempts >= maxAttempts;
}

/* -------------------------------------------------------------------------
 * Scheduling and backoff
 *
 * A failed job used to sit in FAILED for ever until a human clicked Retry,
 * and that retry re-queued it for immediate pickup. So the only available
 * recovery strategy was "try again right now", repeatedly, against a
 * dependency that had just failed.
 *
 * The FAILED_JOB_INVESTIGATION agent has been recommending "retry with
 * exponential backoff and jitter" since it was written. This is the
 * capability that recommendation assumed existed.
 * ---------------------------------------------------------------------- */

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;

/**
 * Small deterministic hash of the job id, 0..999.
 *
 * Used for jitter instead of Math.random(). Two jobs failing in the same
 * tick must not retry in the same tick, or a struggling dependency takes
 * the whole batch again at once — that argues for randomness. But random
 * jitter makes the function untestable: you cannot assert a value that
 * changes every run.
 *
 * Deriving it from the id gives both properties. Different ids spread out;
 * the same id always produces the same delay.
 */
function idJitter(jobId: string): number {
  let hash = 0;
  for (let index = 0; index < jobId.length; index += 1) {
    hash = (hash * 31 + jobId.charCodeAt(index)) % 100_000;
  }
  return hash % 1000;
}

/**
 * Delay before the given attempt may run: 30s, 60s, 120s, … capped at an
 * hour, plus up to ~25% of the base as id-derived jitter.
 */
export function calculateBackoffMs(attempt: number, jobId: string): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  // Cap the exponent before computing the power, or attempt 400 overflows
  // to Infinity on the way to being clamped.
  const exponent = Math.min(safeAttempt - 1, 20);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
  const jitter = idJitter(jobId) * 8;
  return Math.min(base + jitter, BACKOFF_MAX_MS + jitter);
}

export function nextRunAt(params: { attempt: number; jobId: string; now?: Date }): Date {
  const now = params.now ?? new Date();
  return new Date(now.getTime() + calculateBackoffMs(params.attempt, params.jobId));
}

/** Whether a job is eligible to be claimed right now. */
export function isJobDue(job: { status: JobStatus; runAt: Date }, now: Date = new Date()): boolean {
  if (!["QUEUED", "RETRYING"].includes(job.status)) return false;
  return job.runAt.getTime() <= now.getTime();
}

/* -------------------------------------------------------------------------
 * Job leases and worker health
 *
 * claimNextJob stamps lockedAt/lockedBy when it takes a job, but until now
 * nothing ever read them back. A worker killed mid-job left its row in
 * RUNNING for ever: invisible on the jobs page as anything unusual, never
 * retried, never dead-lettered. The work was simply lost.
 *
 * The fix is a lease. A claim is not ownership, it is ownership *for a
 * while*. Once the lease expires any worker may take the job back.
 * ---------------------------------------------------------------------- */

/** How long a worker may hold a job before another may reclaim it. */
export const JOB_LEASE_MS = 5 * 60 * 1000;

/** Silence after which a worker is suspect, and then presumed dead. */
export const WORKER_STALE_MS = 60 * 1000;
export const WORKER_DEAD_MS = 5 * 60 * 1000;

/**
 * Whether a running job's lease has run out.
 *
 * Only RUNNING jobs hold a lease. A job with no lockedAt is not leased at
 * all — reclaiming one would race the worker that is about to stamp it.
 */
export function isLeaseExpired(
  job: { status: JobStatus; lockedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (job.status !== "RUNNING" || !job.lockedAt) {
    return false;
  }
  return now.getTime() - job.lockedAt.getTime() > JOB_LEASE_MS;
}

export type WorkerHealth = "healthy" | "stale" | "dead";

export function workerHealth(worker: { lastSeenAt: Date }, now: Date = new Date()): WorkerHealth {
  const silentFor = now.getTime() - worker.lastSeenAt.getTime();
  if (silentFor >= WORKER_DEAD_MS) return "dead";
  if (silentFor >= WORKER_STALE_MS) return "stale";
  return "healthy";
}
