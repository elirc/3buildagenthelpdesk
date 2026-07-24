import { labelMaps, type LogLevel, type TicketPriority, type TicketStatus } from "@agentdesk/shared";
import { getSlaState } from "@agentdesk/domain";

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

export function slaTone(params: { status: TicketStatus; slaDueAt: Date; resolvedAt?: Date | null }) {
  const state = getSlaState(params);
  if (state === "breached") return { label: "SLA Breached", tone: "danger" as const };
  if (state === "approaching") return { label: "SLA Approaching", tone: "warning" as const };
  if (state === "resolved") return { label: "SLA Met", tone: "success" as const };
  return { label: "SLA Healthy", tone: "neutral" as const };
}

export function ticketStatusLabel(status: TicketStatus): string {
  return labelMaps.ticketStatus[status];
}

export function priorityLabel(priority: TicketPriority): string {
  return labelMaps.priority[priority];
}
