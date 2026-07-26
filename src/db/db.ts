import Dexie, { type EntityTable } from 'dexie';
import { getActiveProfile, LEGACY_DB_NAME } from '@/lib/profiles';
import type {
  ChatMessage,
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
  }
}

// One database per profile; the module binds to the active profile at load
// time, and switching profiles reloads the app (see ProfileGate). Falls back
// to the legacy name so tests and the pre-profile boot path keep working.
export const db = new FainCoachDB(getActiveProfile()?.dbName ?? LEGACY_DB_NAME);

/**
 * FR-2.2: request persistent storage so the browser doesn't evict IndexedDB.
 * Call once on app start; returns whether persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
