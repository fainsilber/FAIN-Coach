// Week math (dev plan §8.3).
//
// The first day of the week is a user preference defaulting to SUNDAY. This is
// deliberately NOT ISO 8601 (which defines Monday) — do not "correct" it.
// Anything that derives a week must use these helpers so the plan view, weekly
// totals, and coaching all agree on the same boundaries.

export type WeekStart = 'sunday' | 'monday';

export const DEFAULT_WEEK_START: WeekStart = 'sunday';

/** Days to subtract from a date to reach the start of its week. */
function offsetToWeekStart(dayOfWeek: number, weekStart: WeekStart): number {
  // Date#getUTCDay: 0 = Sunday … 6 = Saturday
  return weekStart === 'sunday' ? dayOfWeek : (dayOfWeek + 6) % 7;
}

/** ISO date (YYYY-MM-DD) of the first day of the week containing `date`. */
export function startOfWeek(date: string, weekStart: WeekStart): string {
  // Noon UTC avoids any date shifting from time zones / DST.
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offsetToWeekStart(d.getUTCDay(), weekStart));
  return d.toISOString().slice(0, 10);
}

/** Groups items into weeks, keyed by the ISO date the week starts on. */
export function groupByWeek<T>(
  items: T[],
  getDate: (item: T) => string,
  weekStart: WeekStart,
): Array<{ weekStart: string; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = startOfWeek(getDate(item), weekStart);
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStartDate, groupItems]) => ({
      weekStart: weekStartDate,
      items: groupItems,
    }));
}
