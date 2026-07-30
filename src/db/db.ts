import Dexie, { type EntityTable } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import { getActiveProfile, LEGACY_DB_NAME } from '@/lib/profiles';
import { CLOUD_DATABASE_URL, isCloudBuild, UNSYNCED_TABLES } from './cloudConfig';
import type {
  ChatMessage,
  EntityId,
  LogEntry,
  PlannedWorkout,
  RunRecord,
  Settings,
  Shoe,
  TrainingPlan,
} from './types';

// LapSplit is embedded in RunRecord.laps — not its own table.
export class FainCoachDB extends Dexie {
  runs!: EntityTable<RunRecord, 'id'>;
  trainingPlans!: EntityTable<TrainingPlan, 'id'>;
  plannedWorkouts!: EntityTable<PlannedWorkout, 'id'>;
  chatMessages!: EntityTable<ChatMessage, 'id'>;
  settings!: EntityTable<Settings, 'key'>;
  logs!: EntityTable<LogEntry, 'id'>;
  shoes!: EntityTable<Shoe, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      runs: '++id, date, matchStatus, plannedWorkoutId',
      trainingPlans: '++id, status, createdAt',
      plannedWorkouts: '++id, planId, date, status',
      chatMessages: '++id, timestamp, planId',
      settings: 'key',
    });
    // Sprint 14: diagnostics log. Only the new table needs stating — Dexie
    // carries unchanged stores forward from v1 automatically.
    this.version(2).stores({
      logs: '++id, at',
    });
    // Sprint 13: shoe tracking. `runs` gains a shoeId index, which means
    // restating its full index list (Dexie requires that when a table's own
    // indexes change, unlike adding a wholly new table). `shoes` has no
    // secondary index — `retired` is a boolean, and booleans are not a valid
    // IndexedDB key type, so filtering it happens client-side instead.
    this.version(3).stores({
      runs: '++id, date, matchStatus, plannedWorkoutId, shoeId',
      shoes: '++id',
    });
    // Sprint 15: provider import. `[source+externalId]` makes "have I already
    // imported this activity?" a single indexed lookup (FR-9.3).
    //
    // Deliberately NOT unique (`&`). Uniqueness is enforced in application code
    // instead, for two reasons: a re-import should report "already imported"
    // rather than throw mid-batch, and a unique constraint would surface as a
    // sync-time ConstraintError if two devices imported the same activity
    // while offline — the same class of failure that broke cloud import in
    // v1.8.0. Rows without `externalId` (every TCX/manual run) are absent from
    // a compound index entirely, so existing data needs no migration.
    this.version(4).stores({
      runs: '++id, date, matchStatus, plannedWorkoutId, shoeId, [source+externalId]',
    });
  }
}

/**
 * Cloud-backed database (Sprint 11). A SEPARATE database from the local one,
 * never an upgrade of it — which is the whole point:
 *
 * - Primary keys are `@id` (globally unique strings the addon mints), because
 *   per-device auto-increment cannot survive two devices syncing.
 * - Because the key type differs, this cannot be a Dexie version bump on the
 *   local schema; IndexedDB will not change a store's key path in place. Data
 *   moves across by export → `remapBackupForCloud()` → import instead
 *   (src/lib/cloudMigration.ts), which is also what rewrites the foreign keys.
 * - Starting at version 1 means a signed-in account never runs the local
 *   database's v1→v3 upgrade chain, so there is no migration to get wrong.
 *
 * `settings` and `logs` keep auto-increment/`key` primary keys and are listed
 * in `unsyncedTables` — they must stay device-local (see cloudConfig.ts).
 */
export class FainCoachCloudDB extends Dexie {
  runs!: EntityTable<RunRecord, 'id'>;
  trainingPlans!: EntityTable<TrainingPlan, 'id'>;
  plannedWorkouts!: EntityTable<PlannedWorkout, 'id'>;
  chatMessages!: EntityTable<ChatMessage, 'id'>;
  settings!: EntityTable<Settings, 'key'>;
  logs!: EntityTable<LogEntry, 'id'>;
  shoes!: EntityTable<Shoe, 'id'>;

  constructor(name: string, databaseUrl: string) {
    super(name, { addons: [dexieCloud] });
    this.version(1).stores({
      runs: '@id, date, matchStatus, plannedWorkoutId, shoeId',
      trainingPlans: '@id, status, createdAt',
      plannedWorkouts: '@id, planId, date, status',
      chatMessages: '@id, timestamp, planId',
      shoes: '@id',
      // Device-local, never synced — same schema as the local database.
      settings: 'key',
      logs: '++id, at',
    });
    // Sprint 15: same provider-import index as the local schema above (and the
    // same reasoning for leaving it non-unique). A real bump rather than an
    // edit of v1 — this database already holds live account data.
    this.version(2).stores({
      runs: '@id, date, matchStatus, plannedWorkoutId, shoeId, [source+externalId]',
    });
    this.cloud.configure({
      databaseUrl,
      // The app renders its own account UI rather than the addon's default
      // dialog, so it matches the rest of the interface and is localized
      // through the existing i18n catalogs.
      customLoginGui: true,
      // A cloud build IS the account tier — the deployment is the opt-in, so
      // there is no useful unauthenticated state here. Local profiles don't
      // apply either: the account is the identity. The free/local tier is a
      // separate deployment that never sets a cloud URL at all.
      requireAuth: true,
      unsyncedTables: [...UNSYNCED_TABLES],
    });
  }
}

/** Either backend, narrowed to the surface the app actually uses. */
export type AppDB = FainCoachDB | FainCoachCloudDB;

/**
 * One database per profile; the module binds to the active profile at load
 * time, and switching profiles reloads the app (see ProfileGate). Falls back
 * to the legacy name so tests and the pre-profile boot path keep working.
 *
 * A build with no `VITE_DEXIE_CLOUD_URL` gets the local class and never
 * touches the cloud addon at all — the free tier is unchanged by Sprint 11.
 */
function openDatabase(): AppDB {
  const name = getActiveProfile()?.dbName ?? LEGACY_DB_NAME;
  if (CLOUD_DATABASE_URL) {
    // Distinct name so a cloud account and a local profile can coexist on one
    // device without fighting over the same IndexedDB database.
    return new FainCoachCloudDB(`${name}-cloud`, CLOUD_DATABASE_URL);
  }
  return new FainCoachDB(name);
}

export const db: AppDB = openDatabase();

/**
 * Whether the active database mints STRING ids (Dexie Cloud `@id`) rather than
 * Dexie auto-increment numbers. See `EntityId` in ./types.
 *
 * Reads the build-time cloud config, so in a non-cloud build this is a
 * constant `false` and `parseEntityId` folds to `Number()` exactly as before
 * Sprint 11.
 */
export const USES_STRING_IDS = isCloudBuild();

/**
 * Turns a `<select>`/route-param string back into an id of the right type.
 *
 * This is the ONLY place the numeric/string distinction should appear in
 * application code. A bare `Number(value)` on a cloud id yields `NaN`, and
 * `db.table.get(NaN)` quietly returns undefined — a lookup that fails with no
 * error, which is the worst possible failure shape. Route everything through
 * here instead.
 */
export function parseEntityId(raw: string): EntityId {
  return USES_STRING_IDS ? raw : Number(raw);
}

/**
 * FR-2.2: request persistent storage so the browser doesn't evict IndexedDB.
 * Call once on app start; returns whether persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
