import { describe, expect, it } from "vitest";
import {
  buildBuckets,
  firstResponseHours,
  median,
  percentile,
  resolutionHours,
  summarizeSlaAttainment
} from "@agentdesk/domain";

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe("percentile", () => {
  it("returns 0 for an empty sample rather than NaN", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the only value for a single sample", () => {
    expect(percentile([7], 90)).toBe(7);
  });

  it("uses nearest-rank, so the result is always a real observation", () => {
    // Interpolation would invent a p90 nobody experienced.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 90)).toBe(9);
    expect(percentile(values, 100)).toBe(10);
  });

  it("clamps percentiles outside 0-100", () => {
    expect(percentile([1, 2, 3], 150)).toBe(3);
    expect(percentile([1, 2, 3], -10)).toBe(1);
  });

  it("does not depend on input order", () => {
    expect(percentile([9, 1, 5, 3], 50)).toBe(percentile([1, 3, 5, 9], 50));
  });
});

describe("median", () => {
  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("takes the middle for an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("is 0 for an empty sample", () => {
    expect(median([])).toBe(0);
  });
});

describe("buildBuckets", () => {
  it("produces one bucket per day", () => {
    const buckets = buildBuckets(at("2026-05-21T10:00:00Z"), at("2026-05-23T10:00:00Z"), "day");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].label).toBe("2026-05-21");
  });

  it("produces half-open ranges so a boundary is counted once", () => {
    const [first, second] = buildBuckets(at("2026-05-21T00:00:00Z"), at("2026-05-22T00:00:00Z"), "day");
    expect(first.end).toEqual(second.start);
  });

  it("handles a single-day range", () => {
    expect(buildBuckets(at("2026-05-21T01:00:00Z"), at("2026-05-21T23:00:00Z"), "day")).toHaveLength(1);
  });

  it("returns nothing for an inverted range", () => {
    expect(buildBuckets(at("2026-05-23T00:00:00Z"), at("2026-05-21T00:00:00Z"), "day")).toEqual([]);
  });

  it("crosses a month boundary", () => {
    const buckets = buildBuckets(at("2026-05-30T00:00:00Z"), at("2026-06-02T00:00:00Z"), "day");
    expect(buckets.map((b) => b.label)).toEqual(["2026-05-30", "2026-05-31", "2026-06-01", "2026-06-02"]);
  });

  it("steps a week at a time when asked", () => {
    expect(buildBuckets(at("2026-05-01T00:00:00Z"), at("2026-05-22T00:00:00Z"), "week")).toHaveLength(4);
  });
});

describe("summarizeSlaAttainment", () => {
  const due = at("2026-05-21T17:00:00Z");

  it("ignores tickets that are still open", () => {
    // An open ticket has not yet succeeded or failed.
    const result = summarizeSlaAttainment([{ status: "IN_PROGRESS", slaDueAt: due, resolvedAt: null }]);
    expect(result).toEqual({ total: 0, met: 0, breached: 0, attainmentPct: 0 });
  });

  it("counts met and breached", () => {
    const result = summarizeSlaAttainment([
      { status: "RESOLVED", slaDueAt: due, resolvedAt: at("2026-05-21T16:00:00Z") },
      { status: "RESOLVED", slaDueAt: due, resolvedAt: at("2026-05-21T18:00:00Z") }
    ]);
    expect(result).toEqual({ total: 2, met: 1, breached: 1, attainmentPct: 50 });
  });

  it("gives back paused time before judging", () => {
    // Resolved an hour late, but two hours were spent waiting on the
    // customer, so the SLA was met.
    const result = summarizeSlaAttainment([
      { status: "RESOLVED", slaDueAt: due, resolvedAt: at("2026-05-21T18:00:00Z"), slaPausedTotalMs: 2 * HOUR }
    ]);
    expect(result.met).toBe(1);
  });

  it("is 0% rather than NaN for an empty period", () => {
    expect(summarizeSlaAttainment([]).attainmentPct).toBe(0);
  });
});

describe("resolutionHours", () => {
  it("excludes paused time", () => {
    expect(
      resolutionHours([
        {
          createdAt: at("2026-05-21T09:00:00Z"),
          resolvedAt: at("2026-05-21T17:00:00Z"),
          slaPausedTotalMs: 2 * HOUR
        }
      ])
    ).toEqual([6]);
  });

  it("skips unresolved tickets and never goes negative", () => {
    expect(resolutionHours([{ createdAt: at("2026-05-21T09:00:00Z"), resolvedAt: null }])).toEqual([]);
    expect(
      resolutionHours([
        { createdAt: at("2026-05-21T09:00:00Z"), resolvedAt: at("2026-05-21T10:00:00Z"), slaPausedTotalMs: 99 * HOUR }
      ])
    ).toEqual([0]);
  });
});

describe("firstResponseHours", () => {
  it("measures from creation to the first reply", () => {
    expect(
      firstResponseHours([
        { createdAt: at("2026-05-21T09:00:00Z"), firstRespondedAt: at("2026-05-21T11:30:00Z") }
      ])
    ).toEqual([2.5]);
  });

  it("skips tickets nobody has answered", () => {
    expect(firstResponseHours([{ createdAt: at("2026-05-21T09:00:00Z"), firstRespondedAt: null }])).toEqual([]);
  });
});
