import { db, requestPersistentStorage } from '@/db/db';
import type { PlannedWorkout, RunRecord } from '@/db/types';

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
}

/** Planned workouts of the active plan, for auto-matching a new run. */
export async function activePlanWorkouts(): Promise<PlannedWorkout[]> {
  const plan = await db.trainingPlans.where('status').equals('active').first();
  if (plan?.id === undefined) return [];
  return db.plannedWorkouts.where('planId').equals(plan.id).toArray();
}
