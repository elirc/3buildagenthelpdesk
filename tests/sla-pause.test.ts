import { describe, expect, it } from "vitest";
import {
  SLA_PAUSING_STATUSES,
  applySlaPauseTransition,
  effectiveSlaDueAt,
  getSlaState,
  isSlaPaused
} from "@agentdesk/domain";

/**
 * Every case here injects `now` explicitly. Time-dependent logic tested
 * against the real clock is a test that passes until it runs at an awkward
 * moment; these assert exact milliseconds instead.
 */

const HOUR = 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

// A ticket raised at 09:00 with an 8-hour (HIGH priority) SLA.
const RAISED = at("2026-05-21T09:00:00.000Z");
const DUE = at("2026-05-21T17:00:00.000Z");

describe("isSlaPaused", () => {
  it("pauses only while waiting on the customer", () => {
    expect(isSlaPaused("WAITING_ON_CUSTOMER")).toBe(true);
    expect(isSlaPaused("IN_PROGRESS")).toBe(false);
    expect(isSlaPaused("ESCALATED")).toBe(false);
    expect(isSlaPaused("NEW")).toBe(false);
  });

  it("agrees with the exported list", () => {
    for (const status of SLA_PAUSING_STATUSES) {
      expect(isSlaPaused(status)).toBe(true);
    }
  });
});

describe("applySlaPauseTransition", () => {
  it("stamps the pause start when the clock stops", () => {
    const result = applySlaPauseTransition({
      from: "IN_PROGRESS",
      to: "WAITING_ON_CUSTOMER",
      slaPausedAt: null,
      slaPausedTotalMs: 0,
      now: at("2026-05-21T10:00:00.000Z")
    });

    expect(result).toEqual({
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0
    });
  });

  it("banks the elapsed time when the clock restarts", () => {
    const result = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "IN_PROGRESS",
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0,
      now: at("2026-05-21T12:00:00.000Z")
    });

    expect(result).toEqual({ slaPausedAt: null, slaPausedTotalMs: 2 * HOUR });
  });

  it("accumulates across several pause cycles", () => {
    const first = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "IN_PROGRESS",
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0,
      now: at("2026-05-21T12:00:00.000Z")
    });

    const second = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "IN_PROGRESS",
      slaPausedAt: at("2026-05-21T14:00:00.000Z"),
      slaPausedTotalMs: first.slaPausedTotalMs,
      now: at("2026-05-21T15:30:00.000Z")
    });

    expect(second).toEqual({ slaPausedAt: null, slaPausedTotalMs: 3.5 * HOUR });
  });

  it("does not re-stamp a pause that is already running", () => {
    // The transition table allows saving a ticket without changing status.
    // Re-stamping here would silently discard the pause in progress and
    // hand back time the customer actually took.
    const result = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "WAITING_ON_CUSTOMER",
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0,
      now: at("2026-05-21T13:00:00.000Z")
    });

    expect(result).toEqual({
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0
    });
  });

  it("is a no-op between two statuses that both run the clock", () => {
    const result = applySlaPauseTransition({
      from: "TRIAGE",
      to: "IN_PROGRESS",
      slaPausedAt: null,
      slaPausedTotalMs: 90 * 1000,
      now: at("2026-05-21T13:00:00.000Z")
    });

    expect(result).toEqual({ slaPausedAt: null, slaPausedTotalMs: 90 * 1000 });
  });

  it("closes out an open pause when the ticket is resolved directly", () => {
    const result = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "RESOLVED",
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0,
      now: at("2026-05-21T11:00:00.000Z")
    });

    expect(result).toEqual({ slaPausedAt: null, slaPausedTotalMs: HOUR });
  });

  it("never subtracts time if the clock goes backwards", () => {
    const result = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "IN_PROGRESS",
      slaPausedAt: at("2026-05-21T12:00:00.000Z"),
      slaPausedTotalMs: HOUR,
      now: at("2026-05-21T11:00:00.000Z")
    });

    expect(result.slaPausedTotalMs).toBe(HOUR);
  });
});

describe("effectiveSlaDueAt", () => {
  it("returns the original deadline when nothing was ever paused", () => {
    expect(effectiveSlaDueAt({ slaDueAt: DUE, now: at("2026-05-21T10:00:00.000Z") })).toEqual(DUE);
  });

  it("gives back time banked from completed pauses", () => {
    expect(
      effectiveSlaDueAt({
        slaDueAt: DUE,
        slaPausedAt: null,
        slaPausedTotalMs: 2 * HOUR,
        now: at("2026-05-21T12:00:00.000Z")
      })
    ).toEqual(at("2026-05-21T19:00:00.000Z"));
  });

  it("includes the pause currently in progress", () => {
    expect(
      effectiveSlaDueAt({
        slaDueAt: DUE,
        slaPausedAt: at("2026-05-21T10:00:00.000Z"),
        slaPausedTotalMs: 0,
        now: at("2026-05-21T13:00:00.000Z")
      })
    ).toEqual(at("2026-05-21T20:00:00.000Z"));
  });

  it("advances in lockstep with now while paused", () => {
    // This is the property the whole feature rests on: while paused, the
    // gap between now and the deadline is constant, so the SLA state is
    // frozen rather than merely slowed.
    const paused = { slaDueAt: DUE, slaPausedAt: at("2026-05-21T10:00:00.000Z"), slaPausedTotalMs: 0 };
    const early = at("2026-05-21T11:00:00.000Z");
    const late = at("2026-05-21T16:00:00.000Z");

    const gapEarly = effectiveSlaDueAt({ ...paused, now: early }).getTime() - early.getTime();
    const gapLate = effectiveSlaDueAt({ ...paused, now: late }).getTime() - late.getTime();

    expect(gapEarly).toBe(gapLate);
  });
});

