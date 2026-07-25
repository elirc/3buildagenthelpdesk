import { z } from "zod";
import { TICKET_CATEGORIES } from "@agentdesk/shared";

/**
 * The complete set of placeholders a template may use.
 *
 * This list is the security boundary. Substitution walks *these* names and
 * looks each one up in the supplied values; it never scans the body for
 * "whatever looks like a placeholder" and never evaluates anything. A
 * template is data, not code, and the only way to keep that true is to
 * decide up front what a template is allowed to ask for.
 */
export const CANNED_REPLY_VARIABLES = [
  "customerName",
  "ticketTitle",
  "ticketId",
  "agentName",
  "slaDueAt"
] as const;

export type CannedReplyVariable = (typeof CANNED_REPLY_VARIABLES)[number];

export const cannedReplySchema = z.object({
  title: z.string().min(3).max(80),
  body: z.string().min(10).max(4000),
  category: z.enum(TICKET_CATEGORIES).nullable().optional(),
  isActive: z.boolean().default(true)
});

export type CannedReplyInput = z.infer<typeof cannedReplySchema>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Replace {{placeholder}} with the supplied value.
 *
 * Unknown names are left exactly as written rather than blanked. If someone
 * typos {{customerNmae}}, the agent sees the typo sitting in the reply box
 * and fixes the template. Silently emitting an empty string would send the
 * customer a sentence with a hole in it and nobody would know why.
 *
 * A known name with no value provided is also left alone, for the same
 * reason: the caller failed to supply it, and that is worth seeing.
 */
export function renderCannedReply(body: string, values: Partial<Record<CannedReplyVariable, string>>): string {
  return body.replace(PLACEHOLDER_PATTERN, (original, rawName: string) => {
    const name = rawName as CannedReplyVariable;
    if (!CANNED_REPLY_VARIABLES.includes(name)) {
      return original;
    }
    const value = values[name];
    return value === undefined || value === null ? original : value;
  });
}

/** The known placeholders a body actually uses, de-duplicated, in order. */
export function extractVariables(body: string): CannedReplyVariable[] {
  const found: CannedReplyVariable[] = [];
  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1] as CannedReplyVariable;
    if (CANNED_REPLY_VARIABLES.includes(name) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Which templates to offer on a ticket: the ones scoped to its category,
 * plus the uncategorised ones that apply everywhere. Inactive templates are
 * never offered, but are deliberately not removed from history.
 */
export function selectRepliesForTicket<T extends { category: string | null; isActive: boolean }>(
  replies: T[],
  ticketCategory: string
): T[] {
  return replies.filter((reply) => reply.isActive && (reply.category === null || reply.category === ticketCategory));
}
