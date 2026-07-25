import { describe, expect, it } from "vitest";
import {
  articleSchema,
  assertArticleTransition,
  canTransitionArticle,
  scoreArticleRelevance,
  suggestArticles
} from "@agentdesk/domain";

const ticket = {
  title: "SSO login failing for finance team",
  description: "Users cannot authenticate through SAML after the morning deploy.",
  category: "ACCESS" as const,
  tags: ["sso", "production"]
};

const article = (over: any = {}) => ({
  id: "a1",
  title: "Troubleshooting SAML authentication failures",
  summary: "Steps to diagnose SAML and SSO login failures, including deploy-related regressions.",
  tags: ["sso"],
  category: "ACCESS" as const,
  status: "PUBLISHED" as const,
  ...over
});

describe("article lifecycle", () => {
  it("allows the documented transitions", () => {
    expect(canTransitionArticle("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransitionArticle("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canTransitionArticle("ARCHIVED", "DRAFT")).toBe(true);
  });

  it("refuses to republish straight from archived", () => {
    // Bringing back something retired for being wrong should take a
    // deliberate second step.
    expect(canTransitionArticle("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(() => assertArticleTransition("ARCHIVED", "PUBLISHED")).toThrow();
  });

  it("treats a no-op transition as allowed", () => {
    expect(canTransitionArticle("PUBLISHED", "PUBLISHED")).toBe(true);
  });
});

describe("scoreArticleRelevance", () => {
  it("explains every point it awards", () => {
    const { score, reasons } = scoreArticleRelevance(ticket, article());
    expect(score).toBeGreaterThan(0);
    const claimed = reasons
      .map((reason) => Number(reason.match(/\+(\d+)\)/)?.[1] ?? 0))
      .reduce((sum, value) => sum + value, 0);
    expect(claimed).toBe(score);
  });

  it("awards the category bonus only on a match", () => {
    const same = scoreArticleRelevance(ticket, article()).score;
    const different = scoreArticleRelevance(ticket, article({ category: "BILLING" })).score;
    expect(same - different).toBe(20);
  });

  it("caps the shared-tag bonus", () => {
    const many = scoreArticleRelevance(
      { ...ticket, tags: ["a", "b", "c", "d"] },
      article({ tags: ["a", "b", "c", "d"] })
    );
    expect(many.reasons.some((reason) => reason.includes("+15)"))).toBe(true);
  });

  it("scores an unrelated article near zero", () => {
    const unrelated = article({
      title: "Expense report submission deadlines",
      summary: "When to submit expenses and which approvals are required.",
      tags: ["finance"],
      category: "BILLING"
    });
    expect(scoreArticleRelevance(ticket, unrelated).score).toBeLessThan(20);
  });

  it("never exceeds 100", () => {
    expect(scoreArticleRelevance(ticket, article({ title: ticket.title, summary: ticket.description })).score)
      .toBeLessThanOrEqual(100);
  });
});

describe("suggestArticles", () => {
  it("suggests only published articles", () => {
    // A draft is unfinished and an archived one was retired on purpose.
    const results = suggestArticles(ticket, [
      article({ id: "draft", status: "DRAFT" }),
      article({ id: "archived", status: "ARCHIVED" }),
      article({ id: "live", status: "PUBLISHED" })
    ]);
    expect(results.map((r) => r.article.id)).toEqual(["live"]);
  });

  it("orders by score and respects the limit", () => {
    const results = suggestArticles(
      ticket,
      [
        article({ id: "weak", title: "Printer setup", summary: "How to add a printer.", tags: [], category: "OTHER" }),
        article({ id: "strong" }),
        article({ id: "middling", category: "ACCESS", tags: [], title: "SAML notes", summary: "Notes about SAML." })
      ],
      2
    );
    expect(results[0].article.id).toBe("strong");
    expect(results).toHaveLength(2);
  });

  it("returns nothing when no article is relevant", () => {
    const irrelevant = article({
      id: "x",
      title: "Office parking policy",
      summary: "Where to park and how to register a vehicle.",
      tags: [],
      category: "OTHER"
    });
    expect(suggestArticles(ticket, [irrelevant])).toEqual([]);
  });

  it("copes with an empty library", () => {
    expect(suggestArticles(ticket, [])).toEqual([]);
  });

  it("is stable for equal scores", () => {
    const a = suggestArticles(ticket, [article({ id: "b" }), article({ id: "a" })]);
    expect(a.map((r) => r.article.id)).toEqual(["a", "b"]);
  });
});

describe("articleSchema", () => {
  it("defaults to draft", () => {
    const parsed = articleSchema.parse({
      title: "Troubleshooting SAML",
      summary: "A summary that is comfortably long enough to be useful.",
      body: "A body that is comfortably longer than the fifty character minimum imposed by the schema."
    });
    expect(parsed.status).toBe("DRAFT");
  });

  it("rejects a summary or body that is too short to help", () => {
    expect(() => articleSchema.parse({ title: "Valid title", summary: "Too short", body: "x".repeat(60) })).toThrow();
    expect(() => articleSchema.parse({ title: "Valid title", summary: "x".repeat(30), body: "Too short" })).toThrow();
  });
});
