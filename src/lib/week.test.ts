import { describe, expect, it } from 'vitest';
import { groupByWeek, startOfWeek } from './week';

// 2026-07-22 is a Wednesday.
describe('startOfWeek', () => {
  it('defaults to Sunday semantics', () => {
    expect(startOfWeek('2026-07-22', 'sunday')).toBe('2026-07-19');
  });

  it('supports Monday semantics', () => {
    expect(startOfWeek('2026-07-22', 'monday')).toBe('2026-07-20');
  });

  it('treats Sunday itself as the start under Sunday weeks', () => {
    expect(startOfWeek('2026-07-19', 'sunday')).toBe('2026-07-19');
  });

  it('puts Sunday at the END of the week under Monday weeks', () => {
    expect(startOfWeek('2026-07-19', 'monday')).toBe('2026-07-13');
  });

  it('accepts a full ISO timestamp, not just a date', () => {
    expect(startOfWeek('2026-07-22T23:45:00.000Z', 'sunday')).toBe('2026-07-19');
  });

  it('crosses month and year boundaries', () => {
    expect(startOfWeek('2026-01-01', 'sunday')).toBe('2025-12-28');
  });
});

describe('groupByWeek', () => {
  const items = [
    { date: '2026-07-18' }, // Sat
    { date: '2026-07-19' }, // Sun
    { date: '2026-07-22' }, // Wed
  ];

  it('splits Saturday from Sunday under Sunday weeks', () => {
    const weeks = groupByWeek(items, (i) => i.date, 'sunday');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-07-12', '2026-07-19']);
    expect(weeks[1].items).toHaveLength(2);
  });

  it('keeps Saturday and Sunday together under Monday weeks', () => {
    const weeks = groupByWeek(items, (i) => i.date, 'monday');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-07-13', '2026-07-20']);
    expect(weeks[0].items).toHaveLength(2);
  });

  it('returns weeks in chronological order', () => {
    const weeks = groupByWeek(
      [{ date: '2026-08-05' }, { date: '2026-07-01' }],
      (i) => i.date,
      'sunday',
    );
    expect(weeks[0].weekStart < weeks[1].weekStart).toBe(true);
  });
});