describe("getSlaState with pausing", () => {
  it("behaves exactly as before for a ticket with no pause data", () => {
    // Existing rows have NULL / 0 in the new columns. They must not change
    // behaviour, which is what makes this schema change safe without a
    // backfill.
    expect(getSlaState({ status: "IN_PROGRESS", slaDueAt: DUE, now: at("2026-05-21T10:00:00.000Z") })).toBe("healthy");
    expect(getSlaState({ status: "IN_PROGRESS", slaDueAt: DUE, now: at("2026-05-21T14:00:00.000Z") })).toBe(
      "approaching"
    );
    expect(getSlaState({ status: "TRIAGE", slaDueAt: DUE, now: at("2026-05-21T18:00:00.000Z") })).toBe("breached");
  });

  it("does not drift toward breach while the clock is stopped", () => {
    const paused = {
      status: "WAITING_ON_CUSTOMER" as const,
      slaDueAt: DUE,
      slaPausedAt: at("2026-05-21T10:00:00.000Z"),
      slaPausedTotalMs: 0
    };

    // Paused at 10:00 with 7 hours to spare. Three days later, still 7 hours.
    expect(getSlaState({ ...paused, now: at("2026-05-21T11:00:00.000Z") })).toBe("healthy");
    expect(getSlaState({ ...paused, now: at("2026-05-24T11:00:00.000Z") })).toBe("healthy");
  });

  it("keeps a ticket breached if it was already late when it paused", () => {
    // Pausing protects a ticket from getting worse. It does not forgive one
    // that was already past its deadline.
    expect(
      getSlaState({
        status: "WAITING_ON_CUSTOMER",
        slaDueAt: DUE,
        slaPausedAt: at("2026-05-21T18:00:00.000Z"),
        slaPausedTotalMs: 0,
        now: at("2026-05-23T09:00:00.000Z")
      })
    ).toBe("breached");
  });

  it("counts a pause that spans the original deadline", () => {
    // Paused 16:00 → 20:00, four hours banked. Original deadline 17:00 sat
    // inside that pause, so the effective deadline is 21:00 and a ticket
    // looked at during 20:00-21:00 is not late.
    expect(
      getSlaState({
        status: "IN_PROGRESS",
        slaDueAt: DUE,
        slaPausedAt: null,
        slaPausedTotalMs: 4 * HOUR,
        now: at("2026-05-21T20:30:00.000Z")
      })
    ).toBe("approaching");

    expect(
      getSlaState({
        status: "IN_PROGRESS",
        slaDueAt: DUE,
        slaPausedAt: null,
        slaPausedTotalMs: 4 * HOUR,
        now: at("2026-05-21T21:30:00.000Z")
      })
    ).toBe("breached");
  });

  it("judges a resolved ticket against the effective deadline", () => {
    // Resolved at 18:30, an hour and a half past the original 17:00. Without
    // the two hours of customer wait it would read as a breach; with them it
    // was met.
    const resolved = {
      status: "RESOLVED" as const,
      slaDueAt: DUE,
      resolvedAt: at("2026-05-21T18:30:00.000Z"),
      now: at("2026-05-22T09:00:00.000Z")
    };

    expect(getSlaState({ ...resolved, slaPausedTotalMs: 0 })).toBe("breached");
    expect(getSlaState({ ...resolved, slaPausedTotalMs: 2 * HOUR })).toBe("resolved");
  });

  it("still reports a genuine breach after accounting for pauses", () => {
    expect(
      getSlaState({
        status: "CLOSED",
        slaDueAt: DUE,
        resolvedAt: at("2026-05-22T09:00:00.000Z"),
        slaPausedTotalMs: 2 * HOUR,
        now: at("2026-05-22T10:00:00.000Z")
      })
    ).toBe("breached");
  });

  it("survives a full pause cycle end to end", () => {
    // Raised 09:00, due 17:00. Waits on the customer 10:00-15:00, then is
    // resolved at 21:00. Five hours were the customer's, so the effective
    // deadline is 22:00 and the SLA was met.
    const pause = applySlaPauseTransition({
      from: "IN_PROGRESS",
      to: "WAITING_ON_CUSTOMER",
      slaPausedAt: null,
      slaPausedTotalMs: 0,
      now: at("2026-05-21T10:00:00.000Z")
    });

    const resume = applySlaPauseTransition({
      from: "WAITING_ON_CUSTOMER",
      to: "IN_PROGRESS",
      slaPausedAt: pause.slaPausedAt,
      slaPausedTotalMs: pause.slaPausedTotalMs,
      now: at("2026-05-21T15:00:00.000Z")
    });

    expect(resume.slaPausedTotalMs).toBe(5 * HOUR);
    expect(effectiveSlaDueAt({ slaDueAt: DUE, ...resume, now: at("2026-05-21T21:00:00.000Z") })).toEqual(
      at("2026-05-21T22:00:00.000Z")
    );
    expect(
      getSlaState({
        status: "RESOLVED",
        slaDueAt: DUE,
        resolvedAt: at("2026-05-21T21:00:00.000Z"),
        ...resume,
        now: at("2026-05-22T09:00:00.000Z")
      })
    ).toBe("resolved");
    expect(RAISED.getTime()).toBeLessThan(DUE.getTime());
  });
});
