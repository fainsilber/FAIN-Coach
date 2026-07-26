import type { RunRecord, Shoe } from '@/db/types';

// Pure functions (PRD §4.7 / dev plan §13.2) — mileage is always DERIVED from
// assigned runs, never a stored counter, so deleting or re-assigning a run
// can never leave a stale total (FR-7.4).

export type ShoeState = 'ok' | 'warn' | 'over';

const WARN_THRESHOLD_PERCENT = 90;

export interface ShoeStatus {
  /** Distance from assigned runs only, excluding initialDistanceMeters. */
  metersRun: number;
  /** initialDistanceMeters + metersRun — the figure shown to the user. */
  totalMeters: number;
  /** Can be negative once a pair is past its threshold. */
  remainingMeters: number;
  /** Not clamped — can exceed 100. */
  percent: number;
  state: ShoeState;
}

export function shoeStatus(shoe: Shoe, runs: RunRecord[]): ShoeStatus {
  const metersRun = runs
    .filter((r) => r.shoeId === shoe.id)
    .reduce((sum, r) => sum + r.totalDistanceMeters, 0);
  const totalMeters = shoe.initialDistanceMeters + metersRun;
  const percent =
    shoe.retirementDistanceMeters > 0
      ? (totalMeters / shoe.retirementDistanceMeters) * 100
      : 0;
  const state: ShoeState =
    percent >= 100 ? 'over' : percent >= WARN_THRESHOLD_PERCENT ? 'warn' : 'ok';
  return {
    metersRun,
    totalMeters,
    remainingMeters: shoe.retirementDistanceMeters - totalMeters,
    percent,
    state,
  };
}

export function shoeMileage(shoe: Shoe, runs: RunRecord[]): number {
  return shoeStatus(shoe, runs).totalMeters;
}

/**
 * Default for the post-run shoe picker: the pair worn most recently, skipping
 * retired ones. Most runners wear the same shoes most of the time, so a
 * default that's usually right beats an empty dropdown every upload.
 */
export function mostRecentShoeId(
  shoes: Shoe[],
  runs: RunRecord[],
): number | undefined {
  const activeIds = new Set(
    shoes.filter((s) => !s.retired).map((s) => s.id),
  );
  const withShoe = runs
    .filter((r) => r.shoeId !== undefined && activeIds.has(r.shoeId))
    .sort((a, b) => b.date.localeCompare(a.date));
  return withShoe[0]?.shoeId;
}
