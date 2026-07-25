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
  | "audit:view"
  // Authoring shared reply templates is an editorial act — the text goes out
  // under the company's name to customers the author may never see — so it
  // sits with ADMIN and MANAGER rather than with everyone who can comment.
  | "canned_reply:manage";

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
    "audit:view",
    "canned_reply:manage"
  ],
  SUPPORT_AGENT: ["ticket:create", "ticket:update", "incident:create", "agent:run", "audit:view"],
  ENGINEERING: ["ticket:update", "incident:create", "incident:update", "job:retry", "job:dead-letter", "agent:run", "audit:view"],
  MANAGER: ["ticket:create", "ticket:update", "incident:create", "incident:update", "agent:run", "audit:view", "canned_reply:manage"],
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
