"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@agentdesk/db";
import {
  applySlaPauseTransition,
  assertIncidentTransition,
  assertTicketTransition,
  calculateSlaDueAt,
  canRetryJob,
  createIncidentSchema,
  createTicketSchema,
  normalizeTags,
  requireCapability,
  type Capability
} from "@agentdesk/domain";
import type { AgentTargetType, AgentType } from "@agentdesk/shared";
import { assertCanAccessRecord } from "./access";
import { writeAuditEvent } from "./audit";
import { getCurrentUser, isDemoAuthEnabled, requireCurrentUser } from "./auth";
import { ActionError } from "./errors";
import { createRequestContext, logOperationalEvent, type RequestContext } from "./request-context";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value.length > 0 ? value : null;
}

async function requireActionUser(action: string, capability?: Capability) {
  const user = await requireCurrentUser();
  if (capability) {
    requireCapability(user.role, capability);
  }
  const requestContext = createRequestContext(action, user);
  logOperationalEvent({
    event: "server_action.started",
    action,
    requestContextId: requestContext.requestContextId,
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorRole: user.role
  });
  return { user, requestContext };
}

async function assertScopedTeam(user: { organizationId: string }, id: string | null): Promise<void> {
  if (!id) return;
  const team = await prisma.team.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (!team) throw new ActionError("Selected team is outside the active organization.");
}

async function assertScopedUser(user: { organizationId: string }, id: string | null): Promise<void> {
  if (!id) return;
  const targetUser = await prisma.user.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (!targetUser) throw new ActionError("Selected user is outside the active organization.");
}

async function assertScopedIncident(user: { organizationId: string }, id: string | null): Promise<void> {
  if (!id) return;
  const incident = await prisma.incident.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (!incident) throw new ActionError("Selected incident is outside the active organization.");
}

async function queueAgentRun(params: {
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  input: Record<string, unknown>;
  createdByUserId: string;
  organizationId: string;
  requestContext: RequestContext;
}) {
  const agentRun = await prisma.agentRun.create({
    data: {
      organizationId: params.organizationId,
      agentType: params.agentType,
      status: "PENDING",
      targetType: params.targetType,
      targetId: params.targetId,
      inputSnapshot: params.input as Prisma.InputJsonValue,
      requestContextId: params.requestContext.requestContextId,
      createdByUserId: params.createdByUserId
    }
  });

  await prisma.backgroundJob.create({
    data: {
      organizationId: params.organizationId,
      type: "AGENT_RUN",
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 1,
      payload: {
        agentRunId: agentRun.id,
        agentType: params.agentType,
        targetType: params.targetType,
        targetId: params.targetId,
        input: params.input
      } as Prisma.InputJsonValue,
      requestContextId: params.requestContext.requestContextId
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.createdByUserId,
    action: "agent.run_queued",
    entityType: "AgentRun",
    entityId: agentRun.id,
    after: { agentType: params.agentType, targetType: params.targetType, targetId: params.targetId },
    metadata: { requestAction: params.requestContext.action },
    requestContextId: params.requestContext.requestContextId
  });

  return agentRun;
}

export async function setActiveUserAction(formData: FormData) {
  if (!isDemoAuthEnabled()) {
    throw new ActionError("Local user switching is disabled outside demo authentication mode.");
  }

  const userId = stringValue(formData, "userId");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ActionError("Selected demo user does not exist.");
  }

  cookies().set("activeUserId", userId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true
  });
  revalidatePath("/", "layout");
}

