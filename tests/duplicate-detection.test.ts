import { describe, expect, it } from "vitest";
import { duplicateDetectionAgent, jaccardSimilarity, scoreDuplicateCandidate, tokenize } from "@agentdesk/agents";
import type { DuplicateCandidate, DuplicateDetectionInput } from "@agentdesk/agents";

const baseTicket: DuplicateDetectionInput["ticket"] = {
  id: "t-main",
  title: "Acme users cannot log in with SSO",
  description: "SSO login spins then fails for the finance team.",
  category: "ACCESS",
  customerName: "Acme Corp",
  createdAt: "2026-05-21T09:00:00.000Z",
  incidentId: "inc-1",
  tags: ["sso", "production"]
};

const candidate = (over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id: "t-other",
  title: "Globex users cannot log in with SSO",
  description: "SSO login failures after password reset.",
  category: "ACCESS",
  customerName: "Globex",
  status: "TRIAGE",
  createdAt: "2026-05-21T09:30:00.000Z",
  incidentId: "inc-1",
  tags: ["sso"],
  ...over
});

const run = (input: DuplicateDetectionInput) =>
  duplicateDetectionAgent.run({ targetType: "TICKET", targetId: input.ticket.id, input });

describe("tokenize", () => {
  it("drops stopwords and short words", () => {
    const tokens = tokenize("The user cannot log in to the app");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("cannot")).toBe(false);
    expect(tokens.has("log")).toBe(true);
  });

  it("drops the filler words that appear in every support ticket", () => {
    // Without this, "Issue with login" and "Issue with billing" share a
    // token and look related.
    const tokens = tokenize("Issue error problem with billing");
    expect(tokens.has("issue")).toBe(false);
    expect(tokens.has("error")).toBe(false);
    expect(tokens.has("billing")).toBe(true);
  });

  it("ignores punctuation and case", () => {
    expect(tokenize("SSO login!")).toEqual(tokenize("sso   LOGIN"));
  });
});

describe("jaccardSimilarity", () => {
  it("is 1 for identical sets and 0 for disjoint ones", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("is 0 when either side is empty rather than dividing by zero", () => {
    expect(jaccardSimilarity(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
});

describe("scoreDuplicateCandidate", () => {
  it("explains every point it awards", () => {
    // The reasons must reconstruct the total, or the score is not actionable.
    const { similarity, reasons } = scoreDuplicateCandidate(baseTicket, candidate());
    expect(similarity).toBeGreaterThan(0);
    const claimed = reasons
      .map((reason) => Number(reason.match(/\+(\d+)\)/)?.[1] ?? 0))
      .reduce((sum, value) => sum + value, 0);
    expect(claimed).toBe(similarity);
  });

  it("awards the same-customer bonus only for the same customer", () => {
    const other = scoreDuplicateCandidate(baseTicket, candidate()).similarity;
    const same = scoreDuplicateCandidate(baseTicket, candidate({ customerName: "Acme Corp" })).similarity;
    expect(same - other).toBe(15);
  });

  it("awards the shared-incident bonus only when both point at one incident", () => {
    const linked = scoreDuplicateCandidate(baseTicket, candidate()).similarity;
    const unlinked = scoreDuplicateCandidate(baseTicket, candidate({ incidentId: null })).similarity;
    expect(linked - unlinked).toBe(20);
  });

  it("caps the shared-tag bonus", () => {
    const many = scoreDuplicateCandidate(
      { ...baseTicket, tags: ["a", "b", "c", "d", "e"] },
      candidate({ tags: ["a", "b", "c", "d", "e"] })
    );
    expect(many.reasons.some((reason) => reason.includes("+9)"))).toBe(true);
  });

  it("never exceeds 100", () => {
    const identical = scoreDuplicateCandidate(baseTicket, candidate({ ...baseTicket, status: "TRIAGE" }));
    expect(identical.similarity).toBeLessThanOrEqual(100);
  });
});

describe("duplicateDetectionAgent", () => {
  it("recommends merging an obvious open duplicate", () => {
    const result = run({ ticket: baseTicket, candidates: [candidate({ customerName: "Acme Corp" })] });
    expect(result.output.bestMatchId).toBe("t-other");
    expect(result.output.matches[0].similarity).toBeGreaterThanOrEqual(70);
    expect(result.output.shouldRecommendMerge).toBe(true);
  });

  it("does not recommend merging into a closed ticket", () => {
    // A strong match that is already resolved is history, not a triage
    // decision — merging into it would reopen settled work.
    const result = run({
      ticket: baseTicket,
      candidates: [candidate({ customerName: "Acme Corp", status: "CLOSED" })]
    });
    expect(result.output.matches[0].similarity).toBeGreaterThanOrEqual(70);
    expect(result.output.shouldRecommendMerge).toBe(false);
    expect(result.trace.some((step) => step.step === "closed_best_match")).toBe(true);
  });

  it("scores an unrelated ticket low and recommends nothing", () => {
    const result = run({
      ticket: baseTicket,
      candidates: [
        candidate({
          id: "t-billing",
          title: "Invoice total does not match contract",
          category: "BILLING",
          customerName: "Initech",
          incidentId: null,
          tags: ["billing"],
          createdAt: "2026-04-01T09:00:00.000Z"
        })
      ]
    });
    expect(result.output.shouldRecommendMerge).toBe(false);
    expect(result.output.matches[0]?.similarity ?? 0).toBeLessThan(70);
  });

  it("handles an empty candidate list without throwing", () => {
    const result = run({ ticket: baseTicket, candidates: [] });
    expect(result.output.bestMatchId).toBeNull();
    expect(result.output.matches).toEqual([]);
    expect(result.output.shouldRecommendMerge).toBe(false);
  });

  it("is deterministic — the same input twice is byte-identical", () => {
    // Replay and version-diff (Story E1) depend on this. Ties are broken by
    // id precisely so ordering cannot vary between runs.
    const input = {
      ticket: baseTicket,
      candidates: [candidate({ id: "b" }), candidate({ id: "a" }), candidate({ id: "c" })]
    };
    expect(JSON.stringify(run(input))).toBe(JSON.stringify(run(input)));
  });

  it("states plainly that it does not understand meaning", () => {
    const result = run({ ticket: baseTicket, candidates: [] });
    expect(result.limitations.join(" ")).toMatch(/word overlap, not meaning/i);
  });

  it("only supports ticket targets", () => {
    expect(duplicateDetectionAgent.supportedTargets).toEqual(["TICKET"]);
  });
});
