import { db } from '@/db/db';
import type {
  ChatMessage,
  PlannedWorkout,
  RunRecord,
  Settings,
  TrainingPlan,
} from '@/db/types';

// FR-2.3: JSON backup for manual device transfer. Versioned envelope; import
// REPLACES the entire database (documented in the Settings UI).

export const BACKUP_APP_ID = 'fain-coach';
export const BACKUP_SCHEMA_VERSION = 1;

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
    [db.runs, db.trainingPlans, db.plannedWorkouts, db.chatMessages, db.settings],
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
      },
    }),
  );
}

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
  if (env.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      `Unsupported backup version ${String(env.schemaVersion)} (expected ${BACKUP_SCHEMA_VERSION}).`,
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
  return env as BackupEnvelope;
}

/** Replaces ALL local data with the backup's contents. Ids are preserved so
 * cross-table links (plannedWorkoutId, planId) survive the round-trip. */
export async function importBackup(envelope: BackupEnvelope): Promise<void> {
  const { tables } = envelope;
  await db.transaction(
    'rw',
    [db.runs, db.trainingPlans, db.plannedWorkouts, db.chatMessages, db.settings],
    async () => {
      await Promise.all([
        db.runs.clear(),
        db.trainingPlans.clear(),
        db.plannedWorkouts.clear(),
        db.chatMessages.clear(),
        db.settings.clear(),
      ]);
      await Promise.all([
        db.runs.bulkPut(tables.runs),
        db.trainingPlans.bulkPut(tables.trainingPlans),
        db.plannedWorkouts.bulkPut(tables.plannedWorkouts),
        db.chatMessages.bulkPut(tables.chatMessages),
        db.settings.bulkPut(tables.settings),
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
    },
  });
}
