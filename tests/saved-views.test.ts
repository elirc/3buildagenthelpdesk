import { describe, expect, it } from "vitest";
import { canEditSavedView, describeViewQuery, sanitizeViewQuery, savedViewSchema } from "@agentdesk/domain";

describe("sanitizeViewQuery", () => {
  it("keeps the filters a resource is allowed to save", () => {
    expect(sanitizeViewQuery("tickets", "status=NEW&priority=CRITICAL")).toBe("status=NEW&priority=CRITICAL");
  });

  it("drops pagination", () => {
    // "My critical tickets, page 4" is not a view anyone means to save.
    expect(sanitizeViewQuery("tickets", "status=NEW&page=4&pageSize=200")).toBe("status=NEW");
  });

  it("drops keys that are not on the allowlist", () => {
    // The stored string later becomes a URL the app navigates to. An
    // allowlist means a new query parameter elsewhere in the app cannot be
    // smuggled in through an old saved view.
    expect(sanitizeViewQuery("tickets", "status=NEW&redirect=https://evil.example&admin=true")).toBe("status=NEW");
  });

  it("scopes the allowlist per resource", () => {
    // `severity` is meaningful for incidents and meaningless for tickets.
    expect(sanitizeViewQuery("incidents", "severity=SEV1&status=INVESTIGATING")).toContain("severity=SEV1");
    expect(sanitizeViewQuery("tickets", "severity=SEV1")).toBe("");
  });

  it("emits keys in a stable order regardless of input order", () => {
    // Same filters must produce the same string, or the unique constraint
    // on (owner, resource, name) compares strings that only look different.
    expect(sanitizeViewQuery("tickets", "priority=HIGH&status=NEW")).toBe(
      sanitizeViewQuery("tickets", "status=NEW&priority=HIGH")
    );
  });

  it("handles an empty query, a lone '?', and blank values", () => {
    expect(sanitizeViewQuery("tickets", "")).toBe("");
    expect(sanitizeViewQuery("tickets", "?status=NEW")).toBe("status=NEW");
    expect(sanitizeViewQuery("tickets", "status=&priority=HIGH")).toBe("priority=HIGH");
  });

  it("trims surrounding whitespace in values", () => {
    expect(sanitizeViewQuery("tickets", "q=%20acme%20")).toBe("q=acme");
  });

  it("preserves sort and direction", () => {
    expect(sanitizeViewQuery("tickets", "sort=priority&direction=asc")).toBe("sort=priority&direction=asc");
  });
});

describe("describeViewQuery", () => {
  it("summarises filters and omits ordering", () => {
    expect(describeViewQuery("status=NEW&priority=HIGH&sort=updatedAt&direction=desc")).toBe(
      "status: NEW, priority: HIGH"
    );
  });

  it("says so when a view has no filters", () => {
    expect(describeViewQuery("")).toBe("No filters");
    expect(describeViewQuery("sort=priority&direction=asc")).toBe("No filters");
  });
});

describe("canEditSavedView", () => {
  const owner = { id: "u1", role: "SUPPORT_AGENT" as const };
  const other = { id: "u2", role: "SUPPORT_AGENT" as const };
  const admin = { id: "u3", role: "ADMIN" as const };

  it("lets the owner edit their own view", () => {
    expect(canEditSavedView(owner, { ownerId: "u1" })).toBe(true);
  });

  it("does not let a colleague edit someone else's view", () => {
    // Sharing a view does not surrender it — otherwise a colleague could
    // delete something the whole team relies on.
    expect(canEditSavedView(other, { ownerId: "u1" })).toBe(false);
  });

  it("lets an admin edit anyone's view", () => {
    expect(canEditSavedView(admin, { ownerId: "u1" })).toBe(true);
  });
});

describe("savedViewSchema", () => {
  it("accepts a well-formed view and defaults to private", () => {
    const parsed = savedViewSchema.parse({ name: "My criticals", resource: "tickets", queryString: "priority=CRITICAL" });
    expect(parsed.isShared).toBe(false);
  });

  it("rejects a name that is too short and a resource that is not a page", () => {
    expect(() => savedViewSchema.parse({ name: "x", resource: "tickets", queryString: "" })).toThrow();
    expect(() => savedViewSchema.parse({ name: "Fine", resource: "nonsense", queryString: "" })).toThrow();
  });
});
