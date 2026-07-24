export const USER_ROLES = ["ADMIN", "SUPPORT_AGENT", "ENGINEERING", "MANAGER", "VIEWER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TICKET_STATUSES = [
  "NEW",
  "TRIAGE",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "ESCALATED",
  "RESOLVED",
  "CLOSED"
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CATEGORIES = [
  "ACCESS",
  "BILLING",
  "BUG",
  "PERFORMANCE",
  "INTEGRATION",
  "SECURITY",
  "OTHER"
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const INCIDENT_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const LOG_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type LogEnvironment = (typeof LOG_ENVIRONMENTS)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const JOB_TYPES = [
  "EMAIL_NOTIFICATION",
  "WEBHOOK_DELIVERY",
  "SLA_ESCALATION",
  "REPORT_GENERATION",
  "DATA_SYNC",
  "AGENT_RUN"
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRYING", "DEAD_LETTERED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AGENT_TYPES = [
  "TICKET_SUMMARIZATION",
  "LOG_ANOMALY_DETECTION",
  "FAILED_JOB_INVESTIGATION"
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_RUN_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_TARGET_TYPES = ["TICKET", "INCIDENT", "LOG_GROUP", "JOB"] as const;
export type AgentTargetType = (typeof AGENT_TARGET_TYPES)[number];

export type JsonRecord = Record<string, unknown>;

export const labelMaps = {
  role: {
    ADMIN: "Admin",
    SUPPORT_AGENT: "Support Agent",
    ENGINEERING: "Engineering",
    MANAGER: "Manager",
    VIEWER: "Viewer"
  },
  ticketStatus: {
    NEW: "New",
    TRIAGE: "Triage",
    IN_PROGRESS: "In Progress",
    WAITING_ON_CUSTOMER: "Waiting on Customer",
    ESCALATED: "Escalated",
    RESOLVED: "Resolved",
    CLOSED: "Closed"
  },
  priority: {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    CRITICAL: "Critical"
  },
  category: {
    ACCESS: "Access",
    BILLING: "Billing",
    BUG: "Bug",
    PERFORMANCE: "Performance",
    INTEGRATION: "Integration",
    SECURITY: "Security",
    OTHER: "Other"
  },
  incidentStatus: {
    INVESTIGATING: "Investigating",
    IDENTIFIED: "Identified",
    MONITORING: "Monitoring",
    RESOLVED: "Resolved"
  },
  jobStatus: {
    QUEUED: "Queued",
    RUNNING: "Running",
    SUCCEEDED: "Succeeded",
    FAILED: "Failed",
    RETRYING: "Retrying",
    DEAD_LETTERED: "Dead Lettered"
  },
  jobType: {
    EMAIL_NOTIFICATION: "Email Notification",
    WEBHOOK_DELIVERY: "Webhook Delivery",
    SLA_ESCALATION: "SLA Escalation",
    REPORT_GENERATION: "Report Generation",
    DATA_SYNC: "Data Sync",
    AGENT_RUN: "Agent Run"
  },
  agentType: {
    TICKET_SUMMARIZATION: "Ticket Summarization",
    LOG_ANOMALY_DETECTION: "Log Anomaly Detection",
    FAILED_JOB_INVESTIGATION: "Failed Job Investigation"
  }
} as const;

export function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function hoursFromNow(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function toIsoDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function compact<T>(items: Array<T | null | undefined | false>): T[] {
  return items.filter(Boolean) as T[];
}
