import type { TicketPriority } from "@agentdesk/shared";

/**
 * Business-hours SLA arithmetic.
 *
 * All computation is in UTC. The calendar carries a timezone so the data
 * model does not have to change later, but converting is deliberately not
 * attempted here: doing it properly needs DST-aware conversion, and doing
 * it improperly is worse than not doing it at all because the errors are
 * an hour wide and only appear twice a year. See the TODO on
 * BusinessCalendarConfig.
 */

export type BusinessCalendarConfig = {
  /** TODO: not yet honoured — all arithmetic is UTC. */
  timezone: string;
  workdayStartMinute: number;
  workdayEndMinute: number;
  /** 0 = Sunday, matching Date#getUTCDay(). */
  workdays: number[];
  holidays: Date[];
};

export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendarConfig = {
  timezone: "UTC",
  workdayStartMinute: 9 * 60,
  workdayEndMinute: 17 * 60,
  workdays: [1, 2, 3, 4, 5],
  holidays: []
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function minutesIntoDay(at: Date): number {
  return at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
}

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function isHoliday(at: Date, cal: BusinessCalendarConfig): boolean {
  const day = startOfUtcDay(at).getTime();
  return cal.holidays.some((holiday) => startOfUtcDay(holiday).getTime() === day);
}

export function isWorkingDay(at: Date, cal: BusinessCalendarConfig): boolean {
  return cal.workdays.includes(at.getUTCDay()) && !isHoliday(at, cal);
}

export function isWorkingTime(at: Date, cal: BusinessCalendarConfig): boolean {
  if (!isWorkingDay(at, cal)) return false;
  const minutes = minutesIntoDay(at);
  return minutes >= cal.workdayStartMinute && minutes < cal.workdayEndMinute;
}

/** The start of the next working period at or after `from`. */
function nextWorkingStart(from: Date, cal: BusinessCalendarConfig): Date {
  let cursor = from;
  // A year of days is a generous bound; it exists so a calendar with no
  // working days at all terminates instead of hanging the request.
  for (let guard = 0; guard < 366; guard += 1) {
    if (isWorkingDay(cursor, cal)) {
      const dayStart = startOfUtcDay(cursor);
      const open = new Date(dayStart.getTime() + cal.workdayStartMinute * MINUTE_MS);
      const close = new Date(dayStart.getTime() + cal.workdayEndMinute * MINUTE_MS);
      if (cursor < open) return open;
      if (cursor < close) return cursor;
    }
    cursor = new Date(startOfUtcDay(cursor).getTime() + DAY_MS);
  }
  return from;
}

/**
 * Walk forward from `from`, counting only working time, until `hours` of it
 * have elapsed.
 *
 * Consumes whole working days at a time rather than stepping minute by
 * minute, so a 200-hour target does not cost 12,000 iterations.
 */
export function addBusinessHours(from: Date, hours: number, cal: BusinessCalendarConfig): Date {
  if (hours <= 0) return from;

  const dayLengthMinutes = cal.workdayEndMinute - cal.workdayStartMinute;
  if (dayLengthMinutes <= 0 || cal.workdays.length === 0) {
    // A calendar with no working time cannot express a deadline; fall back
    // to elapsed hours rather than looping for ever or returning `from`.
    return new Date(from.getTime() + hours * 60 * MINUTE_MS);
  }

  let remainingMinutes = hours * 60;
  let cursor = nextWorkingStart(from, cal);

  for (let guard = 0; guard < 4000 && remainingMinutes > 0; guard += 1) {
    const dayStart = startOfUtcDay(cursor);
    const close = new Date(dayStart.getTime() + cal.workdayEndMinute * MINUTE_MS);
    const availableMinutes = (close.getTime() - cursor.getTime()) / MINUTE_MS;

    if (remainingMinutes <= availableMinutes) {
      return new Date(cursor.getTime() + remainingMinutes * MINUTE_MS);
    }

    remainingMinutes -= availableMinutes;
    cursor = nextWorkingStart(new Date(dayStart.getTime() + DAY_MS), cal);
  }

  return cursor;
}

/** Working hours between two instants. Inverse of addBusinessHours. */
export function businessHoursBetween(from: Date, to: Date, cal: BusinessCalendarConfig): number {
  if (to <= from) return 0;

  let total = 0;
  let cursor = nextWorkingStart(from, cal);

  for (let guard = 0; guard < 4000 && cursor < to; guard += 1) {
    const dayStart = startOfUtcDay(cursor);
    const close = new Date(dayStart.getTime() + cal.workdayEndMinute * MINUTE_MS);
    const segmentEnd = close < to ? close : to;

    if (segmentEnd > cursor) {
      total += (segmentEnd.getTime() - cursor.getTime()) / MINUTE_MS;
    }

    cursor = nextWorkingStart(new Date(dayStart.getTime() + DAY_MS), cal);
  }

  return total / 60;
}

/**
 * CRITICAL tickets always use wall-clock hours.
 *
 * An outage does not wait for Monday. Applying business hours to a
 * two-hour CRITICAL target raised on a Friday evening would put the
 * deadline on Monday morning, which is not a service level anyone means
 * to promise.
 */
export function usesBusinessHours(priority: TicketPriority): boolean {
  return priority !== "CRITICAL";
}
