import { describe, expect, it } from "vitest";
import { redactSensitiveMetadata } from "@agentdesk/observability";
import { assertCanAccessRecord, scopedWhere } from "../apps/web/lib/access";
import {
  DEFAULT_TICKET_SORT,
  TICKET_SORT_KEYS,
  pageHref,
  parsePagination,
  parseSort,
  sortHref,
  sortIndicator,
  totalPages,
  type TicketSortKey
} from "../apps/web/lib/pagination";

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

describe("list sorting", () => {
  it("accepts a key from the allowlist", () => {
    expect(parseSort<TicketSortKey>("priority", "asc", TICKET_SORT_KEYS, DEFAULT_TICKET_SORT)).toEqual({
      key: "priority",
      direction: "asc"
    });
  });

  it("falls back to the default for a key that is not on the allowlist", () => {
    // The sort key reaches Prisma's orderBy. If an unknown column got
    // through, the query would throw at runtime and the page would 500 —
    // so an unrecognised key must degrade to the default, not propagate.
    expect(parseSort<TicketSortKey>("secretColumn", "desc", TICKET_SORT_KEYS, DEFAULT_TICKET_SORT)).toEqual(
      DEFAULT_TICKET_SORT
    );
  });

  it("does not pass through injection-shaped input", () => {
    const injected = parseSort<TicketSortKey>(
      "id; DROP TABLE tickets;--",
      "desc",
      TICKET_SORT_KEYS,
      DEFAULT_TICKET_SORT
    );
    expect(injected).toEqual(DEFAULT_TICKET_SORT);
    expect(TICKET_SORT_KEYS).toContain(injected.key);
  });

  it("falls back for empty, missing, and invalid directions", () => {
    expect(parseSort<TicketSortKey>("", "", TICKET_SORT_KEYS, DEFAULT_TICKET_SORT)).toEqual(DEFAULT_TICKET_SORT);
    expect(parseSort<TicketSortKey>(undefined, undefined, TICKET_SORT_KEYS, DEFAULT_TICKET_SORT)).toEqual(
      DEFAULT_TICKET_SORT
    );
    expect(parseSort<TicketSortKey>("status", "sideways", TICKET_SORT_KEYS, DEFAULT_TICKET_SORT)).toEqual({
      key: "status",
      direction: "desc"
    });
  });

  it("toggles direction on the active column and preserves filters", () => {
    const current = { key: "updatedAt", direction: "desc" } as const;
    const href = sortHref("/tickets", { status: "NEW", page: "4" }, current, "updatedAt");

    expect(href).toContain("status=NEW");
    expect(href).toContain("direction=asc");
    // Reordering invalidates the current page — page 4 of a different
    // ordering is a set of rows the user has no reason to expect.
    expect(href).not.toContain("page=4");
  });

  it("sorts a newly selected column descending", () => {
    const current = { key: "updatedAt", direction: "asc" } as const;
    expect(sortHref("/tickets", {}, current, "priority")).toBe("/tickets?sort=priority&direction=desc");
  });

  it("marks only the active column", () => {
    const current = { key: "priority", direction: "asc" } as const;
    expect(sortIndicator(current, "priority")).toBe(" ↑");
    expect(sortIndicator(current, "updatedAt")).toBe("");
  });

  it("reports at least one page even when there are no results", () => {
    expect(totalPages(0, 50)).toBe(1);
    expect(totalPages(50, 50)).toBe(1);
    expect(totalPages(51, 50)).toBe(2);
  });
});
