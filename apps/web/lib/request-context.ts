import { randomUUID } from "node:crypto";
import type { UserRole } from "@agentdesk/shared";

export type RequestContext = {
  requestContextId: string;
  action: string;
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  organizationId?: string | null;
};

export function createRequestContext(
  action: string,
  user?: { id: string; role: UserRole; organizationId: string } | null
): RequestContext {
  return {
    requestContextId: randomUUID(),
    action,
    actorUserId: user?.id ?? null,
    actorRole: user?.role ?? null,
    organizationId: user?.organizationId ?? null
  };
}

export function logOperationalEvent(event: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    })
  );
}

