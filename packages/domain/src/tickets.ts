import { z } from "zod";
import { addBusinessHours, usesBusinessHours, type BusinessCalendarConfig } from "./business-hours";
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

/**
 * The resolution deadline for a ticket.
 *
 * With no calendar this is elapsed hours, exactly as before — which is what
 * keeps every existing call site and every existing row correct.
 *
 * With a calendar, non-CRITICAL tickets count only working hours, so a LOW
 * ticket raised on Friday evening is not already two days late by Monday.
 * CRITICAL is always elapsed: an outage does not wait for Monday.
 */
export function calculateSlaDueAt(
  priority: TicketPriority,
  createdAt = new Date(),
  calendar?: BusinessCalendarConfig
): Date {
  const hours = slaHoursByPriority[priority];
  if (calendar && usesBusinessHours(priority)) {
    return addBusinessHours(createdAt, hours, calendar);
  }
  return hoursFromNow(hours, createdAt);
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

/* -------------------------------------------------------------------------
 * First response time
 *
 * Resolution SLA is the lagging metric: it tells you months later that a
 * quarter went badly. First response is the leading one, and it is the
 * thing a waiting customer actually experiences — silence.
 * ---------------------------------------------------------------------- */

const firstResponseHoursByPriority: Record<TicketPriority, number> = {
  CRITICAL: 0.5,
  HIGH: 2,
  MEDIUM: 8,
  LOW: 24
};

export function calculateFirstResponseDueAt(
  priority: TicketPriority,
  createdAt = new Date(),
  calendar?: BusinessCalendarConfig
): Date {
  const hours = firstResponseHoursByPriority[priority];
  // The response clock follows the same rule as resolution: an unattended
  // Friday night must not consume a LOW ticket's whole response budget.
  if (calendar && usesBusinessHours(priority)) {
    return addBusinessHours(createdAt, hours, calendar);
  }
  return hoursFromNow(hours, createdAt);
}

/**
 * Whether a comment counts as our first response.
 *
 * Two conditions, and both are load-bearing:
 *
 * - It must not be internal. An internal note is us talking to ourselves;
 *   the customer has still heard nothing. Counting it would let the metric
 *   be satisfied without anyone contacting anybody.
 * - It must not be from the requester. Some help desks let customers reply
 *   into the thread, and their own message must not discharge our obligation
 *   to answer it.
 */
export function qualifiesAsFirstResponse(
  comment: { isInternal: boolean; authorEmail: string },
  requesterEmail: string
): boolean {
  if (comment.isInternal) return false;
  return comment.authorEmail.trim().toLowerCase() !== requesterEmail.trim().toLowerCase();
}

export type FirstResponseState = "met" | "late" | "pending" | "approaching" | "breached" | "untracked";

/**
 * Note "met" and "late" are distinct terminal states. Once we have replied
 * the customer is no longer waiting, so it is not "breached" — but a
 * manager still needs to see that it took too long, which a single "met"
 * would hide.
 */
export function getFirstResponseState(params: {
  firstRespondedAt?: Date | null;
  firstResponseDueAt?: Date | null;
  now?: Date;
}): FirstResponseState {
  if (!params.firstResponseDueAt) {
    // Rows written before this feature existed. Not a breach.
    return "untracked";
  }

  if (params.firstRespondedAt) {
    return params.firstRespondedAt > params.firstResponseDueAt ? "late" : "met";
  }

  const now = params.now ?? new Date();
  if (now > params.firstResponseDueAt) {
    return "breached";
  }

  const remainingHours = (params.firstResponseDueAt.getTime() - now.getTime()) / 1000 / 60 / 60;
  return remainingHours <= 1 ? "approaching" : "pending";
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

/* -------------------------------------------------------------------------
 * Bulk triage
 *
 * A morning triage pass touches twenty tickets. Some of them will refuse
 * the requested transition — a CLOSED ticket cannot go back to TRIAGE — and
 * the interesting design question is what to do about the other eighteen.
 *
 * This plans best-effort: apply what is legal, report what is not. The
 * alternative, all-or-nothing, means one closed ticket in a selection of
 * twenty blocks the whole batch and the agent has to hunt for the offender.
 * That is the correct choice for a *financial* transaction and the wrong
 * one for a triage queue, where the operations are independent.
 * ---------------------------------------------------------------------- */

/** Guard rail on a single submission, so one selection cannot lock the table. */
export const MAX_BULK_TICKETS = 200;

export type BulkTransitionPlan = {
  applied: string[];
  rejected: Array<{ ticketId: string; reason: string }>;
};

/**
 * Split a selection into the tickets that may take the target status and
 * those that may not. Pure: it is handed current statuses and returns a
 * plan. Executing the plan is the action's job.
 */
export function planBulkStatusChange(
  tickets: Array<{ id: string; status: TicketStatus }>,
  target: TicketStatus
): BulkTransitionPlan {
  const applied: string[] = [];
  const rejected: Array<{ ticketId: string; reason: string }> = [];

  for (const ticket of tickets) {
    if (ticket.status === target) {
      // Not an error, but not work either. Skipping keeps the audit log
      // free of "changed X to X" entries that mean nothing.
      rejected.push({ ticketId: ticket.id, reason: `Already ${target}` });
      continue;
    }
    if (canTransitionTicket(ticket.status, target)) {
      applied.push(ticket.id);
    } else {
      rejected.push({ ticketId: ticket.id, reason: `Cannot move from ${ticket.status} to ${target}` });
    }
  }

  return { applied, rejected };
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
