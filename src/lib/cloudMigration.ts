import type { BackupEnvelope } from './backup';
import type { EntityId } from '@/db/types';

// Sprint 11 — the id remap (dev plan §7 step 2, §12.2).
//
// The local database uses Dexie auto-increment NUMBER ids, assigned per
// device. Dexie Cloud requires globally unique STRING ids (`@id` schema
// syntax), because two devices cannot both hand out "id 5" and have them mean
// the same row once synced.
//
// So moving a local profile into a cloud account is not a copy — every primary
// key changes, and every foreign key referencing one has to change with it, in
// the same pass. That is what this module does, as a pure function over a
// BackupEnvelope so it is testable without a database or a network.
//
// Foreign keys that must be rewritten (miss one and the link silently dies):
//   run.plannedWorkoutId  -> plannedWorkout.id
//   run.shoeId            -> shoe.id
//   plannedWorkout.planId -> trainingPlan.id
//   chatMessage.planId    -> trainingPlan.id

/** Maps one table's old ids to freshly minted cloud ids. */
type IdMap = Map<string, string>;

/** Key an id by its string form — a Map keyed on `1` and `'1'` would otherwise
 * treat them as different entries, and ids arrive from JSON in both shapes. */
function key(id: EntityId): string {
  return String(id);
}

/** The synced tables whose primary keys have to be re-minted. */
export type CloudTable =
  | 'runs'
  | 'trainingPlans'
  | 'plannedWorkouts'
  | 'chatMessages'
  | 'shoes';

/**
 * Mints a primary key that Dexie Cloud will accept for a given table.
 *
 * This CANNOT be a locally-invented string. Dexie Cloud derives a short
 * per-table prefix (`runs` → `rns`) and validates every `@id` against it:
 *
 *     ConstraintError: The ID "3" is not valid for table "runs".
 *     Primary '@' keys requires the key to be prefixed with "rns"
 *
 * An earlier version of this module minted `run_<uuid>` and would have failed
 * the same validation — a bare UUID or any hand-rolled prefix is rejected too.
 * So the id must come from Dexie's own `table.newId()`, which is injected here
 * rather than imported: keeping it a parameter is what lets the remap stay a
 * pure function with no database dependency, and lets tests supply a
 * deterministic stand-in.
 */
export type NewIdFactory = (table: CloudTable) => string;

/**
 * Builds old-id -> new-id for one table, skipping rows that have no id at all
 * (possible in a hand-edited backup; they simply get a fresh id and cannot be
 * referenced by anything, which is correct).
 */
function buildIdMap(
  rows: { id?: EntityId }[],
  table: CloudTable,
  newId: NewIdFactory,
): IdMap {
  const map: IdMap = new Map();
  for (const row of rows) {
    if (row.id === undefined) continue;
    map.set(key(row.id), newId(table));
  }
  return map;
}

/**
 * Resolves a foreign key through its map.
 *
 * A reference that resolves to nothing is DROPPED rather than carried over as
 * a dangling numeric id. That situation is real — a backup edited by hand, or
 * a run whose planned workout was deleted before export — and keeping the old
 * number would leave a link pointing at a row that will never exist in the
 * cloud database. An absent link is always valid in this schema (an unplanned
 * run, a run with no shoe recorded); a broken one is not.
 */
function remapRef(
  ref: EntityId | undefined,
  map: IdMap,
): string | undefined {
  if (ref === undefined) return undefined;
  return map.get(key(ref));
}

export interface CloudMigrationStats {
  runs: number;
  trainingPlans: number;
  plannedWorkouts: number;
  chatMessages: number;
  shoes: number;
  /** References that pointed at a row not present in the backup and were
   * dropped. Non-zero is not necessarily a bug — see remapRef — but it is
   * worth surfacing rather than silently discarding. */
  droppedReferences: number;
}

export interface CloudMigrationResult {
  envelope: BackupEnvelope;
  stats: CloudMigrationStats;
}

