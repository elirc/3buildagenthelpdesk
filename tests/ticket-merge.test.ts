import { describe, expect, it } from "vitest";
import { canMergeTickets, mergeTags } from "@agentdesk/domain";

const t = (over: any = {}) => ({ id: "a", status: "TRIAGE" as const, mergedIntoId: null, ...over });

describe("canMergeTickets", () => {
  it("allows merging two distinct open tickets", () => {
    expect(canMergeTickets({ source: t({ id: "a" }), target: t({ id: "b" }) })).toEqual({ ok: true });
  });

  it("refuses a self-merge", () => {
    expect(canMergeTickets({ source: t({ id: "a" }), target: t({ id: "a" }) }).ok).toBe(false);
  });

  it("refuses a source that has already been merged", () => {
    const result = canMergeTickets({ source: t({ id: "a", mergedIntoId: "c" }), target: t({ id: "b" }) });
    expect(result).toEqual({ ok: false, reason: "This ticket has already been merged." });
  });

  it("refuses chaining into an already-merged target", () => {
    // Otherwise A points at B which points at C, and every consumer has to
    // walk the chain to find the ticket anyone is actually working.
    const result = canMergeTickets({ source: t({ id: "a" }), target: t({ id: "b", mergedIntoId: "c" }) });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain("surviving ticket");
  });

  it("refuses merging into a closed ticket", () => {
    expect(canMergeTickets({ source: t({ id: "a" }), target: t({ id: "b", status: "CLOSED" }) }).ok).toBe(false);
  });

  it("allows merging a closed source into an open target", () => {
    // The source is about to be closed anyway; its state does not matter.
    expect(canMergeTickets({ source: t({ id: "a", status: "CLOSED" }), target: t({ id: "b" }) }).ok).toBe(true);
  });
});

describe("mergeTags", () => {
  it("unions and de-duplicates", () => {
    expect(mergeTags(["sso", "production"], ["production", "auth"]).sort()).toEqual(["auth", "production", "sso"]);
  });

  it("normalises case and whitespace", () => {
    expect(mergeTags([" SSO "], ["sso"])).toEqual(["sso"]);
  });

  it("drops empties and copes with empty inputs", () => {
    expect(mergeTags([], [])).toEqual([]);
    expect(mergeTags(["a", "", "  "], [])).toEqual(["a"]);
  });
});
