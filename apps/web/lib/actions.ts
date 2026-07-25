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
  calculateFirstResponseDueAt,
  calculateSlaDueAt,
  cannedReplySchema,
  canEditSavedView,
  canRetryJob,
  createIncidentSchema,
  createTicketSchema,
  extractVariables,
  linkedTicketIds,
  MAX_BULK_TICKETS,
  planBulkStatusChange,
  normalizeTags,
  qualifiesAsFirstResponse,
  requireCapability,
  sanitizeViewQuery,
  savedViewSchema,
  type SavedViewResource,
  validateTicketLink,
  TICKET_LINK_TYPES,
  type TicketLinkType,
  type Capability
} from "@agentdesk/domain";
import type { AgentTargetType, AgentType, TicketPriority, TicketStatus } from "@agentdesk/shared";
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
    firstResponseDueAt: calculateFirstResponseDueAt(parsed.priority, createdAt),
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
      slaDueAt: nextPriority !== before.priority ? calculateSlaDueAt(nextPriority, before.createdAt) : before.slaDueAt,
      // Re-prioritising moves both clocks, or a ticket escalated to CRITICAL
      // would keep a 24-hour response target.
      firstResponseDueAt:
        nextPriority !== before.priority
          ? calculateFirstResponseDueAt(nextPriority, before.createdAt)
          : before.firstResponseDueAt
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
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId: user.organizationId },
    select: { id: true, organizationId: true, requesterEmail: true, firstRespondedAt: true }
  });
  assertCanAccessRecord(user, ticket, "Ticket");

  const body = stringValue(formData, "body");
  if (body.length < 2) return;

  // A template only counts as used when a comment is actually posted.
  // Previewing one in the box is not usage, or usageCount would measure
  // curiosity rather than usefulness.
  const cannedReplyId = optionalStringValue(formData, "cannedReplyId");
  if (cannedReplyId) {
    const template = await prisma.cannedReply.findFirst({
      where: { id: cannedReplyId, organizationId: user.organizationId },
      select: { id: true }
    });
    if (!template) {
      throw new ActionError("Selected reply template is outside the active organization.");
    }
  }

  await prisma.ticketComment.create({
    data: {
      ticketId,
      authorId: user.id,
      body,
      isInternal: formData.get("isInternal") === "on",
      cannedReplyId
    }
  });

  if (cannedReplyId) {
    await prisma.cannedReply.update({
      where: { id: cannedReplyId },
      data: { usageCount: { increment: 1 } }
    });
  }

  // Stamped once and never overwritten. "First" is only meaningful if a
  // later reply cannot quietly become it — otherwise the metric measures
  // the most recent contact, which is a different thing entirely.
  const isInternal = formData.get("isInternal") === "on";
  if (
    ticket.firstRespondedAt == null &&
    qualifiesAsFirstResponse({ isInternal, authorEmail: user.email }, ticket.requesterEmail)
  ) {
    const respondedAt = new Date();
    await prisma.ticket.update({ where: { id: ticketId }, data: { firstRespondedAt: respondedAt } });

    await writeAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "ticket.first_response_recorded",
      entityType: "Ticket",
      entityId: ticketId,
      after: { firstRespondedAt: respondedAt.toISOString() },
      metadata: { actorRole: user.role },
      requestContextId: requestContext.requestContextId
    });
  }

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

  // Deliberately does not touch `attempts`. The worker owns that counter —
  // it increments on each real attempt and decides when the budget is
  // exhausted. Incrementing here as well was double-counting: a human retry
  // burned an attempt the job had not actually made.
  //
  // This only makes the job due immediately, overriding any backoff delay.
  // That is the whole point of a manual retry: "I have fixed the cause,
  // stop waiting."
  const after = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "RETRYING",
      runAt: new Date(),
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

/* -------------------------------------------------------------------------
 * Canned replies
 *
 * Templates are shared text that goes out under the company's name, so
 * authoring them is gated on canned_reply:manage (ADMIN and MANAGER) while
 * *using* one needs only the ability to comment.
 * ---------------------------------------------------------------------- */

function parseCannedReplyForm(formData: FormData) {
  return cannedReplySchema.parse({
    title: stringValue(formData, "title"),
    body: stringValue(formData, "body"),
    // An empty select means "applies to every category", which is null in
    // the database rather than the empty string a form would otherwise send.
    category: optionalStringValue(formData, "category"),
    isActive: formData.get("isActive") !== "off"
  });
}

