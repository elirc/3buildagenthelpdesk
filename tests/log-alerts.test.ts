import { describe, expect, it } from "vitest";
import { autoIncidentTitle, evaluateLogAlertRule, logAlertRuleSchema } from "@agentdesk/domain";

const NOW = new Date("2026-05-21T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const rule = (over: Partial<Parameters<typeof evaluateLogAlertRule>[0]["rule"]> = {}) => ({
  isActive: true,
  thresholdCount: 5,
  cooldownMinutes: 60,
  minAnomalyScore: 70,
  lastFiredAt: null as Date | null,
  ...over
});

const evaluate = (over: Partial<Parameters<typeof evaluateLogAlertRule>[0]> = {}) =>
  evaluateLogAlertRule({ rule: rule(), matchedCount: 10, anomalyScore: 85, now: NOW, ...over });

describe("evaluateLogAlertRule", () => {
  it("fires when the threshold and the score are both met", () => {
    const result = evaluate();
    expect(result.shouldFire).toBe(true);
    expect(result.reason).toContain("10 matching");
  });

  it("does not fire one short of the threshold, and does at it", () => {
    expect(evaluate({ matchedCount: 4 }).shouldFire).toBe(false);
    expect(evaluate({ matchedCount: 5 }).shouldFire).toBe(true);
  });

  it("explains a below-threshold miss with both numbers", () => {
    // A rule that silently does not fire is indistinguishable from a
    // broken one.
    expect(evaluate({ matchedCount: 2 }).reason).toBe("Only 2 matching log(s); threshold is 5.");
  });

  it("does not fire when the anomaly score is too low", () => {
    const result = evaluate({ anomalyScore: 40 });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toContain("below the minimum");
  });

  it("suppresses a repeat inside the cooldown", () => {
    const result = evaluate({ rule: rule({ lastFiredAt: ago(30) }) });
    expect(result.shouldFire).toBe(false);
    expect(result.inCooldown).toBe(true);
    // The reason distinguishes "would have fired" from "did not qualify".
    expect(result.reason).toContain("fired within the last");
  });

  it("fires again once the cooldown has elapsed", () => {
    expect(evaluate({ rule: rule({ lastFiredAt: ago(61) }) }).shouldFire).toBe(true);
  });

  it("treats the cooldown boundary as elapsed", () => {
    expect(evaluate({ rule: rule({ lastFiredAt: ago(60) }) }).shouldFire).toBe(true);
  });

  it("never fires an inactive rule, however severe the condition", () => {
    const result = evaluate({ rule: rule({ isActive: false }), matchedCount: 9999, anomalyScore: 100 });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBe("Rule is inactive.");
  });

  it("fires the first time, when nothing has fired before", () => {
    expect(evaluate({ rule: rule({ lastFiredAt: null }) }).inCooldown).toBe(false);
  });

  it("reports cooldown state even when the condition was not met", () => {
    // So the page can show "recently fired" next to a rule that is quiet
    // for a different reason.
    const result = evaluate({ rule: rule({ lastFiredAt: ago(10) }), matchedCount: 1 });
    expect(result.inCooldown).toBe(true);
    expect(result.reason).toContain("threshold");
  });
});

describe("autoIncidentTitle", () => {
  it("names the service when there is one", () => {
    expect(autoIncidentTitle("Auth errors", "auth-service")).toBe("Auth errors: elevated errors in auth-service");
  });

  it("copes with a rule that watches every service", () => {
    expect(autoIncidentTitle("Any errors", null)).toBe("Any errors: elevated error volume");
  });
});

describe("logAlertRuleSchema", () => {
  it("applies sensible defaults", () => {
    const parsed = logAlertRuleSchema.parse({ name: "Auth errors" });
    expect(parsed.thresholdCount).toBe(5);
    expect(parsed.action).toBe("NOTIFY_ONLY");
    expect(parsed.cooldownMinutes).toBe(60);
  });

  it("rejects a threshold or window of zero", () => {
    // A threshold of 0 fires on silence; a window of 0 matches nothing.
    expect(() => logAlertRuleSchema.parse({ name: "Bad", thresholdCount: 0 })).toThrow();
    expect(() => logAlertRuleSchema.parse({ name: "Bad", windowMinutes: 0 })).toThrow();
  });

  it("rejects an unknown action", () => {
    expect(() => logAlertRuleSchema.parse({ name: "Bad", action: "DELETE_EVERYTHING" })).toThrow();
  });
});
