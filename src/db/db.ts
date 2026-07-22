import Dexie, { type EntityTable } from 'dexie';
import { getActiveProfile, LEGACY_DB_NAME } from '@/lib/profiles';
import type {
  ChatMessage,
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

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      runs: '++id, date, matchStatus, plannedWorkoutId',
      trainingPlans: '++id, status, createdAt',
      plannedWorkouts: '++id, planId, date, status',
      chatMessages: '++id, timestamp, planId',
      settings: 'key',
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
