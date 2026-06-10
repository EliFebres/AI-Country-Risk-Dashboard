// app/lib/format.ts
//
// Small, dependency-free formatting and math helpers shared across components.

/**
 * Clamp a number to the inclusive `[0, 1]` range.
 *
 * @param x - The value to clamp.
 * @returns `x` constrained to `0..1`.
 */
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight (ms since epoch) for the calendar day containing `d`. */
const startOfDayMs = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Whole calendar days between `date` and today, in local time, clamped to `>= 0`.
 *
 * Counts calendar-day boundaries rather than elapsed milliseconds and rounds, so
 * 23h/25h DST transitions don't shift the count; future dates clamp to `0`.
 *
 * @param date - The past date to measure from.
 * @returns Non-negative whole number of days ago.
 */
export function calendarDaysAgo(date: Date): number {
  return Math.max(0, Math.round((startOfDayMs(new Date()) - startOfDayMs(date)) / DAY_MS));
}

/**
 * Human-readable "x days ago" label for an ISO date string.
 *
 * @param iso - ISO date string, or null/undefined.
 * @returns `'today'`, `'1 day ago'`, `'N days ago'`, or `''` when input is
 *          missing or unparseable.
 */
export function daysAgoLabel(iso?: string | null): string {
  if (!iso) return '';
  const pub = new Date(iso);
  if (isNaN(pub.getTime())) return '';
  const days = calendarDaysAgo(pub);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/**
 * Compact calendar-date label (e.g. `'Jun 1, 2024'`) for an ISO date string.
 *
 * A bare `'YYYY-MM-DD'` is read as a *local* calendar date (not UTC midnight) so
 * the day never shifts backward in negative-offset timezones; richer ISO strings
 * with a time component fall back to the native `Date` parser.
 *
 * @param iso - ISO date string, or null/undefined.
 * @returns The formatted date, or `''` when input is missing or unparseable.
 */
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
