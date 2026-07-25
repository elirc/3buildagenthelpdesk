import { labelMaps, type LogLevel, type TicketPriority, type TicketStatus } from "@agentdesk/shared";
import { effectiveSlaDueAt, getFirstResponseState, getSlaState, isSlaPaused } from "@agentdesk/domain";

export function formatDateTime(date?: Date | string | null): string {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

export function formatDate(date?: Date | string | null): string {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(date));
}

export function ticketStatusTone(status: TicketStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "NEW":
    case "TRIAGE":
      return "info";
    case "IN_PROGRESS":
      return "neutral";
    case "WAITING_ON_CUSTOMER":
      return "warning";
    case "ESCALATED":
      return "danger";
    case "RESOLVED":
    case "CLOSED":
      return "success";
  }
}

export function priorityTone(priority: TicketPriority): "neutral" | "info" | "warning" | "critical" {
  switch (priority) {
    case "LOW":
      return "neutral";
    case "MEDIUM":
      return "info";
    case "HIGH":
      return "warning";
    case "CRITICAL":
      return "critical";
  }
}

export function logLevelTone(level: LogLevel): "neutral" | "info" | "warning" | "danger" | "critical" {
  switch (level) {
    case "debug":
      return "neutral";
    case "info":
      return "info";
    case "warn":
      return "warning";
    case "error":
      return "danger";
    case "fatal":
      return "critical";
  }
}

export type SlaDisplay = {
  label: string;
  tone: "neutral" | "warning" | "danger" | "success";
  /** True while the clock is stopped. Rendered as a separate badge so a
   *  ticket that paused after breaching still shows both facts. */
  paused: boolean;
  /** The deadline once paused time is given back. Equals slaDueAt when the
   *  ticket has never been paused. */
  effectiveDueAt: Date;
};

export function slaTone(params: {
  status: TicketStatus;
  slaDueAt: Date;
  resolvedAt?: Date | null;
  slaPausedAt?: Date | null;
  slaPausedTotalMs?: number;
}): SlaDisplay {
  const state = getSlaState(params);
  const paused = isSlaPaused(params.status);
  const effectiveDueAt = effectiveSlaDueAt(params);

  const base =
    state === "breached"
      ? { label: "SLA Breached", tone: "danger" as const }
      : state === "approaching"
        ? { label: "SLA Approaching", tone: "warning" as const }
        : state === "resolved"
          ? { label: "SLA Met", tone: "success" as const }
          : { label: "SLA Healthy", tone: "neutral" as const };

  return { ...base, paused, effectiveDueAt };
}

/** "2h 15m" — for showing how much customer wait a ticket has accumulated. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "None";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function ticketStatusLabel(status: TicketStatus): string {
  return labelMaps.ticketStatus[status];
}

export function priorityLabel(priority: TicketPriority): string {
  return labelMaps.priority[priority];
}

/** Label and tone for the first-response clock. */
export function firstResponseTone(params: { firstRespondedAt?: Date | null; firstResponseDueAt?: Date | null }) {
  const state = getFirstResponseState(params);
  switch (state) {
    case "met":
      return { label: "Responded", tone: "success" as const };
    case "late":
      // Answered, but not in time. Distinct from "met" so a manager can see
      // it, and distinct from "breached" because nobody is still waiting.
      return { label: "Responded late", tone: "warning" as const };
    case "breached":
      return { label: "No response", tone: "danger" as const };
    case "approaching":
      return { label: "Response due", tone: "warning" as const };
    case "pending":
      return { label: "Awaiting response", tone: "neutral" as const };
    default:
      return { label: "Not tracked", tone: "neutral" as const };
  }
}
