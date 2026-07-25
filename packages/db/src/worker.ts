import { Prisma } from "@prisma/client";
import { getAgentDefinition, runRegisteredAgent } from "@agentdesk/agents";
import { JOB_LEASE_MS } from "@agentdesk/domain";
import { redactSensitiveMetadata } from "@agentdesk/observability";
import type { AgentTargetType, AgentType } from "@agentdesk/shared";
import { prisma } from "./index";

type WorkerResult =
  | { status: "idle" }
  | { status: "processed"; jobId: string; jobType: string }
  | { status: "failed"; jobId: string; error: string };

function logWorkerEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), worker: "agentdesk-worker", ...event }));
}

async function writeWorkerAudit(params: {
  organizationId: string;
  action: "job.worker_started" | "job.worker_completed" | "job.worker_failed" | "agent.run_started" | "agent.run_completed" | "agent.run_failed";
  entityType: string;
  entityId: string;
  requestContextId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      organizationId: params.organizationId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      requestContextId: params.requestContextId ?? null,
      before: params.before ? (redactSensitiveMetadata(params.before) as Prisma.InputJsonValue) : undefined,
      after: params.after ? (redactSensitiveMetadata(params.after) as Prisma.InputJsonValue) : undefined,
      metadata: redactSensitiveMetadata(params.metadata ?? {}) as Prisma.InputJsonValue
    }
  });
}

/**
 * Return jobs whose worker went away back to the queue.
 *
 * lockedAt and lockedBy were written by claimNextJob from the beginning and
 * never read by anything. A worker killed mid-job therefore left its row in
 * RUNNING for ever — not retried, not dead-lettered, and indistinguishable
 * on the jobs page from work that was merely slow.
 *
 * Runs before each claim rather than on a timer, so a single worker is
 * enough to recover the queue and there is no separate process to babysit.
 */
export async function reclaimExpiredLeases(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - JOB_LEASE_MS);
  const reclaimed = await prisma.backgroundJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    // RETRYING rather than QUEUED so the jobs page distinguishes "recovered
    // after a worker died" from "never started". attempts is deliberately
    // untouched: the attempt was made, it just never reported back.
    data: { status: "RETRYING", lockedAt: null, lockedBy: null }
  });

  if (reclaimed.count > 0) {
    logWorkerEvent({ event: "job.leases_reclaimed", count: reclaimed.count, leaseMs: JOB_LEASE_MS });
  }
  return reclaimed.count;
}

/** Upsert this worker's heartbeat so the UI can tell "idle" from "absent". */
export async function recordHeartbeat(workerId: string, delta: { processed?: number; failed?: number } = {}) {
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      processedCount: delta.processed ?? 0,
      failedCount: delta.failed ?? 0
    },
    update: {
      // lastSeenAt is @updatedAt, so any write refreshes it. The increment
      // of 0 on an idle poll is what keeps that true without a second call.
      processedCount: { increment: delta.processed ?? 0 },
      failedCount: { increment: delta.failed ?? 0 }
    }
  });
}

