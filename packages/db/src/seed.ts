import { Prisma, PrismaClient } from "@prisma/client";
import { createLogFingerprint, calculateFirstResponseDueAt, calculateSlaDueAt } from "@agentdesk/domain";
import { runRegisteredAgent } from "@agentdesk/agents";
import type { AgentTargetType, AgentType } from "@agentdesk/shared";

const prisma = new PrismaClient();

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

async function reset() {
  await prisma.auditEvent.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.structuredLog.deleteMany();
  await prisma.ticketComment.deleteMany();
  // After ticketComment: comments carry a nullable cannedReplyId, so the
  // templates cannot go first without tripping the foreign key.
  await prisma.ticketArticleLink.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.cannedReply.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.organization.deleteMany();
}

async function createAgentRun(params: {
  organizationId: string;
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  input: Record<string, unknown>;
  createdByUserId: string;
}) {
  const startedAt = hoursAgo(2);
  const result = runRegisteredAgent(params.agentType, {
    targetType: params.targetType,
    targetId: params.targetId,
    input: params.input
  });

  return prisma.agentRun.create({
    data: {
      organizationId: params.organizationId,
      agentType: params.agentType,
      status: "SUCCEEDED",
      targetType: params.targetType,
      targetId: params.targetId,
      inputSnapshot: params.input as Prisma.InputJsonValue,
      output: result as unknown as Prisma.InputJsonValue,
      confidenceScore: result.confidenceScore,
      trace: result.trace as unknown as Prisma.InputJsonValue,
      startedAt,
      completedAt: new Date(startedAt.getTime() + 1200),
      createdByUserId: params.createdByUserId
    }
  });
}

