import Dexie, { type EntityTable } from 'dexie';
import { getActiveProfile, LEGACY_DB_NAME } from '@/lib/profiles';
import type {
  ChatMessage,
  LogEntry,
  PlannedWorkout,
  RunRecord,
  Settings,
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
