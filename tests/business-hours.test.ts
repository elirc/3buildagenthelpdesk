import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_CALENDAR,
  addBusinessHours,
  businessHoursBetween,
  isWorkingTime,
  usesBusinessHours
} from "@agentdesk/domain";

const cal = DEFAULT_BUSINESS_CALENDAR; // Mon-Fri, 09:00-17:00 UTC
const at = (iso: string) => new Date(iso);

// 2026-05-21 is a Thursday; 2026-05-22 Friday; 23/24 the weekend.

describe("isWorkingTime", () => {
  it("accepts a weekday inside hours", () => {
    expect(isWorkingTime(at("2026-05-21T10:00:00.000Z"), cal)).toBe(true);
  });

  it("rejects before opening and at or after closing", () => {
    expect(isWorkingTime(at("2026-05-21T08:59:00.000Z"), cal)).toBe(false);
    expect(isWorkingTime(at("2026-05-21T17:00:00.000Z"), cal)).toBe(false);
  });

  it("rejects the weekend", () => {
    expect(isWorkingTime(at("2026-05-23T10:00:00.000Z"), cal)).toBe(false);
    expect(isWorkingTime(at("2026-05-24T10:00:00.000Z"), cal)).toBe(false);
  });

  it("rejects a configured holiday", () => {
    const withHoliday = { ...cal, holidays: [at("2026-05-21T00:00:00.000Z")] };
    expect(isWorkingTime(at("2026-05-21T10:00:00.000Z"), withHoliday)).toBe(false);
  });
});

describe("addBusinessHours", () => {
  it("stays inside the same day when there is room", () => {
    expect(addBusinessHours(at("2026-05-21T10:00:00.000Z"), 4, cal).toISOString()).toBe("2026-05-21T14:00:00.000Z");
  });

  it("starts the clock at opening when raised before hours", () => {
    expect(addBusinessHours(at("2026-05-21T06:00:00.000Z"), 2, cal).toISOString()).toBe("2026-05-21T11:00:00.000Z");
  });

  it("rolls to the next morning when raised after hours", () => {
    expect(addBusinessHours(at("2026-05-21T20:00:00.000Z"), 1, cal).toISOString()).toBe("2026-05-22T10:00:00.000Z");
  });

  it("skips the weekend", () => {
    // Friday 16:00 + 2 business hours: one hour Friday, one Monday morning.
    expect(addBusinessHours(at("2026-05-22T16:00:00.000Z"), 2, cal).toISOString()).toBe("2026-05-25T10:00:00.000Z");
  });

  it("spans several working days", () => {
    // Thursday 09:00 + 20h = 8h Thu + 8h Fri + 4h Mon.
    expect(addBusinessHours(at("2026-05-21T09:00:00.000Z"), 20, cal).toISOString()).toBe("2026-05-25T13:00:00.000Z");
  });

  it("skips a configured holiday", () => {
    const withHoliday = { ...cal, holidays: [at("2026-05-22T00:00:00.000Z")] };
    // Thursday 16:00 + 2h: one hour Thu, then Friday is a holiday, so Monday.
    expect(addBusinessHours(at("2026-05-21T16:00:00.000Z"), 2, withHoliday).toISOString()).toBe(
      "2026-05-25T10:00:00.000Z"
    );
  });

  it("returns the input for zero or negative hours", () => {
    const from = at("2026-05-21T10:00:00.000Z");
    expect(addBusinessHours(from, 0, cal)).toEqual(from);
    expect(addBusinessHours(from, -5, cal)).toEqual(from);
  });

  it("falls back to elapsed time when the calendar has no working days", () => {
    // Rather than looping for ever or silently returning `from`.
    const broken = { ...cal, workdays: [] };
    expect(addBusinessHours(at("2026-05-21T10:00:00.000Z"), 2, broken).toISOString()).toBe(
      "2026-05-21T12:00:00.000Z"
    );
  });
});

describe("businessHoursBetween", () => {
  it("counts only working time", () => {
    expect(businessHoursBetween(at("2026-05-21T10:00:00.000Z"), at("2026-05-21T14:00:00.000Z"), cal)).toBe(4);
  });

  it("excludes the weekend", () => {
    // Friday 16:00 to Monday 10:00 is one hour Friday plus one Monday.
    expect(businessHoursBetween(at("2026-05-22T16:00:00.000Z"), at("2026-05-25T10:00:00.000Z"), cal)).toBe(2);
  });

  it("is zero when the range is empty or inverted", () => {
    const t = at("2026-05-21T10:00:00.000Z");
    expect(businessHoursBetween(t, t, cal)).toBe(0);
    expect(businessHoursBetween(at("2026-05-21T14:00:00.000Z"), t, cal)).toBe(0);
  });

  it("is the inverse of addBusinessHours for whole hours", () => {
    for (const hours of [1, 4, 8, 20, 36]) {
      const from = at("2026-05-21T09:00:00.000Z");
      const due = addBusinessHours(from, hours, cal);
      expect(businessHoursBetween(from, due, cal)).toBeCloseTo(hours, 5);
    }
  });
});

describe("usesBusinessHours", () => {
  it("exempts CRITICAL", () => {
    // An outage does not wait for Monday.
    expect(usesBusinessHours("CRITICAL")).toBe(false);
    expect(usesBusinessHours("HIGH")).toBe(true);
    expect(usesBusinessHours("MEDIUM")).toBe(true);
    expect(usesBusinessHours("LOW")).toBe(true);
  });
});
