import type { UserRole } from "@agentdesk/shared";

export type ScopedUser = {
  id: string;
  role: UserRole;
  organizationId: string;
};

export type ScopedRecord = {
  organizationId: string;
};

export function canAccessOrganization(user: ScopedUser, organizationId: string): boolean {
  return user.organizationId === organizationId;
}

export function assertCanAccessRecord(user: ScopedUser, record: ScopedRecord | null | undefined, entityName: string): asserts record is ScopedRecord {
  if (!record || !canAccessOrganization(user, record.organizationId)) {
    throw new Error(`${entityName} was not found or is outside the active organization.`);
  }
}

export function scopedWhere<TWhere extends Record<string, unknown>>(user: ScopedUser, where?: TWhere): TWhere & { organizationId: string } {
  return {
    ...(where ?? {}),
    organizationId: user.organizationId
  } as TWhere & { organizationId: string };
}

