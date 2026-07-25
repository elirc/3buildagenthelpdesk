import { describe, expect, it } from "vitest";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, calculateBackoffMs, isJobDue, nextRunAt } from "@agentdesk/domain";

const NOW = new Date("2026-05-21T12:00:00.000Z");

describe("calculateBackoffMs", () => {
  it("roughly doubles each attempt", () => {
    const a1 = calculateBackoffMs(1, "job-a");
    const a2 = calculateBackoffMs(2, "job-a");
    const a3 = calculateBackoffMs(3, "job-a");

    expect(a1).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
    // Jitter is small relative to the base, so the doubling stays visible.
    expect(a2 - a1).toBeGreaterThan(BACKOFF_BASE_MS * 0.5);
  });

  it("is deterministic for a given attempt and job", () => {
    // The whole reason jitter comes from the id rather than Math.random():
    // a value that changes every run cannot be asserted on.
    expect(calculateBackoffMs(3, "job-a")).toBe(calculateBackoffMs(3, "job-a"));
  });

  it("spreads two jobs failing in the same tick", () => {
    // Without this a struggling dependency takes the whole failed batch
    // again simultaneously.
    expect(calculateBackoffMs(1, "job-a")).not.toBe(calculateBackoffMs(1, "job-b"));
  });

  it("caps the delay so a job does not disappear for a week", () => {
    const huge = calculateBackoffMs(50, "job-a");
    expect(Number.isFinite(huge)).toBe(true);
    // Cap plus the jitter allowance.
    expect(huge).toBeLessThanOrEqual(BACKOFF_MAX_MS + 8000);
  });

  it("does not overflow at absurd attempt numbers", () => {
    // 2 ** 400 is Infinity. The exponent is capped before the power is
    // computed, not after.
    expect(Number.isFinite(calculateBackoffMs(400, "job-a"))).toBe(true);
  });

  it("treats attempt 0 and negative attempts as the first attempt", () => {
    expect(calculateBackoffMs(0, "job-a")).toBe(calculateBackoffMs(1, "job-a"));
    expect(calculateBackoffMs(-5, "job-a")).toBe(calculateBackoffMs(1, "job-a"));
  });
});

describe("nextRunAt", () => {
  it("schedules relative to the supplied clock", () => {
    const due = nextRunAt({ attempt: 1, jobId: "job-a", now: NOW });
    expect(due.getTime()).toBe(NOW.getTime() + calculateBackoffMs(1, "job-a"));
  });

  it("always schedules into the future", () => {
    expect(nextRunAt({ attempt: 1, jobId: "job-a", now: NOW }).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("isJobDue", () => {
  it("is due when runAt has passed", () => {
    expect(isJobDue({ status: "QUEUED", runAt: new Date(NOW.getTime() - 1000) }, NOW)).toBe(true);
  });

  it("is due at exactly runAt", () => {
    expect(isJobDue({ status: "RETRYING", runAt: NOW }, NOW)).toBe(true);
  });

  it("is not due while runAt is in the future", () => {
    expect(isJobDue({ status: "QUEUED", runAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false);
  });

  it("is never due for a status that is not waiting to run", () => {
    const past = new Date(NOW.getTime() - 10_000);
    for (const status of ["RUNNING", "SUCCEEDED", "FAILED", "DEAD_LETTERED"] as const) {
      expect(isJobDue({ status, runAt: past }, NOW)).toBe(false);
    }
  });
});