export async function createTicketAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.create", "ticket:create");

  const parsed = createTicketSchema.parse({
    title: stringValue(formData, "title"),
    description: stringValue(formData, "description"),
    customerName: stringValue(formData, "customerName"),
    requesterEmail: stringValue(formData, "requesterEmail"),
    priority: stringValue(formData, "priority"),
    category: stringValue(formData, "category"),
    assignedTeamId: optionalStringValue(formData, "assignedTeamId"),
    assignedUserId: optionalStringValue(formData, "assignedUserId"),
    incidentId: optionalStringValue(formData, "incidentId"),
    tags: normalizeTags(stringValue(formData, "tags"))
  });

  await Promise.all([
    assertScopedTeam(user, parsed.assignedTeamId ?? null),
    assertScopedUser(user, parsed.assignedUserId ?? null),
    assertScopedIncident(user, parsed.incidentId ?? null)
  ]);

  const createdAt = new Date();
  const ticketData: Prisma.TicketUncheckedCreateInput = {
    organizationId: user.organizationId,
    title: parsed.title,
    description: parsed.description,
    customerName: parsed.customerName,
    requesterEmail: parsed.requesterEmail,
    priority: parsed.priority,
    category: parsed.category,
    assignedTeamId: parsed.assignedTeamId,
    assignedUserId: parsed.assignedUserId,
    incidentId: parsed.incidentId,
    tags: parsed.tags,
    status: "NEW",
    slaDueAt: calculateSlaDueAt(parsed.priority, createdAt),
    createdAt
  };
  const ticket = await prisma.ticket.create({ data: ticketData });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "ticket.created",
    entityType: "Ticket",
    entityId: ticket.id,
    after: { status: ticket.status, priority: ticket.priority, assignedTeamId: ticket.assignedTeamId },
    metadata: { route: "/tickets/new", actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicketAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.update", "ticket:update");

  const ticketId = stringValue(formData, "ticketId");
  const before = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Ticket");

  const nextStatus = stringValue(formData, "status") as typeof before.status;
  assertTicketTransition(before.status, nextStatus);

  const nextPriority = stringValue(formData, "priority") as typeof before.priority;
  const assignedTeamId = optionalStringValue(formData, "assignedTeamId");
  const assignedUserId = optionalStringValue(formData, "assignedUserId");
  const incidentId = optionalStringValue(formData, "incidentId");

  await Promise.all([
    assertScopedTeam(user, assignedTeamId),
    assertScopedUser(user, assignedUserId),
    assertScopedIncident(user, incidentId)
  ]);

  const nextResolvedAt =
    (nextStatus === "RESOLVED" || nextStatus === "CLOSED") && before.resolvedAt == null
      ? new Date()
      : nextStatus === "RESOLVED" || nextStatus === "CLOSED"
        ? before.resolvedAt
        : null;

  // The SLA clock stops while the ticket waits on the customer. The domain
  // decides what to write; this action only persists it. Note it is called
  // on every save, not just on a status change — the helper is idempotent
  // and returning early here would miss the resume when a ticket moves out
  // of a paused status by any route, including straight to RESOLVED.
  const slaPause = applySlaPauseTransition({
    from: before.status,
    to: nextStatus,
    slaPausedAt: before.slaPausedAt,
    slaPausedTotalMs: before.slaPausedTotalMs
  });

  const after = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      slaPausedAt: slaPause.slaPausedAt,
      slaPausedTotalMs: slaPause.slaPausedTotalMs,
      title: stringValue(formData, "title"),
      description: stringValue(formData, "description"),
      customerName: stringValue(formData, "customerName"),
      requesterEmail: stringValue(formData, "requesterEmail"),
      status: nextStatus,
      priority: nextPriority,
      category: stringValue(formData, "category") as typeof before.category,
      assignedTeamId,
      assignedUserId,
      incidentId,
      tags: normalizeTags(stringValue(formData, "tags")),
      resolvedAt: nextResolvedAt,
      slaDueAt: nextPriority !== before.priority ? calculateSlaDueAt(nextPriority, before.createdAt) : before.slaDueAt
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: before.status === after.status ? "ticket.updated" : "ticket.status_changed",
    entityType: "Ticket",
    entityId: ticketId,
    before: {
      status: before.status,
      priority: before.priority,
      assignedTeamId: before.assignedTeamId,
      assignedUserId: before.assignedUserId,
      slaPausedTotalMs: before.slaPausedTotalMs
    },
    after: {
      status: after.status,
      priority: after.priority,
      assignedTeamId: after.assignedTeamId,
      assignedUserId: after.assignedUserId,
      // Recorded so the audit trail can answer "why was this deadline
      // later than the SLA implies" without replaying every transition.
      slaPausedTotalMs: after.slaPausedTotalMs
    },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  if (after.status === "ESCALATED" && before.status !== "ESCALATED") {
    await writeAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "ticket.escalated",
      entityType: "Ticket",
      entityId: ticketId,
      before: { status: before.status },
      after: { status: after.status, assignedTeamId: after.assignedTeamId },
      metadata: { actorRole: user.role },
      requestContextId: requestContext.requestContextId
    });
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

