import { z } from "zod";
import type { UserRole } from "@agentdesk/shared";

export const SAVED_VIEW_RESOURCES = ["tickets", "incidents", "logs", "jobs"] as const;
export type SavedViewResource = (typeof SAVED_VIEW_RESOURCES)[number];

/**
 * Filter keys each resource is allowed to persist.
 *
 * This is an allowlist, not a blocklist, and that direction matters. A
 * saved view is a stored string that later becomes a URL the app navigates
 * to; storing whatever the user happened to have in their query string
 * turns the feature into a way to persist arbitrary parameters and hand
 * them to a future page that may treat them very differently.
 *
 * `page` and `pageSize` are deliberately absent everywhere. "My critical
 * tickets, page 4" is not a view anyone means to save.
 */
const FILTER_KEYS: Record<SavedViewResource, readonly string[]> = {
  tickets: ["q", "status", "priority", "sort", "direction"],
  incidents: ["status", "severity", "sort", "direction"],
  logs: ["level", "service", "environment", "fingerprint", "ticketId", "incidentId", "from", "to"],
  jobs: ["status", "type"]
};

export const savedViewSchema = z.object({
  name: z.string().min(2).max(60),
  resource: z.enum(SAVED_VIEW_RESOURCES),
  queryString: z.string().max(500),
  isShared: z.boolean().default(false)
});

export type SavedViewInput = z.infer<typeof savedViewSchema>;

/**
 * Reduce a raw query string to the keys this resource is allowed to save.
 *
 * Parse, filter, re-serialise — never store and replay the original text.
 * Keys are emitted in the allowlist's order rather than the user's, so the
 * same filters always produce the same string and the unique constraint on
 * (owner, resource, name) compares like with like.
 */
export function sanitizeViewQuery(resource: SavedViewResource, raw: string): string {
  const allowed = FILTER_KEYS[resource];
  const incoming = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const cleaned = new URLSearchParams();

  for (const key of allowed) {
    const value = incoming.get(key);
    if (value !== null && value.trim() !== "") {
      cleaned.set(key, value.trim());
    }
  }

  return cleaned.toString();
}

/** Human summary of what a view filters on, for the list. */
export function describeViewQuery(queryString: string): string {
  const params = new URLSearchParams(queryString);
  const parts: string[] = [];
  for (const [key, value] of params) {
    if (key === "sort" || key === "direction") continue;
    parts.push(`${key}: ${value}`);
  }
  return parts.length > 0 ? parts.join(", ") : "No filters";
}

/**
 * Owners manage their own views; admins manage anyone's.
 *
 * Sharing a view does not surrender it — a shared view stays the owner's,
 * so a colleague cannot rename or delete something other people rely on.
 */
export function canEditSavedView(
  user: { id: string; role: UserRole },
  view: { ownerId: string }
): boolean {
  return view.ownerId === user.id || user.role === "ADMIN";
}
