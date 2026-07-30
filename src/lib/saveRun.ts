import { db, requestPersistentStorage } from '@/db/db';
import type { PlannedWorkout, RunRecord } from '@/db/types';
import { logEvent } from './log';

/** A run ready to persist — everything except the id and the plan linkage,
 * which this module derives from the confirmed match. */
export type NewRun = Omit<RunRecord, 'id' | 'plannedWorkoutId' | 'matchStatus'>;

/**
 * The single write path for a completed run, shared by TCX upload and manual
 * entry (FR-6.6) so the two can't drift: persist the run, mark a confirmed
 * planned workout complete, and hand the run to the coach thread.
 *
 * Takes a ready-made `coachMessage` rather than composing it here — the
 * wording is localized, and that belongs to the UI layer.
 */
export async function saveRunAndPromptCoach({
  run,
  linkedWorkout,
  coachMessage,
}: {
  run: NewRun;
  linkedWorkout?: PlannedWorkout;
  coachMessage: string;
}): Promise<void> {
  const record: Omit<RunRecord, 'id'> = {
    ...run,
    ...(linkedWorkout
      ? { plannedWorkoutId: linkedWorkout.id, matchStatus: 'confirmed' as const }
      : { matchStatus: 'unplanned' as const }),
  };

  try {
    await db.runs.add(record);
    if (linkedWorkout?.id !== undefined) {
      await db.plannedWorkouts.update(linkedWorkout.id, { status: 'completed' });
    }
    void requestPersistentStorage(); // FR-2.2, fire-and-forget

    await db.chatMessages.add({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: coachMessage,
    });
    void logEvent('info', 'run.saved', `source=${run.source ?? 'tcx'}`);
  } catch (e) {
    void logEvent(
      'error',
      'run.save.failed',
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
}

/** One run in a batch import, with the plan link already resolved. */
export interface BatchEntry {
  run: NewRun;
  linkedWorkout?: PlannedWorkout;
}

/**
 * Batch sibling of `saveRunAndPromptCoach`, for provider/bulk import (§4.9).
 * Lives here so both write paths share one definition of "a saved run".
 *
 * Two deliberate differences from the single-run path:
 *
 * - **One coach message for the whole batch, not one per run.** Backfilling six
 *   months would otherwise flood the global thread and fire an LLM call per
 *   run. The message is composed by the caller, since it is localized.
 * - **No subjective input.** RPE/feel/notes stay absent rather than 0 — nobody
 *   recalls how a run felt months later, and FR-6.4 requires absent to mean
 *   absent.
 *
 * Atomic: a partial import is worse than none, so everything lands in one
 * transaction. Logging and the persistence request stay outside it — `logs` is
 * not in scope, and writing to it inside would abort the transaction.
 */
export async function saveRunsBatch({
  entries,
  coachMessage,
}: {
  entries: BatchEntry[];
  coachMessage: string;
}): Promise<number> {
  if (entries.length === 0) return 0;

  try {
    await db.transaction('rw', db.runs, db.plannedWorkouts, db.chatMessages, async () => {
      await db.runs.bulkAdd(
        entries.map(({ run, linkedWorkout }) => ({
          ...run,
          ...(linkedWorkout
            ? { plannedWorkoutId: linkedWorkout.id, matchStatus: 'confirmed' as const }
            : { matchStatus: 'unplanned' as const }),
        })),
      );

      for (const { linkedWorkout } of entries) {
        if (linkedWorkout?.id !== undefined) {
          await db.plannedWorkouts.update(linkedWorkout.id, { status: 'completed' });
        }
      }

      await db.chatMessages.add({
        timestamp: new Date().toISOString(),
        role: 'user',
        content: coachMessage,
      });
    });

    void requestPersistentStorage(); // FR-2.2, fire-and-forget
    void logEvent('info', 'run.batch.saved', `count=${entries.length}`);
    return entries.length;
  } catch (e) {
    void logEvent(
      'error',
      'run.batch.failed',
      `count=${entries.length} ${e instanceof Error ? e.message : String(e)}`,
    );
    throw e;
  }
}

/** Planned workouts of the active plan, for auto-matching a new run. */
export async function activePlanWorkouts(): Promise<PlannedWorkout[]> {
  const plan = await db.trainingPlans.where('status').equals('active').first();
  if (plan?.id === undefined) return [];
  return db.plannedWorkouts.where('planId').equals(plan.id).toArray();
}
