import { describe, expect, it } from "vitest";
import { MATERIAL_CONFIDENCE_DELTA, diffAgentOutputs } from "@agentdesk/agents";
import type { AgentRunResult } from "@agentdesk/agents";

const run = (over: Partial<AgentRunResult> = {}): AgentRunResult => ({
  agentType: "TICKET_SUMMARIZATION",
  summary: "A summary",
  findings: ["Suspected category: ACCESS"],
  recommendations: ["Acknowledge impact"],
  limitations: ["Heuristics only"],
  confidenceScore: 70,
  output: { urgencyScore: 60, recommendedOwnerTeam: "Support", nested: { depth: 1 } },
  trace: [{ step: "one", observation: "first" }],
  ...over
});

describe("diffAgentOutputs", () => {
  it("reports identical when nothing moved", () => {
    const diff = diffAgentOutputs(run(), run());
    expect(diff.verdict).toBe("identical");
    expect(diff.confidenceDelta).toBe(0);
    expect(diff.changedFields).toEqual([]);
  });

  it("treats a small confidence nudge as cosmetic", () => {
    const diff = diffAgentOutputs(run(), run({ confidenceScore: 73 }));
    expect(diff.confidenceDelta).toBe(3);
    expect(diff.verdict).toBe("cosmetic");
  });

  it("treats a large confidence move as material", () => {
    const diff = diffAgentOutputs(run(), run({ confidenceScore: 90 }));
    expect(diff.confidenceDelta).toBe(20);
    expect(diff.verdict).toBe("material");
  });

  it("is exclusive at the threshold", () => {
    const atEdge = diffAgentOutputs(run(), run({ confidenceScore: 70 + MATERIAL_CONFIDENCE_DELTA }));
    expect(atEdge.verdict).toBe("cosmetic");
    const past = diffAgentOutputs(run(), run({ confidenceScore: 70 + MATERIAL_CONFIDENCE_DELTA + 1 }));
    expect(past.verdict).toBe("material");
  });

  it("treats an added finding as material regardless of confidence", () => {
    // Findings are what a human reads and acts on, so any change to them
    // is a change in behaviour even if the number did not move.
    const diff = diffAgentOutputs(run(), run({ findings: ["Suspected category: ACCESS", "New signal"] }));
    expect(diff.addedFindings).toEqual(["New signal"]);
    expect(diff.verdict).toBe("material");
  });

  it("reports a removed recommendation", () => {
    const diff = diffAgentOutputs(run(), run({ recommendations: [] }));
    expect(diff.removedRecommendations).toEqual(["Acknowledge impact"]);
    expect(diff.verdict).toBe("material");
  });

  it("reports a changed nested output field at its full path", () => {
    // "the whole output changed" would be true and useless.
    const diff = diffAgentOutputs(run(), run({ output: { urgencyScore: 60, recommendedOwnerTeam: "Support", nested: { depth: 2 } } }));
    expect(diff.changedFields).toEqual([{ path: "nested.depth", before: 1, after: 2 }]);
  });

  it("reports a field that appeared or disappeared", () => {
    const diff = diffAgentOutputs(run({ output: { a: 1 } }), run({ output: { a: 1, b: 2 } }));
    expect(diff.changedFields).toEqual([{ path: "b", before: undefined, after: 2 }]);
  });

  it("ignores key ordering", () => {
    const a = diffAgentOutputs(run({ output: { x: 1, y: 2 } }), run({ output: { y: 2, x: 1 } }));
    expect(a.changedFields).toEqual([]);
    expect(a.verdict).toBe("identical");
  });

  it("counts trace steps on both sides", () => {
    const diff = diffAgentOutputs(run(), run({ trace: [{ step: "one", observation: "first" }, { step: "two", observation: "second" }] }));
    expect(diff.traceStepsBefore).toBe(1);
    expect(diff.traceStepsAfter).toBe(2);
  });

  it("copes with empty arrays on both sides", () => {
    const empty = run({ findings: [], recommendations: [], trace: [], output: {} });
    expect(diffAgentOutputs(empty, empty).verdict).toBe("identical");
  });
});
