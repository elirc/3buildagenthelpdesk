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