/**
 * Rewrites a local backup into cloud-ready shape: every primary key becomes a
 * unique string, and every foreign key is repointed at its row's new id.
 *
 * Pure — no database access, no mutation of the input envelope. `settings` is
 * passed through untouched: it is an unsynced, device-local table (the
 * OpenRouter API key must never leave the device — dev plan §12.2), and its
 * primary key is `key`, not an auto-increment id, so there is nothing to remap.
 */
export function remapBackupForCloud(
  envelope: BackupEnvelope,
  newId: NewIdFactory,
): CloudMigrationResult {
  const { tables } = envelope;

  const planIds = buildIdMap(tables.trainingPlans, 'trainingPlans', newId);
  const workoutIds = buildIdMap(
    tables.plannedWorkouts,
    'plannedWorkouts',
    newId,
  );
  const shoeIds = buildIdMap(tables.shoes, 'shoes', newId);
  const runIds = buildIdMap(tables.runs, 'runs', newId);
  const messageIds = buildIdMap(tables.chatMessages, 'chatMessages', newId);

  let droppedReferences = 0;
  /** Counts a reference that was present but unresolvable. */
  function resolve(
    ref: EntityId | undefined,
    map: IdMap,
  ): string | undefined {
    const next = remapRef(ref, map);
    if (ref !== undefined && next === undefined) droppedReferences++;
    return next;
  }

  const runs = tables.runs.map((run) => ({
    ...run,
    id: runIds.get(key(run.id ?? '')) ?? newId('runs'),
    plannedWorkoutId: resolve(run.plannedWorkoutId, workoutIds),
    shoeId: resolve(run.shoeId, shoeIds),
  }));

  const trainingPlans = tables.trainingPlans.map((plan) => ({
    ...plan,
    id: planIds.get(key(plan.id ?? '')) ?? newId('trainingPlans'),
  }));

  const plannedWorkouts = tables.plannedWorkouts.map((workout) => ({
    ...workout,
    id: workoutIds.get(key(workout.id ?? '')) ?? newId('plannedWorkouts'),
    // planId is required on PlannedWorkout, so a dropped reference would make
    // the row invalid. Keep the row but let the caller see it in the stats —
    // an orphaned workout is recoverable; a crashed migration is not.
    planId: resolve(workout.planId, planIds) as string,
  }));

  const chatMessages = tables.chatMessages.map((message) => ({
    ...message,
    id: messageIds.get(key(message.id ?? '')) ?? newId('chatMessages'),
    planId: resolve(message.planId, planIds),
  }));

  const shoes = tables.shoes.map((shoe) => ({
    ...shoe,
    id: shoeIds.get(key(shoe.id ?? '')) ?? newId('shoes'),
  }));

  return {
    envelope: {
      ...envelope,
      tables: {
        runs,
        trainingPlans,
        plannedWorkouts,
        chatMessages,
        shoes,
        settings: tables.settings,
      },
    },
    stats: {
      runs: runs.length,
      trainingPlans: trainingPlans.length,
      plannedWorkouts: plannedWorkouts.length,
      chatMessages: chatMessages.length,
      shoes: shoes.length,
      droppedReferences,
    },
  };
}

/**
 * True when every id in the envelope is already a string — i.e. it came from a
 * cloud account rather than a local profile. Importing such a backup needs no
 * remap, and re-minting ids would pointlessly break links to anything already
 * synced under those ids.
 */
export function isAlreadyCloudShaped(envelope: BackupEnvelope): boolean {
  const { tables } = envelope;
  const allIds = [
    ...tables.runs,
    ...tables.trainingPlans,
    ...tables.plannedWorkouts,
    ...tables.chatMessages,
    ...tables.shoes,
  ].map((row) => row.id);
  // An empty backup is vacuously "already shaped" — there is nothing to remap
  // either way, so this avoids a pointless pass over nothing.
  return allIds.every((id) => id === undefined || typeof id === 'string');
}
