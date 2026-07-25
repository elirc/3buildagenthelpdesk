import { describe, expect, it } from "vitest";
import { MAX_REQUEUES, canRequeueJob, groupDeadLetters, normalizeErrorMessage } from "@agentdesk/domain";

describe("normalizeErrorMessage", () => {
  it("collapses varying numbers so the same failure groups together", () => {
    expect(normalizeErrorMessage("Webhook timeout after 10000ms")).toBe(
      normalizeErrorMessage("Webhook timeout after 9500ms")
    );
  });

  it("collapses hex ids", () => {
    expect(normalizeErrorMessage("Delivery to endpoint a3f9c1e2b8d4 failed")).toBe(
      normalizeErrorMessage("Delivery to endpoint 77bb99aa1122 failed")
    );
  });

  it("keeps genuinely different failures apart", () => {
    expect(normalizeErrorMessage("Webhook timeout after 10s")).not.toBe(
      normalizeErrorMessage("Permission denied: missing signing secret")
    );
  });

  it("handles a missing error message", () => {
    expect(normalizeErrorMessage(null)).toBe("(no error message)");
    expect(normalizeErrorMessage(undefined)).toBe("(no error message)");
    expect(normalizeErrorMessage("")).toBe("(no error message)");
  });

  it("normalises case and whitespace", () => {
    expect(normalizeErrorMessage("  Webhook   TIMEOUT  ")).toBe("webhook timeout");
  });
});

describe("groupDeadLetters", () => {
  const job = (type: any, errorMessage: string | null, id = "x") => ({ id, type, errorMessage });

  it("collapses identical failures into one group", () => {
    const groups = groupDeadLetters([
      job("WEBHOOK_DELIVERY", "Webhook timeout after 10000ms", "a"),
      job("WEBHOOK_DELIVERY", "Webhook timeout after 9000ms", "b"),
      job("WEBHOOK_DELIVERY", "Webhook timeout after 8000ms", "c")
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].jobs.map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the same error apart when the job type differs", () => {
    // "Timeout" from a webhook and from a data sync are different problems
    // with different fixes, even though the text matches.
    const groups = groupDeadLetters([
      job("WEBHOOK_DELIVERY", "Timeout"),
      job("DATA_SYNC", "Timeout")
    ]);
    expect(groups).toHaveLength(2);
  });

  it("orders the biggest group first", () => {
    const groups = groupDeadLetters([
      job("DATA_SYNC", "Malformed payload", "a"),
      job("WEBHOOK_DELIVERY", "Timeout after 1s", "b"),
      job("WEBHOOK_DELIVERY", "Timeout after 2s", "c"),
      job("WEBHOOK_DELIVERY", "Timeout after 3s", "d")
    ]);
    expect(groups[0].type).toBe("WEBHOOK_DELIVERY");
    expect(groups[0].count).toBe(3);
  });

  it("groups jobs with no error message together", () => {
    const groups = groupDeadLetters([job("DATA_SYNC", null, "a"), job("DATA_SYNC", null, "b")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedError).toBe("(no error message)");
  });

  it("returns nothing for an empty list", () => {
    expect(groupDeadLetters([])).toEqual([]);
  });
});

describe("canRequeueJob", () => {
  it("allows a dead-lettered job within its requeue budget", () => {
    expect(canRequeueJob({ status: "DEAD_LETTERED", requeueCount: 0 })).toBe(true);
    expect(canRequeueJob({ status: "DEAD_LETTERED", requeueCount: MAX_REQUEUES - 1 })).toBe(true);
  });

  it("refuses once the budget is spent", () => {
    // Past this point the job is the problem, not the dependency, and
    // requeuing it again is a loop rather than a recovery.
    expect(canRequeueJob({ status: "DEAD_LETTERED", requeueCount: MAX_REQUEUES })).toBe(false);
  });

  it("refuses a job that is not dead-lettered", () => {
    for (const status of ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRYING"] as const) {
      expect(canRequeueJob({ status, requeueCount: 0 })).toBe(false);
    }
  });
});
