import { describe, expect, it } from "vitest";
import { calculateFirstResponseDueAt, getFirstResponseState, qualifiesAsFirstResponse } from "@agentdesk/domain";

const at = (iso: string) => new Date(iso);
const CREATED = at("2026-05-21T09:00:00.000Z");

describe("calculateFirstResponseDueAt", () => {
  it("is much tighter than the resolution SLA, and scales with priority", () => {
    expect(calculateFirstResponseDueAt("CRITICAL", CREATED).toISOString()).toBe("2026-05-21T09:30:00.000Z");
    expect(calculateFirstResponseDueAt("HIGH", CREATED).toISOString()).toBe("2026-05-21T11:00:00.000Z");
    expect(calculateFirstResponseDueAt("MEDIUM", CREATED).toISOString()).toBe("2026-05-21T17:00:00.000Z");
    expect(calculateFirstResponseDueAt("LOW", CREATED).toISOString()).toBe("2026-05-22T09:00:00.000Z");
  });
});

describe("qualifiesAsFirstResponse", () => {
  const requester = "it-admin@acme.example";

  it("counts a public reply from an agent", () => {
    expect(qualifiesAsFirstResponse({ isInternal: false, authorEmail: "maya@agentdesk.local" }, requester)).toBe(true);
  });

  it("does not count an internal note", () => {
    // An internal note is us talking to ourselves. The customer has still
    // heard nothing, and counting it would satisfy the metric without
    // anyone contacting anybody.
    expect(qualifiesAsFirstResponse({ isInternal: true, authorEmail: "maya@agentdesk.local" }, requester)).toBe(false);
  });

  it("does not count the requester replying to themselves", () => {
    // Their own message must not discharge our obligation to answer it.
    expect(qualifiesAsFirstResponse({ isInternal: false, authorEmail: requester }, requester)).toBe(false);
  });

  it("compares addresses case- and whitespace-insensitively", () => {
    expect(qualifiesAsFirstResponse({ isInternal: false, authorEmail: "  IT-Admin@Acme.Example " }, requester)).toBe(
      false
    );
  });
});

describe("getFirstResponseState", () => {
  const due = at("2026-05-21T11:00:00.000Z");

  it("reports untracked when the ticket predates the feature", () => {
    // Existing rows carry NULL. They must read as "not tracked", never as
    // a breach — that is what makes this shippable without a backfill.
    expect(getFirstResponseState({ firstResponseDueAt: null, now: at("2026-06-01T00:00:00.000Z") })).toBe("untracked");
  });

  it("counts down while nobody has replied", () => {
    expect(getFirstResponseState({ firstResponseDueAt: due, now: at("2026-05-21T09:15:00.000Z") })).toBe("pending");
    expect(getFirstResponseState({ firstResponseDueAt: due, now: at("2026-05-21T10:30:00.000Z") })).toBe("approaching");
    expect(getFirstResponseState({ firstResponseDueAt: due, now: at("2026-05-21T11:30:00.000Z") })).toBe("breached");
  });

  it("separates a reply that was on time from one that was late", () => {
    // Both are terminal — the customer is no longer waiting — but a single
    // "met" would hide the fact that it took too long.
    expect(
      getFirstResponseState({ firstRespondedAt: at("2026-05-21T10:00:00.000Z"), firstResponseDueAt: due })
    ).toBe("met");
    expect(
      getFirstResponseState({ firstRespondedAt: at("2026-05-21T12:00:00.000Z"), firstResponseDueAt: due })
    ).toBe("late");
  });

  it("stops counting down once answered, however long ago", () => {
    expect(
      getFirstResponseState({
        firstRespondedAt: at("2026-05-21T10:00:00.000Z"),
        firstResponseDueAt: due,
        now: at("2026-07-01T00:00:00.000Z")
      })
    ).toBe("met");
  });
});