export async function createCannedReplyAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("canned_reply.create", "canned_reply:manage");
  const parsed = parseCannedReplyForm(formData);

  // The unique constraint on (organizationId, title) would otherwise surface
  // to the user as a raw Prisma error mentioning a constraint name.
  const existing = await prisma.cannedReply.findFirst({
    where: { organizationId: user.organizationId, title: parsed.title },
    select: { id: true }
  });
  if (existing) {
    throw new ActionError(`A reply template named "${parsed.title}" already exists.`);
  }

  const reply = await prisma.cannedReply.create({
    data: {
      organizationId: user.organizationId,
      title: parsed.title,
      body: parsed.body,
      category: parsed.category ?? null,
      isActive: parsed.isActive,
      createdById: user.id
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "canned_reply.created",
    entityType: "CannedReply",
    entityId: reply.id,
    after: { title: reply.title, category: reply.category, isActive: reply.isActive },
    metadata: { actorRole: user.role, variables: extractVariables(reply.body) },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath("/settings");
}

export async function updateCannedReplyAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("canned_reply.update", "canned_reply:manage");

  const id = stringValue(formData, "cannedReplyId");
  const before = await prisma.cannedReply.findFirst({ where: { id, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Reply template");

  const parsed = parseCannedReplyForm(formData);
  const after = await prisma.cannedReply.update({
    where: { id },
    data: {
      title: parsed.title,
      body: parsed.body,
      category: parsed.category ?? null,
      isActive: parsed.isActive
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "canned_reply.updated",
    entityType: "CannedReply",
    entityId: id,
    before: { title: before.title, category: before.category, isActive: before.isActive },
    after: { title: after.title, category: after.category, isActive: after.isActive },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath("/settings");
}

export async function deactivateCannedReplyAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("canned_reply.deactivate", "canned_reply:manage");

  const id = stringValue(formData, "cannedReplyId");
  const before = await prisma.cannedReply.findFirst({ where: { id, organizationId: user.organizationId } });
  assertCanAccessRecord(user, before, "Reply template");

  // Deactivate, never delete. Comments point at the template they came from,
  // and deleting it would either orphan that history or cascade away real
  // customer correspondence.
  const after = await prisma.cannedReply.update({
    where: { id },
    data: { isActive: !before.isActive }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: after.isActive ? "canned_reply.updated" : "canned_reply.deactivated",
    entityType: "CannedReply",
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath("/settings");
}

/* -------------------------------------------------------------------------
 * Ticket links
 * ---------------------------------------------------------------------- */

export async function linkTicketsAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.link", "ticket:update");

  const sourceTicketId = stringValue(formData, "sourceTicketId");
  const targetTicketId = stringValue(formData, "targetTicketId");
  const linkType = stringValue(formData, "linkType") as TicketLinkType;

  if (!TICKET_LINK_TYPES.includes(linkType)) {
    throw new ActionError("Unknown link type.");
  }

  // Both ends must be inside the caller's organization. Checking only the
  // source would let someone paste another tenant's ticket id into the
  // target field and confirm it exists by whether the link succeeded.
  const [source, target] = await Promise.all([
    prisma.ticket.findFirst({ where: { id: sourceTicketId, organizationId: user.organizationId } }),
    prisma.ticket.findFirst({ where: { id: targetTicketId, organizationId: user.organizationId } })
  ]);
  assertCanAccessRecord(user, source, "Ticket");
  assertCanAccessRecord(user, target, "Linked ticket");

  const existingLinks = await prisma.ticketLink.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { sourceTicketId, targetTicketId },
        { sourceTicketId: targetTicketId, targetTicketId: sourceTicketId }
      ]
    },
    select: { sourceTicketId: true, targetTicketId: true, linkType: true }
  });

  const validation = validateTicketLink({ sourceTicketId, targetTicketId, linkType, existingLinks });
  if (!validation.ok) {
    throw new ActionError(validation.reason);
  }

  const link = await prisma.ticketLink.create({
    data: {
      organizationId: user.organizationId,
      sourceTicketId,
      targetTicketId,
      linkType,
      note: optionalStringValue(formData, "note"),
      createdById: user.id
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "ticket.linked",
    entityType: "Ticket",
    entityId: sourceTicketId,
    after: { linkId: link.id, linkType, targetTicketId },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  // Both pages change, because the link is visible from either end.
  revalidatePath(`/tickets/${sourceTicketId}`);
  revalidatePath(`/tickets/${targetTicketId}`);
}

export async function unlinkTicketsAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.unlink", "ticket:update");

  const linkId = stringValue(formData, "linkId");
  const link = await prisma.ticketLink.findFirst({ where: { id: linkId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, link, "Ticket link");

  await prisma.ticketLink.delete({ where: { id: linkId } });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "ticket.unlinked",
    entityType: "Ticket",
    entityId: link.sourceTicketId,
    before: { linkId, linkType: link.linkType, targetTicketId: link.targetTicketId },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/tickets/${link.sourceTicketId}`);
  revalidatePath(`/tickets/${link.targetTicketId}`);
}

/* -------------------------------------------------------------------------
 * Bulk triage
 * ---------------------------------------------------------------------- */

export async function bulkUpdateTicketsAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("ticket.bulk_update", "ticket:update");

  const ticketIds = formData.getAll("ticketIds").map((value) => String(value)).filter(Boolean);
  if (ticketIds.length === 0) {
    // Submitting an empty selection is a mis-click, not an error worth an
    // error page.
    return;
  }
  if (ticketIds.length > MAX_BULK_TICKETS) {
    throw new ActionError(`Select at most ${MAX_BULK_TICKETS} tickets at once.`);
  }

  const nextStatus = optionalStringValue(formData, "status") as TicketStatus | null;
  const assignedUserId = optionalStringValue(formData, "assignedUserId");
  const nextPriority = optionalStringValue(formData, "priority") as TicketPriority | null;
  if (!nextStatus && !assignedUserId && !nextPriority) {
    throw new ActionError("Choose a status, assignee, or priority to apply.");
  }
  if (assignedUserId) {
    await assertScopedUser(user, assignedUserId);
  }

  // Scoped read. Ids that belong to another organization simply do not come
  // back, so a hand-edited form silently affects nothing rather than
  // reporting whether those ids exist.
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, organizationId: user.organizationId },
    select: { id: true, status: true, priority: true, assignedUserId: true, createdAt: true, slaPausedAt: true, slaPausedTotalMs: true }
  });

  const plan = nextStatus
    ? planBulkStatusChange(tickets, nextStatus)
    : { applied: tickets.map((ticket) => ticket.id), rejected: [] as Array<{ ticketId: string; reason: string }> };

  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  // Best-effort, one row at a time, rather than a single updateMany. Two
  // reasons: each ticket needs its own SLA pause bookkeeping, and the audit
  // trail has to stay queryable by entityId — a batch-level event would be
  // invisible when someone asks "what happened to this ticket".
  for (const ticketId of plan.applied) {
    const before = byId.get(ticketId);
    if (!before) continue;

    const slaPause = nextStatus
      ? applySlaPauseTransition({
          from: before.status,
          to: nextStatus,
          slaPausedAt: before.slaPausedAt,
          slaPausedTotalMs: before.slaPausedTotalMs
        })
      : { slaPausedAt: before.slaPausedAt, slaPausedTotalMs: before.slaPausedTotalMs };

    const after = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus ?? undefined,
        priority: nextPriority ?? undefined,
        assignedUserId: assignedUserId ?? undefined,
        slaPausedAt: slaPause.slaPausedAt,
        slaPausedTotalMs: slaPause.slaPausedTotalMs,
        resolvedAt:
          nextStatus === "RESOLVED" || nextStatus === "CLOSED"
            ? new Date()
            : nextStatus
              ? null
              : undefined,
        slaDueAt: nextPriority && nextPriority !== before.priority ? calculateSlaDueAt(nextPriority, before.createdAt) : undefined
      }
    });

    await writeAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: nextStatus && nextStatus !== before.status ? "ticket.status_changed" : "ticket.updated",
      entityType: "Ticket",
      entityId: ticketId,
      before: { status: before.status, priority: before.priority, assignedUserId: before.assignedUserId },
      after: { status: after.status, priority: after.priority, assignedUserId: after.assignedUserId },
      // The shared requestContextId is what ties these events back together
      // as one operator action despite being separate rows.
      metadata: { actorRole: user.role, bulk: true, batchSize: plan.applied.length },
      requestContextId: requestContext.requestContextId
    });
  }

  logOperationalEvent({
    event: "ticket.bulk_update.completed",
    requestContextId: requestContext.requestContextId,
    organizationId: user.organizationId,
    applied: plan.applied.length,
    rejected: plan.rejected.length
  });

  revalidatePath("/tickets");

  // The outcome is reported by redirecting with a summary in the query
  // string. Server actions cannot return a value to a plain HTML form, and
  // silently applying 14 of 16 changes would be worse than saying so.
  const params = new URLSearchParams();
  params.set("applied", String(plan.applied.length));
  if (plan.rejected.length > 0) {
    params.set("skipped", String(plan.rejected.length));
    params.set("skippedReason", plan.rejected[0].reason);
  }
  redirect(`/tickets?${params.toString()}`);
}

export async function runDuplicateDetectionAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("agent.duplicate_detection.queue", "agent:run");

  const ticketId = stringValue(formData, "ticketId");
  const ticket = await prisma.ticket.findFirstOrThrow({
    where: { id: ticketId, organizationId: user.organizationId }
  });

  // Candidates are deliberately narrow: same org, still open, not this
  // ticket, raised in the last 30 days, capped at 50. A duplicate of
  // something closed last quarter is history, not a triage decision.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.ticket.findMany({
    where: {
      organizationId: user.organizationId,
      id: { not: ticketId },
      status: { notIn: ["RESOLVED", "CLOSED"] },
      createdAt: { gte: since }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const input = {
    ticket: {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      customerName: ticket.customerName,
      createdAt: ticket.createdAt.toISOString(),
      incidentId: ticket.incidentId,
      tags: ticket.tags
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      category: candidate.category,
      customerName: candidate.customerName,
      status: candidate.status,
      createdAt: candidate.createdAt.toISOString(),
      incidentId: candidate.incidentId,
      tags: candidate.tags
    }))
  };

  const run = await queueAgentRun({
    agentType: "DUPLICATE_DETECTION",
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

/* -------------------------------------------------------------------------
 * Saved views
 * ---------------------------------------------------------------------- */

export async function createSavedViewAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("view.create", "ticket:update");

  const resource = stringValue(formData, "resource") as SavedViewResource;
  const parsed = savedViewSchema.parse({
    name: stringValue(formData, "name"),
    resource,
    // Sanitise before validating: the raw string is whatever the user was
    // looking at, and only the allowlisted part of it is ours to keep.
    queryString: sanitizeViewQuery(resource, stringValue(formData, "queryString")),
    isShared: formData.get("isShared") === "on"
  });

  const existing = await prisma.savedView.findFirst({
    where: { ownerId: user.id, resource: parsed.resource, name: parsed.name },
    select: { id: true }
  });
  if (existing) {
    throw new ActionError(`You already have a view named "${parsed.name}" for ${parsed.resource}.`);
  }

  const view = await prisma.savedView.create({
    data: {
      organizationId: user.organizationId,
      ownerId: user.id,
      name: parsed.name,
      resource: parsed.resource,
      queryString: parsed.queryString,
      isShared: parsed.isShared
    }
  });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "view.created",
    entityType: "SavedView",
    entityId: view.id,
    after: { name: view.name, resource: view.resource, isShared: view.isShared, queryString: view.queryString },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/${parsed.resource}`);
}

export async function deleteSavedViewAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("view.delete", "ticket:update");

  const viewId = stringValue(formData, "viewId");
  const view = await prisma.savedView.findFirst({ where: { id: viewId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, view, "Saved view");

  // Org membership is not enough — a shared view still belongs to whoever
  // made it, so a colleague cannot delete what the team depends on.
  if (!canEditSavedView(user, view)) {
    throw new ActionError("Only the owner of a view can delete it.");
  }

  await prisma.savedView.delete({ where: { id: viewId } });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "view.deleted",
    entityType: "SavedView",
    entityId: viewId,
    before: { name: view.name, resource: view.resource, isShared: view.isShared },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/${view.resource}`);
}

export async function toggleSavedViewSharedAction(formData: FormData) {
  const { user, requestContext } = await requireActionUser("view.share", "ticket:update");

  const viewId = stringValue(formData, "viewId");
  const view = await prisma.savedView.findFirst({ where: { id: viewId, organizationId: user.organizationId } });
  assertCanAccessRecord(user, view, "Saved view");
  if (!canEditSavedView(user, view)) {
    throw new ActionError("Only the owner of a view can share it.");
  }

  const after = await prisma.savedView.update({ where: { id: viewId }, data: { isShared: !view.isShared } });

  await writeAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "view.shared",
    entityType: "SavedView",
    entityId: viewId,
    before: { isShared: view.isShared },
    after: { isShared: after.isShared },
    metadata: { actorRole: user.role },
    requestContextId: requestContext.requestContextId
  });

  revalidatePath(`/${view.resource}`);
}
