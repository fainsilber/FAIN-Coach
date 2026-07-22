import Dexie, { type EntityTable } from 'dexie';
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

  constructor() {
    super('FainCoachDB');
    this.version(1).stores({
      runs: '++id, date, matchStatus, plannedWorkoutId',
      trainingPlans: '++id, status, createdAt',
      plannedWorkouts: '++id, planId, date, status',
      chatMessages: '++id, timestamp, planId',
      settings: 'key',
    });
  }
}

export const db = new FainCoachDB();

/**
 * FR-2.2: request persistent storage so the browser doesn't evict IndexedDB.
 * Call once on app start; returns whether persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
