import { Prisma } from "@prisma/client";
import { getAgentDefinition, runRegisteredAgent } from "@agentdesk/agents";
import { JOB_LEASE_MS, autoIncidentTitle, evaluateLogAlertRule, nextRunAt } from "@agentdesk/domain";
import { redactSensitiveMetadata, scoreLogAnomaly } from "@agentdesk/observability";
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
  const now = new Date();
  const candidate = await prisma.backgroundJob.findFirst({
    // runAt gates eligibility. A job backing off after a failure is still
    // QUEUED/RETRYING but must not be picked up before its delay elapses.
    where: { status: { in: ["QUEUED", "RETRYING"] }, runAt: { lte: now } },
    orderBy: { runAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.backgroundJob.updateMany({
    // runAt is repeated in the conditional update for the same reason the
    // status is: between the read and the write another worker may have
    // taken and rescheduled this row.
    where: { id: candidate.id, status: { in: ["QUEUED", "RETRYING"] }, runAt: { lte: now } },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      lastAttemptAt: new Date()
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
    } else if (job.type === "LOG_ALERT_EVALUATION") {
      await processLogAlertEvaluation(job);
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

    // The worker owns the attempt counter now. It previously shared it with
    // retryJobAction, which incremented on the human's click while the
    // worker separately compared it against maxAttempts — two writers, one
    // counter, and a retry budget that depended on who moved last.
    const attempts = job.attempts + 1;
    const exhausted = attempts >= job.maxAttempts;
    const nextStatus = exhausted ? "DEAD_LETTERED" : "RETRYING";
    const scheduledFor = exhausted ? null : nextRunAt({ attempt: attempts, jobId: job.id });

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        attempts,
        errorMessage: message,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        ...(scheduledFor ? { runAt: scheduledFor } : {})
      }
    });
    await writeWorkerAudit({
      organizationId: job.organizationId,
      action: "job.worker_failed",
      entityType: "BackgroundJob",
      entityId: job.id,
      requestContextId: job.requestContextId,
      after: { status: nextStatus, attempts, errorMessage: message, runAt: scheduledFor?.toISOString() ?? null }
    });
    await recordHeartbeat(workerId, { failed: 1 });
    logWorkerEvent({
      event: exhausted ? "job.dead_lettered" : "job.rescheduled",
      jobId: job.id,
      jobType: job.type,
      attempts,
      maxAttempts: job.maxAttempts,
      runAt: scheduledFor?.toISOString() ?? null,
      errorMessage: message
    });
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

/**
 * Evaluate every active log alert rule for one organization.
 *
 * Self-rescheduling: the job enqueues its successor before returning, using
 * the runAt column added in D1. That is how a periodic task exists in an
 * app with no scheduler — the queue becomes the timer. The reschedule
 * happens even on the failure path, or one bad evaluation would silently
 * end the loop for ever.
 */
export async function processLogAlertEvaluation(job: {
  id: string;
  organizationId: string;
  payload: Prisma.JsonValue;
  requestContextId: string | null;
}) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const intervalMinutes = typeof payload.intervalMinutes === "number" ? payload.intervalMinutes : 5;

  try {
    const rules = await prisma.logAlertRule.findMany({
      where: { organizationId: job.organizationId, isActive: true }
    });

    for (const rule of rules) {
      const since = new Date(Date.now() - rule.windowMinutes * 60_000);
      const where = {
        organizationId: job.organizationId,
        timestamp: { gte: since },
        ...(rule.service ? { service: rule.service } : {}),
        ...(rule.environment ? { environment: rule.environment } : {}),
        ...(rule.level ? { level: rule.level } : {}),
        ...(rule.fingerprint ? { fingerprint: rule.fingerprint } : {})
      };

      const logs = await prisma.structuredLog.findMany({ where, orderBy: { timestamp: "desc" }, take: 200 });
      // Reuse the existing anomaly agent rather than inventing a second
      // definition of "how bad is this". One scoring rule, one place.
      const scored = logs.length > 0 ? scoreLogAnomaly(logs) : { score: 0, reasons: [] };

      const decision = evaluateLogAlertRule({
        rule,
        matchedCount: logs.length,
        anomalyScore: scored.score
      });

      if (!decision.shouldFire) continue;

      let incidentId: string | null = null;
      if (rule.action === "CREATE_INCIDENT") {
        // Do not open a second incident for a condition that already has
        // one open. Cooldown alone would not prevent this after a restart.
        const existing = await prisma.incident.findFirst({
          where: {
            organizationId: job.organizationId,
            createdByRuleId: rule.id,
            status: { not: "RESOLVED" }
          }
        });

        if (!existing) {
          const incident = await prisma.incident.create({
            data: {
              organizationId: job.organizationId,
              title: autoIncidentTitle(rule.name, rule.service),
              description: `Opened automatically by the "${rule.name}" alert rule. ${decision.reason} ${scored.reasons.join(" ")}`.trim(),
              status: "INVESTIGATING",
              severity: rule.incidentSeverity,
              affectedService: rule.service ?? "multiple-services",
              createdByRuleId: rule.id
            }
          });
          incidentId = incident.id;

          // Attach the evidence, so the incident opens with the logs that
          // caused it rather than requiring someone to go and find them.
          await prisma.structuredLog.updateMany({
            where: { id: { in: logs.map((log) => log.id) } },
            data: { incidentId: incident.id }
          });
        } else {
          incidentId = existing.id;
        }
      }

      await prisma.logAlertRule.update({
        where: { id: rule.id },
        data: { lastFiredAt: new Date(), fireCount: { increment: 1 } }
      });

      await prisma.auditEvent.create({
        data: {
          organizationId: job.organizationId,
          action: incidentId ? "incident.auto_created" : "alert_rule.fired",
          entityType: incidentId ? "Incident" : "LogAlertRule",
          entityId: incidentId ?? rule.id,
          after: redactSensitiveMetadata({
            ruleId: rule.id,
            ruleName: rule.name,
            matchedCount: decision.matchedCount,
            anomalyScore: scored.score,
            action: rule.action
          }) as Prisma.InputJsonValue,
          requestContextId: job.requestContextId
        }
      });

      logWorkerEvent({
        event: "alert_rule.fired",
        ruleId: rule.id,
        ruleName: rule.name,
        matchedCount: decision.matchedCount,
        anomalyScore: scored.score,
        incidentId
      });
    }
  } finally {
    await scheduleNextLogAlertEvaluation(job.organizationId, intervalMinutes);
  }
}

/** Enqueue the next evaluation, unless one is already waiting. */
export async function scheduleNextLogAlertEvaluation(organizationId: string, intervalMinutes = 5) {
  const pending = await prisma.backgroundJob.findFirst({
    where: { organizationId, type: "LOG_ALERT_EVALUATION", status: { in: ["QUEUED", "RETRYING", "RUNNING"] } }
  });
  // Without this guard, a manual "evaluate now" alongside the running loop
  // doubles the number of evaluators, and it never comes back down.
  if (pending) return pending;

  return prisma.backgroundJob.create({
    data: {
      organizationId,
      type: "LOG_ALERT_EVALUATION",
      status: "QUEUED",
      maxAttempts: 1,
      payload: { intervalMinutes },
      runAt: new Date(Date.now() + intervalMinutes * 60_000)
    }
  });
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
