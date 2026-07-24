import type { UserRole } from "@agentdesk/shared";

export type Capability =
  | "ticket:create"
  | "ticket:update"
  | "ticket:delete"
  | "incident:create"
  | "incident:update"
  | "job:retry"
  | "job:dead-letter"
  | "agent:run"
  | "audit:view";

const capabilitiesByRole: Record<UserRole, Capability[]> = {
  ADMIN: [
    "ticket:create",
    "ticket:update",
    "ticket:delete",
    "incident:create",
    "incident:update",
    "job:retry",
    "job:dead-letter",
    "agent:run",
    "audit:view"
  ],
  SUPPORT_AGENT: ["ticket:create", "ticket:update", "incident:create", "agent:run", "audit:view"],
  ENGINEERING: ["ticket:update", "incident:create", "incident:update", "job:retry", "job:dead-letter", "agent:run", "audit:view"],
  MANAGER: ["ticket:create", "ticket:update", "incident:create", "incident:update", "agent:run", "audit:view"],
  VIEWER: ["audit:view"]
};

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return capabilitiesByRole[role].includes(capability);
}

export function requireCapability(role: UserRole, capability: Capability): void {
  if (!hasCapability(role, capability)) {
    throw new Error(`Role ${role} cannot perform ${capability}`);
  }
}
