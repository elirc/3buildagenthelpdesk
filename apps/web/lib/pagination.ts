export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type Pagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function parsePagination(searchParams: { page?: string; pageSize?: string }): Pagination {
  const page = clampInt(searchParams.page, 1, 1, 10000);
  const pageSize = clampInt(searchParams.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function pageHref(pathname: string, searchParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") {
      params.set(key, value);
    }
  }
  params.set("page", String(Math.max(1, page)));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

/* -------------------------------------------------------------------------
 * Sorting
 *
 * A sort key arrives from the query string, which means it arrives from the
 * user, which means it cannot be handed to Prisma as-is. `orderBy` takes a
 * field name; letting an arbitrary string reach it means the URL decides
 * which column we sort by, and an unknown column throws at query time.
 *
 * So every sortable surface declares an allowlist, and anything not on that
 * list falls back to the default. The allowlist is also the single place to
 * look when you want to know what a page can sort by.
 * ---------------------------------------------------------------------- */

export type SortDirection = "asc" | "desc";

export type Sort<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};

export const TICKET_SORT_KEYS = ["updatedAt", "createdAt", "priority", "slaDueAt", "status"] as const;
export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number];
export const DEFAULT_TICKET_SORT: Sort<TicketSortKey> = { key: "updatedAt", direction: "desc" };

export const INCIDENT_SORT_KEYS = ["startedAt", "severity", "status", "affectedService"] as const;
export type IncidentSortKey = (typeof INCIDENT_SORT_KEYS)[number];
export const DEFAULT_INCIDENT_SORT: Sort<IncidentSortKey> = { key: "startedAt", direction: "desc" };

export function parseSort<TKey extends string>(
  rawKey: string | undefined,
  rawDirection: string | undefined,
  allowed: readonly TKey[],
  fallback: Sort<TKey>
): Sort<TKey> {
  const key = allowed.includes(rawKey as TKey) ? (rawKey as TKey) : fallback.key;
  const direction: SortDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : fallback.direction;
  return { key, direction };
}

/**
 * Href for a sortable column header.
 *
 * Clicking the column you are already sorted by flips the direction;
 * clicking any other column sorts by it descending, which is the more
 * useful default for the timestamps and severities in this app.
 *
 * Sorting always returns to page 1. Staying on page 7 of a freshly
 * reordered list shows you rows you have no reason to expect.
 */
export function sortHref<TKey extends string>(
  pathname: string,
  searchParams: Record<string, string | undefined>,
  current: Sort<TKey>,
  key: TKey
): string {
  const params = new URLSearchParams();
  for (const [param, value] of Object.entries(searchParams)) {
    if (value && param !== "page" && param !== "sort" && param !== "direction") {
      params.set(param, value);
    }
  }
  params.set("sort", key);
  params.set("direction", current.key === key && current.direction === "desc" ? "asc" : "desc");
  return `${pathname}?${params.toString()}`;
}

/** Arrow suffix for a column header, so the active sort is visible at a glance. */
export function sortIndicator<TKey extends string>(current: Sort<TKey>, key: TKey): string {
  if (current.key !== key) return "";
  return current.direction === "asc" ? " ↑" : " ↓";
}

/** Total pages for a result set, floored at 1 so an empty list reads "Page 1 of 1". */
export function totalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}
