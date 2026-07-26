import { describe, expect, it } from 'vitest';
import type { RunRecord, Shoe } from '@/db/types';
import { mostRecentShoeId, shoeMileage, shoeStatus } from './shoes';

function shoe(overrides: Partial<Shoe> = {}): Shoe {
  return {
    id: 1,
    name: 'Pegasus 40',
    initialDistanceMeters: 0,
    retirementDistanceMeters: 800_000,
    retired: false,
    ...overrides,
  };
}

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    date: '2026-07-01T12:00:00.000Z',
    totalDistanceMeters: 10_000,
    totalDurationSeconds: 3000,
    laps: [],
    matchStatus: 'unmatched',
    ...overrides,
  };
}

describe('shoeStatus / shoeMileage — derived, never stored (FR-7.4)', () => {
  it('sums initial mileage plus assigned runs only', () => {
    const s = shoe({ id: 1, initialDistanceMeters: 50_000 });
    const runs = [
      run({ shoeId: 1, totalDistanceMeters: 10_000 }),
      run({ shoeId: 1, totalDistanceMeters: 5_000 }),
      run({ shoeId: 2, totalDistanceMeters: 100_000 }), // different pair
      run({ shoeId: undefined, totalDistanceMeters: 100_000 }), // unassigned
    ];
    expect(shoeMileage(s, runs)).toBe(65_000);
  });

  it('re-assigning a run moves mileage between two pairs with no stale total', () => {
    const a = shoe({ id: 1 });
    const b = shoe({ id: 2 });
    const r = run({ shoeId: 1, totalDistanceMeters: 8_000 });
    expect(shoeMileage(a, [r])).toBe(8_000);
    expect(shoeMileage(b, [r])).toBe(0);

    const reassigned = { ...r, shoeId: 2 };
    expect(shoeMileage(a, [reassigned])).toBe(0);
    expect(shoeMileage(b, [reassigned])).toBe(8_000);
  });

  it('deleting a run (removing it from the list) reduces the total', () => {
    const s = shoe({ id: 1 });
    const runs = [
      run({ shoeId: 1, totalDistanceMeters: 8_000 }),
      run({ shoeId: 1, totalDistanceMeters: 5_000 }),
    ];
    expect(shoeMileage(s, runs)).toBe(13_000);
    expect(shoeMileage(s, runs.slice(1))).toBe(5_000);
  });

  it.each([
    ['well under', 700_000, 'ok'],
    ['just under warn', 719_000, 'ok'],
    ['at the warn threshold', 720_000, 'warn'], // 90% of 800k
    ['just under retirement', 799_000, 'warn'],
    ['exactly at retirement', 800_000, 'over'],
    ['past retirement', 850_000, 'over'],
  ])('classifies %s (%dm) as %s', (_label, meters, expected) => {
    const s = shoe({ id: 1, retirementDistanceMeters: 800_000 });
    expect(shoeStatus(s, [run({ shoeId: 1, totalDistanceMeters: meters })]).state).toBe(
      expected,
    );
  });

  it('never divides by zero when retirementDistanceMeters is 0', () => {
    const s = shoe({ id: 1, retirementDistanceMeters: 0 });
    const status = shoeStatus(s, [run({ shoeId: 1, totalDistanceMeters: 100 })]);
    expect(Number.isFinite(status.percent)).toBe(true);
  });

  it('remainingMeters goes negative once a pair is over its threshold', () => {
    const s = shoe({ id: 1, retirementDistanceMeters: 800_000 });
    const status = shoeStatus(s, [run({ shoeId: 1, totalDistanceMeters: 850_000 })]);
    expect(status.remainingMeters).toBe(-50_000);
  });
});

describe('mostRecentShoeId', () => {
  it('picks the shoe from the most recent run', () => {
    const shoes = [shoe({ id: 1 }), shoe({ id: 2 })];
    const runs = [
      run({ shoeId: 1, date: '2026-07-01T12:00:00.000Z' }),
      run({ shoeId: 2, date: '2026-07-10T12:00:00.000Z' }),
    ];
    expect(mostRecentShoeId(shoes, runs)).toBe(2);
  });

  it('skips a retired pair even if it was worn most recently', () => {
    const shoes = [shoe({ id: 1 }), shoe({ id: 2, retired: true })];
    const runs = [
      run({ shoeId: 1, date: '2026-07-01T12:00:00.000Z' }),
      run({ shoeId: 2, date: '2026-07-10T12:00:00.000Z' }),
    ];
    expect(mostRecentShoeId(shoes, runs)).toBe(1);
  });

  it('returns undefined when no run has an active shoe assigned', () => {
    expect(mostRecentShoeId([shoe({ id: 1 })], [run({ shoeId: undefined })])).toBeUndefined();
    expect(mostRecentShoeId([], [])).toBeUndefined();
  });
});
