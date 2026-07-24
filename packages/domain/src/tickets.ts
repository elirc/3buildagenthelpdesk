import { z } from "zod";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UserRole,
  hoursFromNow
} from "@agentdesk/shared";

export const createTicketSchema = z.object({
  title: z.string().min(5).max(160),
  description: z.string().min(20).max(5000),
  customerName: z.string().min(2).max(120),
  requesterEmail: z.string().email(),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
  assignedTeamId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  incidentId: z.string().optional().nullable(),
  tags: z.array(z.string().min(1).max(32)).max(12).default([])
});

export const updateTicketSchema = createTicketSchema.extend({
  status: z.enum(TICKET_STATUSES),
  slaDueAt: z.coerce.date().optional()
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const allowedTicketTransitions: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["TRIAGE", "IN_PROGRESS", "ESCALATED", "CLOSED"],
  TRIAGE: ["IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED"],
  WAITING_ON_CUSTOMER: ["IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: []
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) {
    return true;
  }
  return allowedTicketTransitions[from].includes(to);
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransitionTicket(from, to)) {
    throw new Error(`Ticket status cannot transition from ${from} to ${to}`);
  }
}

const slaHoursByPriority: Record<TicketPriority, number> = {
  LOW: 72,
  MEDIUM: 36,
  HIGH: 8,
  CRITICAL: 2
};

export function calculateSlaDueAt(priority: TicketPriority, createdAt = new Date()): Date {
  return hoursFromNow(slaHoursByPriority[priority], createdAt);
}

export type SlaState = "healthy" | "approaching" | "breached" | "resolved";

export function getSlaState(params: {
  status: TicketStatus;
  slaDueAt: Date;
  resolvedAt?: Date | null;
  now?: Date;
}): SlaState {
  const now = params.now ?? new Date();

  if (params.status === "RESOLVED" || params.status === "CLOSED") {
    return params.resolvedAt && params.resolvedAt > params.slaDueAt ? "breached" : "resolved";
  }

  if (now > params.slaDueAt) {
    return "breached";
  }

  const remainingMs = params.slaDueAt.getTime() - now.getTime();
  const remainingHours = remainingMs / 1000 / 60 / 60;
  return remainingHours <= 4 ? "approaching" : "healthy";
}

export function shouldEscalateTicket(params: {
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  linkedIncidentId?: string | null;
}): boolean {
  const text = params.description.toLowerCase();
  const severeKeyword = ["outage", "down", "production", "security", "breach", "data loss"].some((keyword) =>
    text.includes(keyword)
  );

  return (
    params.status === "ESCALATED" ||
    params.priority === "CRITICAL" ||
    params.linkedIncidentId != null ||
    severeKeyword
  );
}

export function canMutateTickets(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPPORT_AGENT" || role === "ENGINEERING" || role === "MANAGER";
}

export function canResolveTickets(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPPORT_AGENT" || role === "ENGINEERING";
}

export function normalizeTags(raw: string | string[] | undefined): string[] {
  if (!raw) {
    return [];
  }
  const values = Array.isArray(raw) ? raw : raw.split(",");
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

export function inferCategoryFromText(text: string): TicketCategory {
  const normalized = text.toLowerCase();
  if (/(login|access|password|permission|sso|mfa)/.test(normalized)) return "ACCESS";
  if (/(invoice|billing|payment|charge|subscription)/.test(normalized)) return "BILLING";
  if (/(slow|latency|timeout|performance)/.test(normalized)) return "PERFORMANCE";
  if (/(webhook|api|integration|sync|third-party|third party)/.test(normalized)) return "INTEGRATION";
  if (/(security|breach|vulnerability|xss|token)/.test(normalized)) return "SECURITY";
  if (/(bug|error|broken|exception|crash)/.test(normalized)) return "BUG";
  return "OTHER";
}
