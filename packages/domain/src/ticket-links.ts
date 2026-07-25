export const TICKET_LINK_TYPES = ["DUPLICATE_OF", "RELATED_TO", "BLOCKS", "CAUSED_BY"] as const;
export type TicketLinkType = (typeof TICKET_LINK_TYPES)[number];

/** Wording for the end of the relationship that was written. */
export const ticketLinkLabels: Record<TicketLinkType, string> = {
  DUPLICATE_OF: "Duplicate of",
  RELATED_TO: "Related to",
  BLOCKS: "Blocks",
  CAUSED_BY: "Caused by"
};

/**
 * Wording seen from the other ticket.
 *
 * A link is stored once and read from both ends, so the far end needs its
 * own phrasing. Two of these invert to themselves — "duplicate of" and
 * "related to" are symmetric — and two genuinely reverse. Getting this
 * wrong is not a crash, it is a page that quietly states the opposite of
 * what happened, which is why it is a named function with tests rather
 * than a ternary in the view.
 */
export const inverseTicketLinkLabels: Record<TicketLinkType, string> = {
  DUPLICATE_OF: "Duplicated by",
  RELATED_TO: "Related to",
  BLOCKS: "Blocked by",
  CAUSED_BY: "Caused"
};

export function ticketLinkLabel(type: TicketLinkType): string {
  return ticketLinkLabels[type];
}

export function inverseTicketLinkLabel(type: TicketLinkType): string {
  return inverseTicketLinkLabels[type];
}

export type ExistingLink = {
  sourceTicketId: string;
  targetTicketId: string;
  linkType: TicketLinkType;
};

export type LinkValidation = { ok: true } | { ok: false; reason: string };

/**
 * Whether a proposed link may be created.
 *
 * Three rules, only one of which the database can enforce:
 *
 * 1. No self-links. A ticket duplicating itself is meaningless.
 * 2. No exact duplicate — same pair, same type. The unique constraint
 *    catches this too, but catching it here produces a sentence a person
 *    can read instead of a Prisma constraint-violation stack trace.
 * 3. No reverse DUPLICATE_OF. If A is already a duplicate of B, then B
 *    being a duplicate of A is a contradiction: it says each is the
 *    canonical copy of the other, and nothing downstream can pick a
 *    winner. Symmetric-but-directional types need this guard; RELATED_TO
 *    does not, because both directions mean the same thing.
 */
export function validateTicketLink(params: {
  sourceTicketId: string;
  targetTicketId: string;
  linkType: TicketLinkType;
  existingLinks: ExistingLink[];
}): LinkValidation {
  if (params.sourceTicketId === params.targetTicketId) {
    return { ok: false, reason: "A ticket cannot be linked to itself." };
  }

  const duplicate = params.existingLinks.some(
    (link) =>
      link.sourceTicketId === params.sourceTicketId &&
      link.targetTicketId === params.targetTicketId &&
      link.linkType === params.linkType
  );
  if (duplicate) {
    return { ok: false, reason: "These tickets are already linked that way." };
  }

  if (params.linkType === "DUPLICATE_OF") {
    const reversed = params.existingLinks.some(
      (link) =>
        link.sourceTicketId === params.targetTicketId &&
        link.targetTicketId === params.sourceTicketId &&
        link.linkType === "DUPLICATE_OF"
    );
    if (reversed) {
      return { ok: false, reason: "The other ticket is already marked as a duplicate of this one." };
    }
  }

  return { ok: true };
}

/** Ticket ids already linked to this one, in either direction. Used to keep
 *  them out of the picker so the only offered choices are legal ones. */
export function linkedTicketIds(ticketId: string, links: ExistingLink[]): string[] {
  const ids = new Set<string>();
  for (const link of links) {
    if (link.sourceTicketId === ticketId) ids.add(link.targetTicketId);
    if (link.targetTicketId === ticketId) ids.add(link.sourceTicketId);
  }
  return Array.from(ids);
}