export async function addTicketCommentAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.comment", "ticket:update");

  const ticketId = stringValue(formData, "ticketId");
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId: user.organizationId }, select: { id: true, organizationId: true } });
  assertCanAccessRecord(user, ticket, "Ticket");

  const body = stringValue(formData, "body");
  if (body.length < 2) return;

  await prisma.ticketComment.create({
    data: {
      ticketId,
      authorId: user.id,
      body,
      isInternal: formData.get("isInternal") === "on"
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "ticket.updated",
    entityType: "Ticket",
    entityId: ticketId,
    after: { commentAdded: true },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/tickets/${ticketId}`);
}

export async function createIncidentAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("incident.create", "incident:create");

  const parsed = createIncidentSchema.parse({
    title: stringValue(formData, "title"),
    description: stringValue(formData, "description"),
    status: stringValue(formData, "status") || "INVESTIGATING",
    severity: stringValue(formData, "severity"),
    affectedService: stringValue(formData, "affectedService"),
    ownerId: optionalStringValue(formData, "ownerId")
  });

  await assertScopedUser(user, parsed.ownerId ?? null);

  const incidentData: Prisma.IncidentUncheckedCreateInput = {
    organizationId: user.organizationId,
    title: parsed.title,
    description: parsed.description,
    status: parsed.status,
    severity: parsed.severity,
    affectedService: parsed.affectedService,
    ownerId: parsed.ownerId
  };
  const incident = await prisma.incident.create({ data: incidentData });
  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "incident.created",
    entityType: "Incident",
    entityId: incident.id,
    after: { severity: incident.severity, status: incident.status },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath("/incidents");
  redirect(`/incidents/${incident.id}`);
}

export async function updateIncidentStatusAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("incident.status_update", "incident:update");

  const incidentId = stringValue(formData, "incidentId");
  const before = await prisma.incident.findFirst({ where: { id: incidentId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Incident");

  const status = stringValue(formData, "status") as typeof before.status;
  assertIncidentTransition(before.status, status);
  const after = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status,
      resolvedAt: status === "RESOLVED" && before.resolvedAt == null ? new Date() : status === "RESOLVED" ? before.resolvedAt : null
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "incident.updated",
    entityType: "Incident",
    entityId: incidentId,
    before: { status: before.status },
    after: { status: after.status },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
}

export async function runTicketAgentAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("agent.ticket.queue", "agent:run");

  const ticketId = stringValue(formData, "ticketId");
  const ticket = await prisma.ticket.findFirstOrThrow({
    where: { id: ticketId, organizationId: user.organizationId },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      logs: { where: { organizationId: user.organizationId }, orderBy: { timestamp: "desc" }, take: 20 },
      incident: true
    }
  });

  const input = {
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    category: ticket.category,
    comments: ticket.comments.map((comment) => ({ body: comment.body, isInternal: comment.isInternal })),
    linkedIncident: ticket.incident
      ? { id: ticket.incident.id, title: ticket.incident.title, severity: ticket.incident.severity }
      : null,
    linkedLogs: ticket.logs.map((log) => ({
      level: log.level,
      message: log.message,
      service: log.service,
      fingerprint: log.fingerprint
    }))
  };

  const run = await queueAgentRun({
    agentType: "TICKET_SUMMARIZATION",
    targetType: "TICKET",
    targetId: ticketId,
    input,
    createdByUserId: user.id,
    organizationId: user.organizationId,
    requestContext
  });

  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/agents/${run.id}`);
}

export async function runLogAnomalyAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("agent.log_anomaly.queue", "agent:run");

  const service = optionalStringValue(formData, "service");
  const environment = optionalStringValue(formData, "environment");
  const fingerprint = optionalStringValue(formData, "fingerprint");
  const incidentId = optionalStringValue(formData, "incidentId");

  if (incidentId) {
    await assertScopedIncident(user, incidentId);
  }

  const logs = await prisma.structuredLog.findMany({
    where: {
      organizationId: user.organizationId,
      service: service ?? undefined,
      environment: environment ? (environment as never) : undefined,
      fingerprint: fingerprint ?? undefined,
      incidentId: incidentId ?? undefined
    },
    orderBy: { timestamp: "desc" },
    take: 80
  });

  const input = {
    service: service ?? logs[0]?.service ?? "mixed-services",
    logs: logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      service: log.service,
      environment: log.environment,
      level: log.level,
      message: log.message,
      fingerprint: log.fingerprint
    }))
  };

  const run = await queueAgentRun({
    agentType: "LOG_ANOMALY_DETECTION",
    targetType: incidentId ? "INCIDENT" : "LOG_GROUP",
    targetId: incidentId ?? fingerprint ?? service ?? "recent-logs",
    input,
    createdByUserId: user.id,
    organizationId: user.organizationId,
    requestContext
  });

  revalidatePath("/logs");
  if (incidentId) revalidatePath(`/incidents/${incidentId}`);
  redirect(`/agents/${run.id}`);
}

