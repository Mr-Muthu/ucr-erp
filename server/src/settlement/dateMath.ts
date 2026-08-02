/**
 * Pure date-math helpers for settlement proration. All inputs/outputs are
 * whole calendar days — deployments and billing periods are day-granular,
 * not timestamp-granular (duties within a day are timestamp-granular, but
 * that's a different layer).
 */

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inclusive day count between two dates (endOfDay - startOfDay + 1 day). */
export function daysInclusive(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Clips [start, end] (end may be null = open-ended / ongoing) to the
 * [periodStart, periodEnd] window. Returns null if there is no overlap.
 */
export function clipToPeriod(
  start: Date,
  end: Date | null,
  periodStart: Date,
  periodEnd: Date
): { start: Date; end: Date } | null {
  const clippedStart = startOfDay(start) < startOfDay(periodStart) ? startOfDay(periodStart) : startOfDay(start);
  const effectiveEnd = end ? startOfDay(end) : startOfDay(periodEnd);
  const clippedEnd = effectiveEnd > startOfDay(periodEnd) ? startOfDay(periodEnd) : effectiveEnd;

  if (clippedStart > clippedEnd) return null;
  return { start: clippedStart, end: clippedEnd };
}
