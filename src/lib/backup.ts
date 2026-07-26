import { db } from '@/db/db';
import type {
  ChatMessage,
  PlannedWorkout,
  RunRecord,
  Settings,
  Shoe,
  TrainingPlan,
} from '@/db/types';

// FR-2.3: JSON backup for manual device transfer. Versioned envelope; import
// REPLACES the entire database (documented in the Settings UI).
//
// The diagnostics log (src/lib/log.ts) is deliberately excluded (FR-8.10) —
// it is not one of the tables below and must stay that way.

export const BACKUP_APP_ID = 'fain-coach';
// v2 (Sprint 13) adds `shoes`. parseBackup still ACCEPTS v1 files — see below —
// so this bump never breaks an existing backup, only what a fresh export shapes.
export const BACKUP_SCHEMA_VERSION = 2;

export interface BackupEnvelope {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  tables: {
    runs: RunRecord[];
    trainingPlans: TrainingPlan[];
    plannedWorkouts: PlannedWorkout[];
    chatMessages: ChatMessage[];
    settings: Settings[];
    shoes: Shoe[];
  };
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function exportBackup(): Promise<BackupEnvelope> {
  return db.transaction(
    'r',
    [
      db.runs,
      db.trainingPlans,
      db.plannedWorkouts,
      db.chatMessages,
      db.settings,
      db.shoes,
    ],
    async () => ({
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tables: {
        runs: await db.runs.toArray(),
        trainingPlans: await db.trainingPlans.toArray(),
        plannedWorkouts: await db.plannedWorkouts.toArray(),
        chatMessages: await db.chatMessages.toArray(),
        settings: await db.settings.toArray(),
        shoes: await db.shoes.toArray(),
      },
    }),
  );
}

/**
 * Accepts v1 files (pre-Sprint-13, no `shoes` table at all) as well as the
 * current version — a v1 backup simply has no shoes to restore, which is
 * not an error. Always returns a fully v2-shaped envelope so importBackup
 * never needs its own version branching.
 */
export function parseBackup(json: string): BackupEnvelope {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('File is not valid JSON.');
  }
  const env = data as Partial<BackupEnvelope>;
  if (env?.app !== BACKUP_APP_ID) {
    throw new BackupError('Not a FAIN Coach backup file.');
  }
  if (env.schemaVersion !== 1 && env.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      `Unsupported backup version ${String(env.schemaVersion)} (expected 1 or ${BACKUP_SCHEMA_VERSION}).`,
    );
  }
  const t = env.tables;
  if (
    !t ||
    ![t.runs, t.trainingPlans, t.plannedWorkouts, t.chatMessages, t.settings].every(
      Array.isArray,
    )
  ) {
    throw new BackupError('Backup file is missing table data.');
  }
  return {
    ...env,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    tables: { ...t, shoes: Array.isArray(t.shoes) ? t.shoes : [] },
  } as BackupEnvelope;
}

/** Replaces ALL local data with the backup's contents. Ids are preserved so
 * cross-table links (plannedWorkoutId, planId, shoeId) survive the round-trip. */
export async function importBackup(envelope: BackupEnvelope): Promise<void> {
  const { tables } = envelope;
  await db.transaction(
    'rw',
    [
      db.runs,
      db.trainingPlans,
      db.plannedWorkouts,
      db.chatMessages,
      db.settings,
      db.shoes,
    ],
    async () => {
      await Promise.all([
        db.runs.clear(),
        db.trainingPlans.clear(),
        db.plannedWorkouts.clear(),
        db.chatMessages.clear(),
        db.settings.clear(),
        db.shoes.clear(),
      ]);
      await Promise.all([
        db.runs.bulkPut(tables.runs),
        db.trainingPlans.bulkPut(tables.trainingPlans),
        db.plannedWorkouts.bulkPut(tables.plannedWorkouts),
        db.chatMessages.bulkPut(tables.chatMessages),
        db.settings.bulkPut(tables.settings),
        db.shoes.bulkPut(tables.shoes),
      ]);
    },
  );
}

export async function wipeAllData(): Promise<void> {
  await importBackup({
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      runs: [],
      trainingPlans: [],
      plannedWorkouts: [],
      chatMessages: [],
      settings: [],
      shoes: [],
    },
  });
}
