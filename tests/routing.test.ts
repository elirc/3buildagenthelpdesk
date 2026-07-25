import { describe, expect, it } from "vitest";
import { conditionMatches, evaluateRoutingRules, routingRuleSchema } from "@agentdesk/domain";
import type { EvaluableRule, RoutableTicket } from "@agentdesk/domain";

const ticket: RoutableTicket = {
  title: "SSO login failing for finance team",
  description: "Users cannot authenticate after the morning deploy.",
  category: "ACCESS",
  priority: "HIGH",
  tags: ["sso", "production"],
  requesterEmail: "it-admin@acme.example"
};

const rule = (over: Partial<EvaluableRule> = {}): EvaluableRule => ({
  id: "r1",
  name: "Rule",
  priorityOrder: 100,
  isActive: true,
  conditions: [{ field: "CATEGORY", operator: "equals", value: "ACCESS" }],
  assignTeamId: "team-eng",
  ...over
});

describe("conditionMatches", () => {
  it("matches a category and rejects the wrong one", () => {
    expect(conditionMatches(ticket, { field: "CATEGORY", operator: "equals", value: "ACCESS" })).toBe(true);
    expect(conditionMatches(ticket, { field: "CATEGORY", operator: "equals", value: "BILLING" })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(conditionMatches(ticket, { field: "CATEGORY", operator: "equals", value: "access" })).toBe(true);
  });

  it("matches any one of the ticket's tags", () => {
    expect(conditionMatches(ticket, { field: "TAG", operator: "equals", value: "sso" })).toBe(true);
    expect(conditionMatches(ticket, { field: "TAG", operator: "equals", value: "billing" })).toBe(false);
  });

  it("treats free-text fields as substring regardless of operator", () => {
    // "equals" on a description is never what anyone means, and matching
    // nothing would look like a broken rule rather than a misconfigured one.
    expect(conditionMatches(ticket, { field: "TITLE_CONTAINS", operator: "equals", value: "sso" })).toBe(true);
    expect(conditionMatches(ticket, { field: "DESCRIPTION_CONTAINS", operator: "equals", value: "authenticate" })).toBe(
      true
    );
  });

  it("matches the email domain, not the whole address", () => {
    expect(conditionMatches(ticket, { field: "REQUESTER_EMAIL_DOMAIN", operator: "equals", value: "acme.example" })).toBe(
      true
    );
    expect(conditionMatches(ticket, { field: "REQUESTER_EMAIL_DOMAIN", operator: "equals", value: "acme" })).toBe(false);
  });

  it("never matches on an empty value", () => {
    expect(conditionMatches(ticket, { field: "TITLE_CONTAINS", operator: "contains", value: "   " })).toBe(false);
  });

  it("copes with a ticket that has no tags", () => {
    expect(conditionMatches({ ...ticket, tags: [] }, { field: "TAG", operator: "equals", value: "sso" })).toBe(false);
  });
});

describe("evaluateRoutingRules", () => {
  it("returns no match when there are no rules", () => {
    const decision = evaluateRoutingRules(ticket, []);
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.evaluated).toEqual([]);
  });

  it("applies a matching rule", () => {
    const decision = evaluateRoutingRules(ticket, [rule()]);
    expect(decision.matchedRuleId).toBe("r1");
    expect(decision.assignTeamId).toBe("team-eng");
  });

  it("requires every condition in a rule to hold", () => {
    const decision = evaluateRoutingRules(ticket, [
      rule({
        conditions: [
          { field: "CATEGORY", operator: "equals", value: "ACCESS" },
          { field: "TAG", operator: "equals", value: "billing" }
        ]
      })
    ]);
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.evaluated[0].failedCondition).toContain("TAG");
  });

  it("takes the first match in priority order, not document order", () => {
    const decision = evaluateRoutingRules(ticket, [
      rule({ id: "late", name: "Late", priorityOrder: 200, assignTeamId: "team-late" }),
      rule({ id: "early", name: "Early", priorityOrder: 10, assignTeamId: "team-early" })
    ]);
    expect(decision.matchedRuleId).toBe("early");
    expect(decision.assignTeamId).toBe("team-early");
  });

  it("stops at the first match and does not evaluate later rules", () => {
    const decision = evaluateRoutingRules(ticket, [
      rule({ id: "first", priorityOrder: 1 }),
      rule({ id: "second", priorityOrder: 2 })
    ]);
    expect(decision.evaluated).toHaveLength(1);
    expect(decision.evaluated[0].matched).toBe(true);
  });

  it("skips inactive rules and says why", () => {
    const decision = evaluateRoutingRules(ticket, [rule({ isActive: false })]);
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.evaluated[0].skippedReason).toBe("Rule is inactive");
  });

  it("refuses a rule with no conditions rather than matching everything", () => {
    const decision = evaluateRoutingRules(ticket, [rule({ conditions: [] })]);
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.evaluated[0].skippedReason).toBe("Rule has no conditions");
  });

  it("records why each non-matching rule failed", () => {
    const decision = evaluateRoutingRules(ticket, [
      rule({ id: "a", name: "A", priorityOrder: 1, conditions: [{ field: "CATEGORY", operator: "equals", value: "BILLING" }] }),
      rule({ id: "b", name: "B", priorityOrder: 2, conditions: [{ field: "TAG", operator: "equals", value: "sso" }] })
    ]);
    expect(decision.matchedRuleId).toBe("b");
    expect(decision.evaluated[0].failedCondition).toContain("CATEGORY");
  });

  it("breaks priority ties deterministically by name", () => {
    const a = evaluateRoutingRules(ticket, [
      rule({ id: "z", name: "Zeta", priorityOrder: 5, assignTeamId: "t-z" }),
      rule({ id: "a", name: "Alpha", priorityOrder: 5, assignTeamId: "t-a" })
    ]);
    expect(a.matchedRuleId).toBe("a");
  });
});

describe("routingRuleSchema", () => {
  it("accepts a well-formed rule", () => {
    const parsed = routingRuleSchema.parse({
      name: "Route access to engineering",
      conditions: [{ field: "CATEGORY", value: "ACCESS" }]
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.priorityOrder).toBe(100);
    expect(parsed.conditions[0].operator).toBe("equals");
  });

  it("requires at least one condition", () => {
    expect(() => routingRuleSchema.parse({ name: "Empty rule", conditions: [] })).toThrow();
  });

  it("rejects an unknown field", () => {
    expect(() => routingRuleSchema.parse({ name: "Bad", conditions: [{ field: "NONSENSE", value: "x" }] })).toThrow();
  });
});
