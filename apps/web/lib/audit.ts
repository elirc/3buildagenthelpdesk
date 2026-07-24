import { prisma } from "@agentdesk/db";
import { Prisma } from "@prisma/client";
import { redactSensitiveMetadata, type AuditAction } from "@agentdesk/observability";
import { logOperationalEvent } from "./request-context";

export async function writeAuditEvent(params: {
  organizationId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  requestContextId?: string | null;
}) {
  const event = await prisma.auditEvent.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before ? (redactSensitiveMetadata(params.before) as Prisma.InputJsonValue) : undefined,
      after: params.after ? (redactSensitiveMetadata(params.after) as Prisma.InputJsonValue) : undefined,
      metadata: redactSensitiveMetadata(params.metadata ?? {}) as Prisma.InputJsonValue,
      requestContextId: params.requestContextId ?? null
    }
  });

  logOperationalEvent({
    event: "audit.write",
    requestContextId: params.requestContextId ?? null,
    organizationId: params.organizationId,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId
  });

  return event;
}