export async function claimNextJob(workerId: string) {
  const candidate = await prisma.backgroundJob.findFirst({
    where: { status: { in: ["QUEUED", "RETRYING"] } },
    orderBy: { createdAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.backgroundJob.updateMany({
    where: { id: candidate.id, status: { in: ["QUEUED", "RETRYING"] } },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date()
    }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.backgroundJob.findUniqueOrThrow({ where: { id: candidate.id } });
}

export async function processNextBackgroundJob(workerId = `worker-${process.pid}`): Promise<WorkerResult> {
  await reclaimExpiredLeases();
  const job = await claimNextJob(workerId);
  if (!job) {
    await recordHeartbeat(workerId);
    return { status: "idle" };
  }

  logWorkerEvent({
    event: "job.started",
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    requestContextId: job.requestContextId
  });
  await writeWorkerAudit({
    organizationId: job.organizationId,
    action: "job.worker_started",
    entityType: "BackgroundJob",
    entityId: job.id,
    requestContextId: job.requestContextId,
    after: { status: "RUNNING", workerId }
  });

  try {
    if (job.type === "AGENT_RUN") {
      await processAgentRunJob(job);
    } else {
      await processDemoJob(job);
    }

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", errorMessage: null, finishedAt: new Date(), lockedAt: null, lockedBy: null }
    });
    await writeWorkerAudit({
      organizationId: job.organizationId,
      action: "job.worker_completed",
      entityType: "BackgroundJob",
      entityId: job.id,
      requestContextId: job.requestContextId,
      after: { status: "SUCCEEDED" }
    });

    await recordHeartbeat(workerId, { processed: 1 });
    logWorkerEvent({ event: "job.completed", jobId: job.id, jobType: job.type });
    return { status: "processed", jobId: job.id, jobType: job.type };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const nextStatus = job.attempts >= job.maxAttempts ? "DEAD_LETTERED" : "FAILED";
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: nextStatus, errorMessage: message, finishedAt: new Date(), lockedAt: null, lockedBy: null }
    });
    await writeWorkerAudit({
      organizationId: job.organizationId,
      action: "job.worker_failed",
      entityType: "BackgroundJob",
      entityId: job.id,
      requestContextId: job.requestContextId,
      after: { status: nextStatus, errorMessage: message }
    });
    await recordHeartbeat(workerId, { failed: 1 });
    logWorkerEvent({ event: "job.failed", jobId: job.id, jobType: job.type, errorMessage: message });
    return { status: "failed", jobId: job.id, error: message };
  }
}

async function processAgentRunJob(job: { id: string; organizationId: string; payload: Prisma.JsonValue; requestContextId: string | null }) {
  const payload = job.payload as Record<string, unknown>;
  const agentRunId = asString(payload.agentRunId, "agentRunId");
  const agentType = asString(payload.agentType, "agentType") as AgentType;
  const targetType = asString(payload.targetType, "targetType") as AgentTargetType;
  const targetId = asString(payload.targetId, "targetId");
  const input = asRecord(payload.input, "input");
  const definition = getAgentDefinition(agentType);

  const run = await prisma.agentRun.findFirstOrThrow({
    where: { id: agentRunId, organizationId: job.organizationId }
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      agentVersion: definition.version,
      requestContextId: job.requestContextId
    }
  });
  await writeWorkerAudit({
    organizationId: job.organizationId,
    action: "agent.run_started",
    entityType: "AgentRun",
    entityId: run.id,
    requestContextId: job.requestContextId,
    after: { agentType, targetType, targetId, agentVersion: definition.version }
  });

  try {
    const result = runRegisteredAgent(agentType, { targetType, targetId, input });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        output: result as unknown as Prisma.InputJsonValue,
        confidenceScore: result.confidenceScore,
        trace: result.trace as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        agentVersion: definition.version
      }
    });
    await writeWorkerAudit({
      organizationId: job.organizationId,
      action: "agent.run_completed",
      entityType: "AgentRun",
      entityId: run.id,
      requestContextId: job.requestContextId,
      after: { confidenceScore: result.confidenceScore, findings: result.findings }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date()
      }
    });
    await writeWorkerAudit({
      organizationId: job.organizationId,
      action: "agent.run_failed",
      entityType: "AgentRun",
      entityId: run.id,
      requestContextId: job.requestContextId,
      after: { errorMessage: message }
    });
    throw error;
  }
}

async function processDemoJob(job: { type: string; errorMessage: string | null }) {
  const error = (job.errorMessage ?? "").toLowerCase();
  if (/malformed|invalid payload|permission|unauthorized|forbidden/.test(error)) {
    throw new Error(`Non-retryable ${job.type} failure requires operator review.`);
  }
}

function asString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`AGENT_RUN payload is missing ${key}.`);
  }
  return value;
}

function asRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AGENT_RUN payload is missing ${key}.`);
  }
  return value as Record<string, unknown>;
}

async function main() {
  const once = process.argv.includes("--once");
  do {
    const result = await processNextBackgroundJob();
    if (result.status === "idle") {
      if (once) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } while (!once);
}

if (process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
