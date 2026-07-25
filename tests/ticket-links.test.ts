import { describe, expect, it } from "vitest";
import {
  TICKET_LINK_TYPES,
  inverseTicketLinkLabel,
  linkedTicketIds,
  ticketLinkLabel,
  validateTicketLink,
  type ExistingLink
} from "@agentdesk/domain";

const A = "ticket-a";
const B = "ticket-b";
const C = "ticket-c";

describe("validateTicketLink", () => {
  it("accepts a link between two different tickets", () => {
    expect(validateTicketLink({ sourceTicketId: A, targetTicketId: B, linkType: "RELATED_TO", existingLinks: [] })).toEqual({
      ok: true
    });
  });

  it("rejects a self-link", () => {
    const result = validateTicketLink({ sourceTicketId: A, targetTicketId: A, linkType: "RELATED_TO", existingLinks: [] });
    expect(result).toEqual({ ok: false, reason: "A ticket cannot be linked to itself." });
  });

  it("rejects an exact duplicate of an existing link", () => {
    const existing: ExistingLink[] = [{ sourceTicketId: A, targetTicketId: B, linkType: "BLOCKS" }];
    const result = validateTicketLink({ sourceTicketId: A, targetTicketId: B, linkType: "BLOCKS", existingLinks: existing });
    expect(result.ok).toBe(false);
  });

  it("allows a different link type between the same pair", () => {
    // "A blocks B" and "A is related to B" are both true statements.
    const existing: ExistingLink[] = [{ sourceTicketId: A, targetTicketId: B, linkType: "BLOCKS" }];
    expect(
      validateTicketLink({ sourceTicketId: A, targetTicketId: B, linkType: "RELATED_TO", existingLinks: existing }).ok
    ).toBe(true);
  });

  it("rejects the reverse of an existing DUPLICATE_OF", () => {
    // If A duplicates B, then B duplicating A says each is the canonical
    // copy of the other, and nothing downstream can pick a winner.
    const existing: ExistingLink[] = [{ sourceTicketId: A, targetTicketId: B, linkType: "DUPLICATE_OF" }];
    const result = validateTicketLink({
      sourceTicketId: B,
      targetTicketId: A,
      linkType: "DUPLICATE_OF",
      existingLinks: existing
    });
    expect(result).toEqual({ ok: false, reason: "The other ticket is already marked as a duplicate of this one." });
  });

  it("allows the reverse of a RELATED_TO", () => {
    // Symmetric in meaning, so the mirror image is redundant rather than
    // contradictory. Not worth blocking.
    const existing: ExistingLink[] = [{ sourceTicketId: A, targetTicketId: B, linkType: "RELATED_TO" }];
    expect(
      validateTicketLink({ sourceTicketId: B, targetTicketId: A, linkType: "RELATED_TO", existingLinks: existing }).ok
    ).toBe(true);
  });

  it("does not confuse links belonging to other tickets", () => {
    const existing: ExistingLink[] = [{ sourceTicketId: A, targetTicketId: C, linkType: "DUPLICATE_OF" }];
    expect(
      validateTicketLink({ sourceTicketId: A, targetTicketId: B, linkType: "DUPLICATE_OF", existingLinks: existing }).ok
    ).toBe(true);
  });
});

describe("link labels", () => {
  it("gives every type a label in both directions", () => {
    for (const type of TICKET_LINK_TYPES) {
      expect(ticketLinkLabel(type)).toBeTruthy();
      expect(inverseTicketLinkLabel(type)).toBeTruthy();
    }
  });

  it("inverts the directional types and leaves the symmetric ones alone", () => {
    expect(inverseTicketLinkLabel("BLOCKS")).toBe("Blocked by");
    expect(inverseTicketLinkLabel("CAUSED_BY")).toBe("Caused");
    expect(inverseTicketLinkLabel("DUPLICATE_OF")).toBe("Duplicated by");
    expect(inverseTicketLinkLabel("RELATED_TO")).toBe(ticketLinkLabel("RELATED_TO"));
  });
});

describe("linkedTicketIds", () => {
  it("collects partners from both directions without duplicates", () => {
    const links: ExistingLink[] = [
      { sourceTicketId: A, targetTicketId: B, linkType: "BLOCKS" },
      { sourceTicketId: C, targetTicketId: A, linkType: "RELATED_TO" },
      { sourceTicketId: A, targetTicketId: B, linkType: "RELATED_TO" }
    ];
    expect(linkedTicketIds(A, links).sort()).toEqual([B, C].sort());
  });

  it("returns nothing for an unlinked ticket", () => {
    expect(linkedTicketIds(A, [])).toEqual([]);
  });
});
