import type { PlannedWorkout, RunRecord } from '@/db/types';
import type { AdherenceStats } from '@/prompts/prompts';

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000,
  );
}

/**
 * Auto-match (dev plan §4): nearest pending PlannedWorkout within ±1 day of
 * the run date; ties broken by target-distance proximity. Rest days never
 * match. The user always confirms before linking.
 */
export function findMatchCandidate(
  run: Pick<RunRecord, 'date' | 'totalDistanceMeters'>,
  workouts: PlannedWorkout[],
): PlannedWorkout | undefined {
  const candidates = workouts
    .filter(
      (w) =>
        w.status === 'pending' &&
        w.type !== 'rest' &&
        Math.abs(dayDiff(w.date, run.date)) <= 1,
    )
    .map((w) => ({
      workout: w,
      dateGap: Math.abs(dayDiff(w.date, run.date)),
      distanceGap:
        w.targetDistanceMeters !== undefined && w.targetDistanceMeters > 0
          ? Math.abs(w.targetDistanceMeters - run.totalDistanceMeters) /
            w.targetDistanceMeters
          : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.dateGap - b.dateGap || a.distanceGap - b.distanceGap);
  return candidates[0]?.workout;
}

/**
 * Adherence for the coach context. Past-due workouts still pending count as
 * missed (without mutating them); pending counts only future workouts.
 */
export function computeAdherence(
  workouts: PlannedWorkout[],
  today: Date = new Date(),
): AdherenceStats {
  const todayIso = today.toISOString().slice(0, 10);
  const stats: AdherenceStats = {
    completed: 0,
    missed: 0,
    skipped: 0,
    pending: 0,
  };
  for (const w of workouts) {
    if (w.type === 'rest') continue;
    if (w.status === 'completed') stats.completed++;
    else if (w.status === 'skipped') stats.skipped++;
    else if (w.status === 'missed') stats.missed++;
    else if (w.date < todayIso) stats.missed++;
    else stats.pending++;
  }
  return stats;
}
