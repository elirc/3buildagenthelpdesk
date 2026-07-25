import { clamp, type JsonRecord, type LogEnvironment, type LogLevel } from "@agentdesk/shared";
import { environmentWeight, logLevelWeight } from "@agentdesk/domain";

export type StructuredLogInput = {
  service: string;
  environment: LogEnvironment;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string | null;
  ticketId?: string | null;
  incidentId?: string | null;
  metadata?: JsonRecord;
};

export type AuditAction =
  | "ticket.created"
  | "ticket.updated"
  | "ticket.status_changed"
  | "ticket.assigned"
  | "ticket.escalated"
  | "incident.created"
  | "incident.updated"
  | "job.retried"
  | "job.dead_lettered"
  | "job.requeued"
  | "job.worker_started"
  | "job.worker_completed"
  | "job.worker_failed"
  | "agent.run_queued"
  | "agent.run_started"
  | "agent.run_completed"
  | "agent.run_failed"
  | "agent.run_replayed"
  | "canned_reply.created"
  | "canned_reply.updated"
  | "canned_reply.deactivated"
  | "calendar.updated"
  | "routing_rule.created"
  | "routing_rule.updated"
  | "routing_rule.deleted"
  | "ticket.auto_routed"
  | "ticket.linked"
  | "ticket.unlinked"
  | "ticket.merged"
  | "ticket.merge_received"
  | "view.created"
  | "view.deleted"
  | "view.shared"
  | "ticket.first_response_recorded"
  | "security.access_denied";

export type AuditEventInput = {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: JsonRecord | null;
  after?: JsonRecord | null;
  metadata?: JsonRecord;
};

export function createStructuredLog(input: StructuredLogInput): StructuredLogInput & { timestamp: string } {
  return {
    timestamp: new Date().toISOString(),
    metadata: {},
    ...input
  };
}

export type AnomalyLog = {
  service: string;
  environment: LogEnvironment;
  level: LogLevel;
  message: string;
  fingerprint: string;
  timestamp?: Date | string;
};

export type AnomalyScoreResult = {
  score: number;
  reasons: string[];
  levelDistribution: Record<LogLevel, number>;
  fingerprintCounts: Record<string, number>;
};

export function scoreLogAnomaly(logs: AnomalyLog[]): AnomalyScoreResult {
  const levelDistribution: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0
  };
  const fingerprintCounts: Record<string, number> = {};
  const reasons: string[] = [];

  let score = 0;
  for (const log of logs) {
    levelDistribution[log.level] += 1;
    fingerprintCounts[log.fingerprint] = (fingerprintCounts[log.fingerprint] ?? 0) + 1;
    score += logLevelWeight(log.level) * environmentWeight(log.environment);
  }

  const repeatedFingerprint = Object.entries(fingerprintCounts).find(([, count]) => count >= 3);
  if (repeatedFingerprint) {
    const [fingerprint, count] = repeatedFingerprint;
    score += count * 10;
    reasons.push(`Fingerprint ${fingerprint} appears ${count} times in the selected window.`);
  }

  if (levelDistribution.fatal > 0) {
    score += 35;
    reasons.push("Fatal logs are present.");
  }

  if (levelDistribution.error >= 5) {
    score += 25;
    reasons.push("Error volume crossed the burst threshold.");
  }

  if (logs.some((log) => /timeout|timed out/i.test(log.message))) {
    score += 12;
    reasons.push("Timeout language appears in log messages.");
  }

  if (logs.some((log) => /auth|login|permission|token/i.test(log.message))) {
    score += 10;
    reasons.push("Authentication or permission terms appear in log messages.");
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons,
    levelDistribution,
    fingerprintCounts
  };
}

export function redactSensitiveMetadata(metadata: JsonRecord): JsonRecord {
  return redactValue(metadata) as JsonRecord;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted: JsonRecord = {};
  const record = value as JsonRecord;
  for (const [key, childValue] of Object.entries(record)) {
    if (/password|token|secret|apiKey|authorization|cookie|session/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = redactValue(childValue);
    }
  }
  return redacted;
}
