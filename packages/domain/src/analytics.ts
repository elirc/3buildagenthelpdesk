import type { TicketStatus } from "@agentdesk/shared";
import { effectiveSlaDueAt } from "./tickets";

/* -------------------------------------------------------------------------
 * Analytics helpers.
 *
 * All pure. The page fetches and hands rows here; nothing in this file
 * knows about Prisma, which is what lets the percentile and bucket maths
 * be tested exhaustively without a database.
 * ---------------------------------------------------------------------- */

export type PeriodBucket = { start: Date; end: Date; label: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Split a range into day or week buckets.
 *
 * Buckets are half-open [start, end) so a ticket on a boundary is counted
 * once rather than in both neighbours.
 */
export function buildBuckets(from: Date, to: Date, granularity: "day" | "week"): PeriodBucket[] {
  if (to < from) return [];

  const step = granularity === "day" ? DAY_MS : 7 * DAY_MS;
  const buckets: PeriodBucket[] = [];
  let cursor = startOfUtcDay(from);
  const limit = startOfUtcDay(to).getTime();

  // Bounded so a mis-ordered or absurd range cannot spin.
  for (let guard = 0; guard < 400 && cursor.getTime() <= limit; guard += 1) {
    const end = new Date(cursor.getTime() + step);
    buckets.push({ start: cursor, end, label: cursor.toISOString().slice(0, 10) });
    cursor = end;
  }

  return buckets;
}

/**
 * Nearest-rank percentile.
 *
 * Deliberately not interpolated: with a handful of tickets an interpolated
 * p90 invents a duration nobody experienced. Nearest-rank always returns a
 * real observation.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export type SlaAttainment = {
  total: number;
  met: number;
  breached: number;
  attainmentPct: number;
};

/**
 * SLA attainment over resolved tickets.
 *
 * Only resolved tickets count. An open ticket has not yet succeeded or
 * failed, and counting it either way would make the number move for
 * reasons that have nothing to do with performance.
 */
export function summarizeSlaAttainment(
  tickets: Array<{
    status: TicketStatus;
    slaDueAt: Date;
    resolvedAt: Date | null;
    slaPausedTotalMs?: number;
  }>
): SlaAttainment {
  const resolved = tickets.filter((ticket) => ticket.resolvedAt != null);
  let met = 0;

  for (const ticket of resolved) {
    const due = effectiveSlaDueAt({
      slaDueAt: ticket.slaDueAt,
      slaPausedTotalMs: ticket.slaPausedTotalMs ?? 0,
      slaPausedAt: null
    });
    if (ticket.resolvedAt! <= due) met += 1;
  }

  const total = resolved.length;
  return {
    total,
    met,
    breached: total - met,
    // Guarded: an empty period is 0%, not NaN.
    attainmentPct: total === 0 ? 0 : Math.round((met / total) * 100)
  };
}

/** Resolution durations in hours, excluding time the clock was paused. */
export function resolutionHours(
  tickets: Array<{ createdAt: Date; resolvedAt: Date | null; slaPausedTotalMs?: number }>
): number[] {
  return tickets
    .filter((ticket) => ticket.resolvedAt != null)
    .map((ticket) => {
      const elapsed = ticket.resolvedAt!.getTime() - ticket.createdAt.getTime();
      const working = elapsed - (ticket.slaPausedTotalMs ?? 0);
      return Math.max(0, working) / 3_600_000;
    });
}

/** First response durations in hours, for tickets that got one. */
export function firstResponseHours(
  tickets: Array<{ createdAt: Date; firstRespondedAt: Date | null }>
): number[] {
  return tickets
    .filter((ticket) => ticket.firstRespondedAt != null)
    .map((ticket) => Math.max(0, ticket.firstRespondedAt!.getTime() - ticket.createdAt.getTime()) / 3_600_000);
}