async function main() {
  await reset();

  const primaryOrg = await prisma.organization.create({ data: { name: "AgentDesk Internal", slug: "agentdesk-internal" } });
  const secondaryOrg = await prisma.organization.create({ data: { name: "Beta Enterprise", slug: "beta-enterprise" } });

  const supportTeam = await prisma.team.create({ data: { organizationId: primaryOrg.id, name: "Customer Support", slug: "support" } });
  const engineeringTeam = await prisma.team.create({ data: { organizationId: primaryOrg.id, name: "Product Engineering", slug: "engineering" } });
  const opsTeam = await prisma.team.create({ data: { organizationId: primaryOrg.id, name: "Operations", slug: "operations" } });
  const revenueTeam = await prisma.team.create({ data: { organizationId: primaryOrg.id, name: "Revenue Operations", slug: "revenue-ops" } });
  const secondarySupportTeam = await prisma.team.create({ data: { organizationId: secondaryOrg.id, name: "Beta Support", slug: "support" } });

  const admin = await prisma.user.create({
    data: { organizationId: primaryOrg.id, name: "Alex Admin", email: "admin@agentdesk.local", role: "ADMIN", teamId: opsTeam.id }
  });
  const support = await prisma.user.create({
    data: { organizationId: primaryOrg.id, name: "Maya Support", email: "maya.support@agentdesk.local", role: "SUPPORT_AGENT", teamId: supportTeam.id }
  });
  const engineer = await prisma.user.create({
    data: { organizationId: primaryOrg.id, name: "Ethan Engineering", email: "ethan.eng@agentdesk.local", role: "ENGINEERING", teamId: engineeringTeam.id }
  });
  const manager = await prisma.user.create({
    data: { organizationId: primaryOrg.id, name: "Nina Manager", email: "nina.manager@agentdesk.local", role: "MANAGER", teamId: opsTeam.id }
  });
  await prisma.user.create({
    data: { organizationId: primaryOrg.id, name: "Victor Viewer", email: "victor.viewer@agentdesk.local", role: "VIEWER", teamId: supportTeam.id }
  });
  const secondarySupport = await prisma.user.create({
    data: { organizationId: secondaryOrg.id, name: "Bianca Beta", email: "support@beta.example", role: "SUPPORT_AGENT", teamId: secondarySupportTeam.id }
  });

  const authIncident = await prisma.incident.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Authentication degradation affecting SSO login",
      description:
        "Multiple enterprise customers are experiencing intermittent login failures. Auth service latency and timeout errors increased after the morning deploy.",
      status: "INVESTIGATING",
      severity: "SEV2",
      affectedService: "auth-service",
      startedAt: hoursAgo(5),
      ownerId: engineer.id,
      agentFindings: {
        headline: "Auth timeout fingerprint is repeating in production.",
        recommendedAction: "Keep incident open while engineering validates connection pool saturation."
      }
    }
  });

  const integrationIncident = await prisma.incident.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Webhook provider elevated latency",
      description:
        "Webhook delivery jobs are retrying due to vendor gateway timeouts. Customer-facing impact is delayed notification delivery.",
      status: "MONITORING",
      severity: "SEV3",
      affectedService: "webhook-worker",
      startedAt: hoursAgo(26),
      ownerId: engineer.id
    }
  });

  const authTicket = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Acme users cannot log in with SSO",
      description:
        "Several Acme Corp users report the login page spins and then fails. This is blocking production access for their finance team. Started around 09:20 UTC. Request ids are req-auth-1001 and req-auth-1002.",
      customerName: "Acme Corp",
      requesterEmail: "it-admin@acme.example",
      status: "ESCALATED",
      priority: "CRITICAL",
      category: "ACCESS",
      assignedTeamId: engineeringTeam.id,
      assignedUserId: engineer.id,
      incidentId: authIncident.id,
      slaDueAt: calculateSlaDueAt("CRITICAL", hoursAgo(4)),
      firstResponseDueAt: calculateFirstResponseDueAt("CRITICAL", hoursAgo(4)),
      firstRespondedAt: hoursAgo(3.8),
      tags: ["sso", "production", "incident"],
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(1)
    }
  });

  const authTicketTwo = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Globex login failures after password reset",
      description:
        "Users at Globex cannot access the app after password reset. They see intermittent timeout errors. No screenshots yet, but this appears related to production auth.",
      customerName: "Globex",
      requesterEmail: "ops@globex.example",
      status: "TRIAGE",
      priority: "HIGH",
      category: "ACCESS",
      assignedTeamId: supportTeam.id,
      assignedUserId: support.id,
      incidentId: authIncident.id,
      slaDueAt: hoursFromNow(3),
      // Raised three hours ago at HIGH (2h response target) and still
      // unanswered — the case the dashboard metric exists to surface.
      firstResponseDueAt: calculateFirstResponseDueAt("HIGH", hoursAgo(3)),
      tags: ["login", "auth"],
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(0.5)
    }
  });

  const webhookTicket = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Webhook delivery delays for partner integration",
      description:
        "Northstar Health reports webhooks are delayed by 20-30 minutes. Their integration retries are stacking up and downstream billing sync is behind.",
      customerName: "Northstar Health",
      requesterEmail: "platform@northstar.example",
      status: "IN_PROGRESS",
      priority: "HIGH",
      category: "INTEGRATION",
      assignedTeamId: engineeringTeam.id,
      assignedUserId: engineer.id,
      incidentId: integrationIncident.id,
      slaDueAt: hoursFromNow(6),
      tags: ["webhook", "integration"],
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(1)
    }
  });

  const billingTicket = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Invoice total does not match contract",
      description:
        "Customer says May invoice includes seats that were removed last month. Need help reconciling contract terms and billing system sync.",
      customerName: "Initech",
      requesterEmail: "finance@initech.example",
      status: "WAITING_ON_CUSTOMER",
      priority: "MEDIUM",
      category: "BILLING",
      assignedTeamId: revenueTeam.id,
      assignedUserId: support.id,
      slaDueAt: hoursFromNow(16),
      // Currently paused: we asked the customer for their order form two
      // hours ago and the clock has been stopped since. Gives the SLA
      // pause feature something to show without any clicking.
      slaPausedAt: hoursAgo(2),
      slaPausedTotalMs: 90 * 60 * 1000,
      tags: ["billing", "invoice"],
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(2)
    }
  });

  const performanceTicket = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Reports page timing out for large export",
      description:
        "Customer export job fails for reports over 100k rows. Browser shows a 504 after two minutes. They can reproduce consistently in production.",
      customerName: "Umbrella Analytics",
      requesterEmail: "admin@umbrella.example",
      status: "TRIAGE",
      priority: "MEDIUM",
      category: "PERFORMANCE",
      assignedTeamId: supportTeam.id,
      assignedUserId: support.id,
      slaDueAt: hoursFromNow(20),
      tags: ["reports", "timeout"],
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(4)
    }
  });

  const closedTicket = await prisma.ticket.create({
    data: {
      organizationId: primaryOrg.id,
      title: "Add user to workspace",
      description: "Requester needed a new teammate added to the workspace. Access was granted after manager approval.",
      customerName: "Soylent Systems",
      requesterEmail: "help@soylent.example",
      status: "RESOLVED",
      priority: "LOW",
      category: "ACCESS",
      assignedTeamId: supportTeam.id,
      assignedUserId: support.id,
      slaDueAt: hoursAgo(24),
      resolvedAt: hoursAgo(20),
      // Resolved four hours after the original deadline, but six of those
      // hours were spent waiting on the requester. Against the raw
      // deadline this reads as a breach; against the effective one the SLA
      // was met. A worked example of why the pause is tracked at all.
      slaPausedTotalMs: 6 * 60 * 60 * 1000,
      tags: ["access"],
      createdAt: hoursAgo(50),
      updatedAt: hoursAgo(20)
    }
  });

  await prisma.ticket.create({
    data: {
      organizationId: secondaryOrg.id,
      title: "Beta workspace invite issue",
      description: "Beta Enterprise cannot invite a contractor to a workspace. This record exists to verify tenant isolation in list and detail views.",
      customerName: "Beta Enterprise",
      requesterEmail: "ops@beta.example",
      status: "TRIAGE",
      priority: "LOW",
      category: "ACCESS",
      assignedTeamId: secondarySupportTeam.id,
      assignedUserId: secondarySupport.id,
      slaDueAt: hoursFromNow(30),
      tags: ["tenant-isolation", "access"],
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(1)
    }
  });

  await prisma.ticketComment.createMany({
    data: [
      {
        ticketId: authTicket.id,
        authorId: support.id,
        body: "Customer says finance team is fully blocked. Linked to SEV2 auth incident and escalated to engineering.",
        isInternal: true,
        createdAt: hoursAgo(3.5)
      },
      {
        ticketId: authTicket.id,
        authorId: engineer.id,
        body: "Auth-service logs show repeated pool timeout fingerprint. Checking deploy diff and database connection usage.",
        isInternal: true,
        createdAt: hoursAgo(2.8)
      },
      {
        ticketId: billingTicket.id,
        authorId: support.id,
        body: "Asked customer for signed order form and seat removal confirmation timestamp.",
        isInternal: false,
        createdAt: hoursAgo(3)
      },
      {
        ticketId: performanceTicket.id,
        authorId: support.id,
        body: "Need export id and approximate report filters to reproduce.",
        isInternal: true,
        createdAt: hoursAgo(4)
      }
    ]
  });

  // Three templates covering the shapes that matter: one scoped to a
  // category, one that applies everywhere, and one already retired so the
  // active/inactive distinction is visible without clicking anything.
  await prisma.cannedReply.createMany({
    data: [
      {
        organizationId: primaryOrg.id,
        title: "Acknowledge and request reproduction steps",
        body:
          "Hi {{customerName}},\n\nThanks for reporting \"{{ticketTitle}}\". We are looking into it now.\n\nTo help us reproduce it, could you send the approximate time it started, the account or workspace affected, and a screenshot if you have one?\n\nWe will update you by {{slaDueAt}}.\n\n{{agentName}}",
        category: "BUG",
        createdById: manager.id,
        usageCount: 4
      },
      {
        organizationId: primaryOrg.id,
        title: "Incident acknowledgement",
        body:
          "Hi {{customerName}},\n\nWe are aware of the issue affecting your service and engineering is actively investigating. Your ticket {{ticketId}} is linked to the incident and we will update you by {{slaDueAt}}.\n\n{{agentName}}",
        category: null,
        createdById: manager.id,
        usageCount: 7
      },
      {
        organizationId: primaryOrg.id,
        title: "Legacy billing apology (retired)",
        body:
          "Hi {{customerName}}, we are sorry about the invoice discrepancy and have escalated it to our billing team.",
        category: "BILLING",
        isActive: false,
        createdById: admin.id,
        usageCount: 12
      }
    ]
  });

  await prisma.knowledgeArticle.createMany({
    data: [
      {
        organizationId: primaryOrg.id,
        title: "Troubleshooting SSO and SAML login failures",
        summary:
          "How to diagnose SSO login failures: check auth-service latency, SAML assertion validation, and recent deploys.",
        body:
          "1. Confirm the scope: one tenant or all?\n2. Check auth-service error logs for assertion timeouts.\n3. Compare against the most recent deploy window.\n4. If the connection pool is saturated, escalate to engineering.",
        category: "ACCESS",
        tags: ["sso", "auth"],
        status: "PUBLISHED",
        authorId: engineer.id,
        publishedAt: hoursAgo(200),
        linkCount: 3
      },
      {
        organizationId: primaryOrg.id,
        title: "Reconciling invoice and contract seat counts",
        summary: "Steps for resolving billing disputes where the invoice seat count does not match the signed order.",
        body:
          "Ask for the signed order form and the seat removal timestamp, then compare against the billing sync log for that contract.",
        category: "BILLING",
        tags: ["billing", "invoice"],
        status: "PUBLISHED",
        authorId: support.id,
        publishedAt: hoursAgo(500)
      },
      {
        organizationId: primaryOrg.id,
        title: "Draft: webhook retry policy",
        summary: "Work in progress note about how webhook retries are scheduled and when to dead-letter them.",
        body:
          "Placeholder while the backoff behaviour settles. Not published, so it is deliberately absent from ticket suggestions.",
        category: "INTEGRATION",
        tags: ["webhook"],
        status: "DRAFT",
        authorId: engineer.id
      }
    ]
  });

  const logInputs = [
    {
      service: "auth-service",
      environment: "production" as const,
      level: "info" as const,
      message: "SSO login request accepted for tenant acme",
      requestId: "req-auth-1000",
      ticketId: authTicket.id,
      incidentId: authIncident.id,
      timestamp: hoursAgo(5)
    },
    ...Array.from({ length: 7 }).map((_, index) => ({
      service: "auth-service",
      environment: "production" as const,
      level: index === 6 ? ("fatal" as const) : ("error" as const),
      message: "Auth provider timeout while validating SAML assertion",
      requestId: `req-auth-100${index + 1}`,
      ticketId: index < 4 ? authTicket.id : authTicketTwo.id,
      incidentId: authIncident.id,
      timestamp: hoursAgo(4.8 - index * 0.2),
      metadata: { tenant: index < 4 ? "acme" : "globex", durationMs: 5100 + index * 320 }
    })),
    {
      service: "auth-service",
      environment: "production" as const,
      level: "warn" as const,
      message: "Permission lookup exceeded latency budget for tenant globex",
      requestId: "req-auth-2010",
      ticketId: authTicketTwo.id,
      incidentId: authIncident.id,
      timestamp: hoursAgo(2.5)
    },
    {
      service: "billing-api",
      environment: "production" as const,
      level: "warn" as const,
      message: "Invoice reconciliation mismatch for contract initech-2026",
      requestId: "req-bill-77",
      ticketId: billingTicket.id,
      timestamp: hoursAgo(7),
      metadata: { expectedSeats: 120, billedSeats: 137 }
    },
    {
      service: "webhook-worker",
      environment: "production" as const,
      level: "error" as const,
      message: "Webhook delivery timed out after 10000ms",
      requestId: "req-hook-900",
      ticketId: webhookTicket.id,
      incidentId: integrationIncident.id,
      timestamp: hoursAgo(18),
      metadata: { provider: "partner-gateway", attempt: 3 }
    },
    {
      service: "webhook-worker",
      environment: "production" as const,
      level: "error" as const,
      message: "Webhook delivery timed out after 10000ms",
      requestId: "req-hook-901",
      ticketId: webhookTicket.id,
      incidentId: integrationIncident.id,
      timestamp: hoursAgo(17.5),
      metadata: { provider: "partner-gateway", attempt: 4 }
    },
    {
      service: "reports-api",
      environment: "production" as const,
      level: "error" as const,
      message: "Database timeout while streaming report export",
      requestId: "req-report-42",
      ticketId: performanceTicket.id,
      timestamp: hoursAgo(8.5),
      metadata: { rows: 124000, timeoutMs: 120000 }
    },
    {
      service: "worker",
      environment: "staging" as const,
      level: "warn" as const,
      message: "Queue processing lag is above warning threshold",
      requestId: "req-worker-12",
      timestamp: hoursAgo(16)
    },
    {
      service: "auth-service",
      environment: "development" as const,
      level: "debug" as const,
      message: "Local token refresh succeeded",
      requestId: "req-dev-1",
      timestamp: hoursAgo(1)
    }
  ];

  const logs = [];
  for (const log of logInputs) {
    logs.push(
      await prisma.structuredLog.create({
        data: {
          timestamp: log.timestamp,
          organizationId: primaryOrg.id,
          service: log.service,
          environment: log.environment,
          level: log.level,
          message: log.message,
          requestId: log.requestId,
          ticketId: log.ticketId ?? null,
          incidentId: log.incidentId ?? null,
          metadata: log.metadata ?? {},
          fingerprint: createLogFingerprint({ service: log.service, level: log.level, message: log.message })
        }
      })
    );
  }

  const webhookJob = await prisma.backgroundJob.create({
    data: {
      organizationId: primaryOrg.id,
      type: "WEBHOOK_DELIVERY",
      status: "FAILED",
      attempts: 3,
      maxAttempts: 5,
      payload: { endpoint: "https://partner.example/hooks/northstar", eventType: "invoice.updated", tenant: "northstar" },
      errorMessage: "Webhook timeout after 10000ms",
      startedAt: hoursAgo(1.5),
      finishedAt: hoursAgo(1.4),
      relatedTicketId: webhookTicket.id,
      relatedIncidentId: integrationIncident.id,
      createdAt: hoursAgo(18)
    }
  });

  const slaJob = await prisma.backgroundJob.create({
    data: {
      organizationId: primaryOrg.id,
      type: "SLA_ESCALATION",
      status: "FAILED",
      attempts: 5,
      maxAttempts: 5,
      payload: { ticketId: authTicket.id, targetChannel: "engineering-oncall" },
      errorMessage: "Webhook timeout notifying escalation channel",
      startedAt: hoursAgo(2),
      finishedAt: hoursAgo(1.95),
      relatedTicketId: authTicket.id,
      relatedIncidentId: authIncident.id,
      createdAt: hoursAgo(4)
    }
  });

  await prisma.backgroundJob.createMany({
    data: [
      {
        organizationId: primaryOrg.id,
        type: "EMAIL_NOTIFICATION",
        status: "FAILED",
        attempts: 2,
        maxAttempts: 3,
        payload: { to: "", template: "ticket-update", ticketId: billingTicket.id },
        errorMessage: "Invalid payload: recipient email is required",
        relatedTicketId: billingTicket.id,
        createdAt: hoursAgo(3)
      },
      {
        organizationId: primaryOrg.id,
        type: "DATA_SYNC",
        status: "DEAD_LETTERED",
        attempts: 4,
        maxAttempts: 4,
        payload: { customerId: "umbrella", exportId: null },
        errorMessage: "Malformed JSON payload for export sync",
        relatedTicketId: performanceTicket.id,
        createdAt: hoursAgo(6)
      },
      {
        organizationId: primaryOrg.id,
        type: "REPORT_GENERATION",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        payload: { reportType: "weekly-ops", requestedBy: manager.id },
        startedAt: hoursAgo(0.2),
        createdAt: hoursAgo(0.3)
      },
      {
        organizationId: primaryOrg.id,
        type: "AGENT_RUN",
        status: "SUCCEEDED",
        attempts: 1,
        maxAttempts: 1,
        payload: { agentType: "LOG_ANOMALY_DETECTION", targetId: authIncident.id },
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(1.99),
        relatedIncidentId: authIncident.id,
        createdAt: hoursAgo(2)
      },
      {
        organizationId: primaryOrg.id,
        type: "EMAIL_NOTIFICATION",
        status: "FAILED",
        attempts: 1,
        maxAttempts: 3,
        payload: { to: "it-admin@acme.example", template: "incident-update" },
        errorMessage: "Email provider returned 429 rate limit",
        relatedTicketId: authTicket.id,
        relatedIncidentId: authIncident.id,
        createdAt: hoursAgo(1)
      },
      {
        organizationId: primaryOrg.id,
        type: "WEBHOOK_DELIVERY",
        status: "FAILED",
        attempts: 3,
        maxAttempts: 3,
        payload: { endpoint: "https://secure.example/hook", eventType: "user.login.failed" },
        errorMessage: "Permission denied: missing webhook signing secret",
        relatedIncidentId: authIncident.id,
        createdAt: hoursAgo(0.8)
      }
    ]
  });

  const authLogs = logs.filter((log) => log.service === "auth-service" && log.environment === "production");
  await createAgentRun({
    organizationId: primaryOrg.id,
    agentType: "TICKET_SUMMARIZATION",
    targetType: "TICKET",
    targetId: authTicket.id,
    createdByUserId: support.id,
    input: {
      title: authTicket.title,
      description: authTicket.description,
      priority: authTicket.priority,
      category: authTicket.category,
      linkedIncident: { id: authIncident.id, title: authIncident.title, severity: authIncident.severity },
      linkedLogs: authLogs.map((log) => ({
        level: log.level,
        message: log.message,
        service: log.service,
        fingerprint: log.fingerprint
      })),
      comments: [
        {
          body: "Customer says finance team is fully blocked. Linked to SEV2 auth incident and escalated to engineering.",
          isInternal: true
        }
      ]
    }
  });

  await createAgentRun({
    organizationId: primaryOrg.id,
    agentType: "LOG_ANOMALY_DETECTION",
    targetType: "LOG_GROUP",
    targetId: "auth-service:production",
    createdByUserId: engineer.id,
    input: {
      service: "auth-service",
      logs: authLogs.map((log) => ({
        service: log.service,
        environment: log.environment,
        level: log.level,
        message: log.message,
        fingerprint: log.fingerprint,
        timestamp: log.timestamp.toISOString()
      }))
    }
  });

  await createAgentRun({
    organizationId: primaryOrg.id,
    agentType: "FAILED_JOB_INVESTIGATION",
    targetType: "JOB",
    targetId: slaJob.id,
    createdByUserId: engineer.id,
    input: {
      id: slaJob.id,
      type: slaJob.type,
      status: slaJob.status,
      attempts: slaJob.attempts,
      maxAttempts: slaJob.maxAttempts,
      payload: slaJob.payload as Record<string, unknown>,
      errorMessage: slaJob.errorMessage,
      relatedLogs: logs
        .filter((log) => log.incidentId === authIncident.id)
        .slice(0, 4)
        .map((log) => ({ level: log.level, message: log.message, service: log.service })),
      relatedTicket: { id: authTicket.id, title: authTicket.title },
      relatedIncident: { id: authIncident.id, title: authIncident.title, severity: authIncident.severity }
    }
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        organizationId: primaryOrg.id,
        actorUserId: support.id,
        action: "ticket.created",
        entityType: "Ticket",
        entityId: authTicket.id,
        after: { status: "NEW", priority: "CRITICAL" },
        metadata: { source: "seed" },
        createdAt: hoursAgo(4)
      },
      {
        organizationId: primaryOrg.id,
        actorUserId: support.id,
        action: "ticket.escalated",
        entityType: "Ticket",
        entityId: authTicket.id,
        before: { status: "TRIAGE" },
        after: { status: "ESCALATED", assignedTeamId: engineeringTeam.id },
        metadata: { reason: "Linked production incident" },
        createdAt: hoursAgo(3.7)
      },
      {
        organizationId: primaryOrg.id,
        actorUserId: engineer.id,
        action: "incident.created",
        entityType: "Incident",
        entityId: authIncident.id,
        after: { severity: "SEV2", status: "INVESTIGATING" },
        metadata: { source: "seed" },
        createdAt: hoursAgo(5)
      },
      {
        organizationId: primaryOrg.id,
        actorUserId: engineer.id,
        action: "job.retried",
        entityType: "BackgroundJob",
        entityId: webhookJob.id,
        before: { attempts: 2 },
        after: { attempts: 3 },
        metadata: { reason: "Vendor timeout looked transient" },
        createdAt: hoursAgo(1.5)
      },
      {
        organizationId: primaryOrg.id,
        actorUserId: engineer.id,
        action: "agent.run_completed",
        entityType: "AgentRun",
        entityId: "seeded-agent-runs",
        after: { count: 3 },
        metadata: { source: "seed" },
        createdAt: hoursAgo(1.9)
      }
    ]
  });

  console.log("Seed complete: users, teams, tickets, incidents, logs, jobs, audit events, and agent runs created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
