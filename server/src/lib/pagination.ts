/**
 * Cursor pagination on `id` (cuid — roughly time-ordered, always unique),
 * using Prisma's native `cursor`/`skip: 1` support. Every list endpoint
 * returns the same envelope: `{ data, meta: { nextCursor, limit } }`.
 */

export interface PageQuery {
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export function parsePageParams(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100): { limit: number; page: PageQuery } {
  const rawLimit = Number(query.limit);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : defaultLimit, 1), maxLimit);
  const cursor = typeof query.cursor === 'string' && query.cursor.length > 0 ? { id: query.cursor } : undefined;

  return {
    limit,
    page: {
      take: limit + 1, // fetch one extra to detect "more pages exist"
      ...(cursor ? { cursor, skip: 1 } : {}),
    },
  };
}

export interface PageResult<T> {
  data: T[];
  meta: { nextCursor: string | null; limit: number };
}

export function buildPageResult<T extends { id: string }>(rows: T[], limit: number): PageResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    meta: { nextCursor: hasMore && last ? last.id : null, limit },
  };
}
