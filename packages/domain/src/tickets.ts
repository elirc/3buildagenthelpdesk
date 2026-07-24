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

/* -------------------------------------------------------------------------
 * SLA pausing
 *
 * A ticket parked on WAITING_ON_CUSTOMER is not work we are failing to do —
 * it is work we cannot do. Counting that time against our SLA measures the
 * customer's response speed and calls it our own.
 *
 * The implementation deliberately never moves slaDueAt. That field is the
 * commitment made when the ticket was raised; rewriting it on every pause
 * would lose the original promise and make "how long did this actually
 * take" unanswerable after the fact. Instead the paused time accumulates
 * separately and is added back when the effective deadline is computed.
 * ---------------------------------------------------------------------- */

/** Statuses during which the SLA clock does not run. */
export const SLA_PAUSING_STATUSES: TicketStatus[] = ["WAITING_ON_CUSTOMER"];

export function isSlaPaused(status: TicketStatus): boolean {
  return SLA_PAUSING_STATUSES.includes(status);
}

export type SlaPauseFields = {
  slaPausedAt: Date | null;
  slaPausedTotalMs: number;
};

/**
 * The pause bookkeeping to persist when a ticket changes status.
 *
 * Decided from the *target* status and the pause currently in progress,
 * rather than from the from/to pair. That is what makes it idempotent: the
 * transition table permits saving a ticket without changing its status, and
 * a from/to reading would re-stamp slaPausedAt on every such save, silently
 * discarding the pause that was already running.
 */
export function applySlaPauseTransition(params: {
  from: TicketStatus;
  to: TicketStatus;
  slaPausedAt: Date | null;
  slaPausedTotalMs: number;
  now?: Date;
}): SlaPauseFields {
  const now = params.now ?? new Date();
  const totalMs = params.slaPausedTotalMs;

  if (isSlaPaused(params.to)) {
    // Already paused: leave the existing start time alone.
    return params.slaPausedAt
      ? { slaPausedAt: params.slaPausedAt, slaPausedTotalMs: totalMs }
      : { slaPausedAt: now, slaPausedTotalMs: totalMs };
  }

  if (params.slaPausedAt) {
    // Leaving a pause: bank the elapsed time and clear the marker.
    // Clamped at zero so a clock adjustment cannot subtract paused time.
    const elapsed = Math.max(0, now.getTime() - params.slaPausedAt.getTime());
    return { slaPausedAt: null, slaPausedTotalMs: totalMs + elapsed };
  }

  return { slaPausedAt: null, slaPausedTotalMs: totalMs };
}

/**
 * The deadline once paused time is given back: the original commitment,
 * plus every completed pause, plus the pause currently running.
 *
 * Including the in-progress pause is what actually freezes the clock. While
 * paused, the deadline advances at exactly the same rate as `now`, so the
 * distance between them — and therefore the SLA state — holds still.
 */
export function effectiveSlaDueAt(params: {
  slaDueAt: Date;
  slaPausedAt?: Date | null;
  slaPausedTotalMs?: number;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const banked = params.slaPausedTotalMs ?? 0;
  const inProgress = params.slaPausedAt ? Math.max(0, now.getTime() - params.slaPausedAt.getTime()) : 0;
  return new Date(params.slaDueAt.getTime() + banked + inProgress);
}

export type SlaState = "healthy" | "approaching" | "breached" | "resolved";

/**
 * Note there is no "paused" state. A paused ticket keeps whichever state it
 * held when the clock stopped, including "breached" — pausing protects a
 * ticket from getting worse, it does not absolve one that was already late.
 * The UI shows "Paused" as a separate badge so both facts stay visible.
 */
export function getSlaState(params: {
  status: TicketStatus;
  slaDueAt: Date;
  resolvedAt?: Date | null;
  slaPausedAt?: Date | null;
  slaPausedTotalMs?: number;
  now?: Date;
}): SlaState {
  const now = params.now ?? new Date();
  const dueAt = effectiveSlaDueAt({
    slaDueAt: params.slaDueAt,
    slaPausedAt: params.slaPausedAt,
    slaPausedTotalMs: params.slaPausedTotalMs,
    now
  });

  if (params.status === "RESOLVED" || params.status === "CLOSED") {
    return params.resolvedAt && params.resolvedAt > dueAt ? "breached" : "resolved";
  }

  if (now > dueAt) {
    return "breached";
  }

  const remainingHours = (dueAt.getTime() - now.getTime()) / 1000 / 60 / 60;
  return remainingHours <= SLA_WARNING_WINDOW_HOURS ? "approaching" : "healthy";
}

/** How close to the deadline a ticket must be to count as "approaching". */
export const SLA_WARNING_WINDOW_HOURS = 4;

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
