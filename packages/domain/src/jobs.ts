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
