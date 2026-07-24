import { describe, expect, it } from "vitest";
import { redactSensitiveMetadata } from "@agentdesk/observability";
import { assertCanAccessRecord, scopedWhere } from "../apps/web/lib/access";
import { pageHref, parsePagination } from "../apps/web/lib/pagination";

describe("production hardening integration contracts", () => {
  const user = { id: "user-1", role: "SUPPORT_AGENT" as const, organizationId: "org-1" };

  it("scopes query objects by the active user's organization", () => {
    expect(scopedWhere(user, { status: "OPEN" })).toEqual({
      organizationId: "org-1",
      status: "OPEN"
    });
  });

  it("rejects records outside the active organization", () => {
    expect(() => assertCanAccessRecord(user, { organizationId: "org-2" }, "Ticket")).toThrow(
      "Ticket was not found or is outside the active organization."
    );
  });

  it("redacts sensitive nested metadata before persistence", () => {
    expect(
      redactSensitiveMetadata({
        requestId: "req-1",
        apiKey: "secret",
        nested: { authorization: "Bearer token", safe: "kept" },
        items: [{ sessionToken: "abc" }]
      })
    ).toEqual({
      requestId: "req-1",
      apiKey: "[redacted]",
      nested: { authorization: "[redacted]", safe: "kept" },
      items: [{ sessionToken: "[redacted]" }]
    });
  });

  it("bounds pagination params and preserves filters in page links", () => {
    expect(parsePagination({ page: "-10", pageSize: "999" })).toEqual({
      page: 1,
      pageSize: 200,
      skip: 0,
      take: 200
    });
    expect(pageHref("/audit", { action: "ticket.updated", page: "2" }, 3)).toBe("/audit?action=ticket.updated&page=3");
  });
});