export async function retryJobAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("job.retry", "job:retry");

  const jobId = stringValue(formData, "jobId");
  const before = await prisma.backgroundJob.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Background job");
  if (!canRetryJob(before.status, before.attempts, before.maxAttempts)) {
    throw new ActionError("Job is not eligible for retry.");
  }

  const after = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "RETRYING",
      attempts: before.attempts + 1,
      startedAt: null,
      finishedAt: null,
      requestContextId: requestContext.requestContextId
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "job.retried",
    entityType: "BackgroundJob",
    entityId: jobId,
    before: { status: before.status, attempts: before.attempts },
    after: { status: after.status, attempts: after.attempts },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

export async function deadLetterJobAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("job.dead_letter", "job:dead-letter");

  const jobId = stringValue(formData, "jobId");
  const before = await prisma.backgroundJob.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Background job");
  const after = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "DEAD_LETTERED",
      finishedAt: new Date(),
      requestContextId: requestContext.requestContextId
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "job.dead_lettered",
    entityType: "BackgroundJob",
    entityId: jobId,
    before: { status: before.status },
    after: { status: after.status },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

export async function runJobAgentAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("agent.job.queue", "agent:run");

  const jobId = stringValue(formData, "jobId");
  const job = await prisma.backgroundJob.findFirstOrThrow({
    where: { id: jobId, organizationId: user.organizationId },
    include: {
      relatedTicket: true,
      relatedIncident: true
    }
  });

  const logWhere: Prisma.StructuredLogWhereInput[] = [
    ...(job.relatedTicketId ? [{ ticketId: job.relatedTicketId }] : []),
    ...(job.relatedIncidentId ? [{ incidentId: job.relatedIncidentId }] : [])
  ];

  const logs = await prisma.structuredLog.findMany({
    where: logWhere.length > 0 ? { organizationId: user.organizationId, OR: logWhere } : { id: "__no-related-logs__", organizationId: user.organizationId },
    orderBy: { timestamp: "desc" },
    take: 20
  });

  const input = {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    payload: job.payload as Record<string, unknown>,
    errorMessage: job.errorMessage,
    relatedLogs: logs.map((log) => ({ level: log.level, message: log.message, service: log.service })),
    relatedTicket: job.relatedTicket ? { id: job.relatedTicket.id, title: job.relatedTicket.title } : null,
    relatedIncident: job.relatedIncident
      ? { id: job.relatedIncident.id, title: job.relatedIncident.title, severity: job.relatedIncident.severity }
      : null
  };

  const run = await queueAgentRun({
    agentType: "FAILED_JOB_INVESTIGATION",
    targetType: "JOB",
    targetId: jobId,
    input,
    createdByUserId: user.id,
    organizationId: user.organizationId,
    requestContext
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/agents/${run.id}`);
}
