import { describe, expect, it } from "vitest";
import { MAX_BULK_TICKETS, planBulkStatusChange } from "@agentdesk/domain";

describe("planBulkStatusChange", () => {
  it("applies a legal transition to every ticket that can take it", () => {
    const plan = planBulkStatusChange(
      [
        { id: "a", status: "NEW" },
        { id: "b", status: "NEW" }
      ],
      "TRIAGE"
    );
    expect(plan.applied).toEqual(["a", "b"]);
    expect(plan.rejected).toEqual([]);
  });

  it("splits a mixed selection instead of failing the whole batch", () => {
    // The point of the story: one closed ticket must not block the rest.
    const plan = planBulkStatusChange(
      [
        { id: "ok", status: "NEW" },
        { id: "closed", status: "CLOSED" },
        { id: "also-ok", status: "TRIAGE" }
      ],
      "IN_PROGRESS"
    );
    expect(plan.applied).toEqual(["ok", "also-ok"]);
    expect(plan.rejected).toEqual([{ ticketId: "closed", reason: "Cannot move from CLOSED to IN_PROGRESS" }]);
  });

  it("gives a reason naming both ends of the refused transition", () => {
    // The agent has to know *why* without opening the ticket.
    const plan = planBulkStatusChange([{ id: "x", status: "NEW" }], "RESOLVED");
    expect(plan.rejected[0].reason).toContain("NEW");
    expect(plan.rejected[0].reason).toContain("RESOLVED");
  });

  it("skips tickets already in the target status rather than counting them as work", () => {
    // canTransitionTicket allows same-to-same, so without this these would
    // land in `applied` and write audit events that say nothing happened.
    const plan = planBulkStatusChange(
      [
        { id: "already", status: "ESCALATED" },
        { id: "moving", status: "IN_PROGRESS" }
      ],
      "ESCALATED"
    );
    expect(plan.applied).toEqual(["moving"]);
    expect(plan.rejected).toEqual([{ ticketId: "already", reason: "Already ESCALATED" }]);
  });

  it("returns an empty plan for an empty selection", () => {
    expect(planBulkStatusChange([], "TRIAGE")).toEqual({ applied: [], rejected: [] });
  });

  it("rejects every ticket when nothing can make the move", () => {
    const plan = planBulkStatusChange(
      [
        { id: "a", status: "CLOSED" },
        { id: "b", status: "CLOSED" }
      ],
      "NEW"
    );
    expect(plan.applied).toEqual([]);
    expect(plan.rejected).toHaveLength(2);
  });

  it("preserves the order it was given", () => {
    // The summary is read against the on-screen list, so order matters.
    const plan = planBulkStatusChange(
      [
        { id: "1", status: "NEW" },
        { id: "2", status: "CLOSED" },
        { id: "3", status: "NEW" }
      ],
      "TRIAGE"
    );
    expect(plan.applied).toEqual(["1", "3"]);
  });

  it("caps batches at a size that will not lock the table", () => {
    expect(MAX_BULK_TICKETS).toBeGreaterThan(0);
    expect(MAX_BULK_TICKETS).toBeLessThanOrEqual(500);
  });
});
