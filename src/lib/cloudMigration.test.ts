import { describe, expect, it } from 'vitest';
import type { BackupEnvelope } from './backup';
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION } from './backup';
import {
  isAlreadyCloudShaped,
  remapBackupForCloud,
  type CloudTable,
} from './cloudMigration';

// Stand-in for Dexie's table.newId(). Mirrors the real prefix scheme (runs ->
// "rns") so a regression to hand-rolled ids shows up here rather than as a
// ConstraintError against a live database.
const PREFIX: Record<CloudTable, string> = {
  runs: 'rns',
  trainingPlans: 'trn',
  plannedWorkouts: 'pln',
  chatMessages: 'cht',
  shoes: 'shs', // verified against the live DB — not 'sho'
};
function fakeNewId() {
  let n = 0;
  return (table: CloudTable) => `${PREFIX[table]}${String(++n).padStart(4, '0')}`;
}

/** A backup with every cross-table link exercised at least once. */
function localBackup(): BackupEnvelope {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-07-29T00:00:00.000Z',
    tables: {
      trainingPlans: [
        {
          id: 1,
          createdAt: '2026-07-01T00:00:00.000Z',
          status: 'active',
          goal: 'Sub-50 10k',
          weeks: 12,
          generationContext: 'ctx',
        },
      ],
      plannedWorkouts: [
        {
          id: 10,
          planId: 1,
          date: '2026-07-24',
          type: 'tempo',
          description: '8km tempo',
          status: 'pending',
        },
        {
          id: 11,
          planId: 1,
          date: '2026-07-26',
          type: 'long',
          description: 'Long 14k',
          status: 'pending',
        },
      ],
      shoes: [
        {
          id: 5,
          name: 'Pegasus 40',
          initialDistanceMeters: 0,
          retirementDistanceMeters: 800_000,
          retired: false,
        },
      ],
      runs: [
        {
          id: 100,
          date: '2026-07-24T06:00:00.000Z',
          totalDistanceMeters: 8000,
          totalDurationSeconds: 2400,
          laps: [],
          matchStatus: 'confirmed',
          plannedWorkoutId: 10,
          shoeId: 5,
        },
      ],
      chatMessages: [
        {
          id: 1000,
          timestamp: '2026-07-24T07:00:00.000Z',
          role: 'assistant',
          content: 'Nice tempo.',
          planId: 1,
        },
      ],
      settings: [{ key: 'openrouterApiKey', value: 'sk-or-secret' }],
    },
  };
}

describe('remapBackupForCloud', () => {
  it('replaces every primary key with a unique string', () => {
    const { envelope } = remapBackupForCloud(localBackup(), fakeNewId());
    const ids = [
      ...envelope.tables.runs,
      ...envelope.tables.trainingPlans,
      ...envelope.tables.plannedWorkouts,
      ...envelope.tables.chatMessages,
      ...envelope.tables.shoes,
    ].map((r) => r.id);

    for (const id of ids) expect(typeof id).toBe('string');
    expect(new Set(ids).size, 'ids must be unique').toBe(ids.length);
  });

  it('repoints every foreign key at its row new id', () => {
    const { envelope } = remapBackupForCloud(localBackup(), fakeNewId());
    const { runs, trainingPlans, plannedWorkouts, chatMessages, shoes } =
      envelope.tables;

    const tempo = plannedWorkouts.find((w) => w.type === 'tempo')!;

    // run -> plannedWorkout, run -> shoe
    expect(runs[0].plannedWorkoutId).toBe(tempo.id);
    expect(runs[0].shoeId).toBe(shoes[0].id);
    // plannedWorkout -> plan (both workouts point at the one plan)
    expect(plannedWorkouts.map((w) => w.planId)).toEqual([
      trainingPlans[0].id,
      trainingPlans[0].id,
    ]);
    // chatMessage -> plan
    expect(chatMessages[0].planId).toBe(trainingPlans[0].id);
  });

  it('never leaves an original numeric id anywhere in the output', () => {
    const { envelope } = remapBackupForCloud(localBackup(), fakeNewId());
    // The whole failure mode this guards: a link that still holds `10` after
    // the row it referenced became "workout_<uuid>".
    const json = JSON.stringify(envelope.tables);
    expect(json).not.toMatch(/"(id|planId|plannedWorkoutId|shoeId)":\s*\d/);
  });

  it('passes settings through untouched — it is device-local, never synced', () => {
    const before = localBackup();
    const { envelope } = remapBackupForCloud(before, fakeNewId());
    expect(envelope.tables.settings).toEqual(before.tables.settings);
  });

  it('does not mutate the input envelope', () => {
    const input = localBackup();
    remapBackupForCloud(input, fakeNewId());
    expect(input.tables.runs[0].id).toBe(100);
    expect(input.tables.runs[0].plannedWorkoutId).toBe(10);
    expect(input.tables.plannedWorkouts[0].planId).toBe(1);
  });

  it('preserves all non-id fields verbatim', () => {
    const { envelope } = remapBackupForCloud(localBackup(), fakeNewId());
    const run = envelope.tables.runs[0];
    expect(run.totalDistanceMeters).toBe(8000);
    expect(run.matchStatus).toBe('confirmed');
    expect(envelope.tables.shoes[0].name).toBe('Pegasus 40');
    expect(envelope.tables.trainingPlans[0].goal).toBe('Sub-50 10k');
  });

  it('reports row counts so the caller can show what moved', () => {
    const { stats } = remapBackupForCloud(localBackup(), fakeNewId());
    expect(stats).toMatchObject({
      runs: 1,
      trainingPlans: 1,
      plannedWorkouts: 2,
      chatMessages: 1,
      shoes: 1,
      droppedReferences: 0,
    });
  });
});

describe('remapBackupForCloud — dangling references', () => {
  it('drops a reference to a row that is not in the backup, and counts it', () => {
    const backup = localBackup();
    // A run pointing at a planned workout that was deleted before export.
    backup.tables.runs[0].plannedWorkoutId = 999;

    const { envelope, stats } = remapBackupForCloud(backup, fakeNewId());

    // Dropped, NOT carried over as a stale 999 that would dangle forever.
    expect(envelope.tables.runs[0].plannedWorkoutId).toBeUndefined();
    expect(stats.droppedReferences).toBe(1);
    // The run itself survives — losing the link is recoverable, losing the run is not.
    expect(envelope.tables.runs).toHaveLength(1);
    expect(envelope.tables.runs[0].totalDistanceMeters).toBe(8000);
  });

  it('drops a dangling shoe link without touching the planned-workout link', () => {
    const backup = localBackup();
    backup.tables.runs[0].shoeId = 42;

    const { envelope, stats } = remapBackupForCloud(backup, fakeNewId());

    expect(envelope.tables.runs[0].shoeId).toBeUndefined();
    expect(envelope.tables.runs[0].plannedWorkoutId).toBe(
      envelope.tables.plannedWorkouts[0].id,
    );
    expect(stats.droppedReferences).toBe(1);
  });

  it('leaves absent optional links absent without counting them as dropped', () => {
    const backup = localBackup();
    delete backup.tables.runs[0].plannedWorkoutId;
    delete backup.tables.runs[0].shoeId;
    delete backup.tables.chatMessages[0].planId;

    const { envelope, stats } = remapBackupForCloud(backup, fakeNewId());

    expect(envelope.tables.runs[0].plannedWorkoutId).toBeUndefined();
    expect(envelope.tables.runs[0].shoeId).toBeUndefined();
    expect(envelope.tables.chatMessages[0].planId).toBeUndefined();
    // Absent is valid (unplanned run, no shoe recorded) — not a dropped link.
    expect(stats.droppedReferences).toBe(0);
  });
});

describe('remapBackupForCloud — edge cases', () => {
  it('handles an empty backup', () => {
    const empty: BackupEnvelope = {
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-07-29T00:00:00.000Z',
      tables: {
        runs: [],
        trainingPlans: [],
        plannedWorkouts: [],
        chatMessages: [],
        shoes: [],
        settings: [],
      },
    };
    const { envelope, stats } = remapBackupForCloud(empty, fakeNewId());
    expect(envelope.tables.runs).toEqual([]);
    expect(stats.droppedReferences).toBe(0);
  });

  it('treats numeric and string forms of the same id as the same row', () => {
    // JSON round-trips can leave an id as "1" while its referrer holds 1.
    const backup = localBackup();
    backup.tables.trainingPlans[0].id = '1' as unknown as number;

    const { envelope, stats } = remapBackupForCloud(backup, fakeNewId());

    expect(envelope.tables.plannedWorkouts[0].planId).toBe(
      envelope.tables.trainingPlans[0].id,
    );
    expect(stats.droppedReferences).toBe(0);
  });

  it('gives a fresh id to a row that had none, without breaking others', () => {
    const backup = localBackup();
    delete backup.tables.shoes[0].id;
    // The run referenced shoe 5, which no longer has an id to match on.
    const { envelope, stats } = remapBackupForCloud(backup, fakeNewId());

    expect(typeof envelope.tables.shoes[0].id).toBe('string');
    expect(envelope.tables.runs[0].shoeId).toBeUndefined();
    expect(stats.droppedReferences).toBe(1);
  });

  it('keeps two plans distinct when their workouts interleave', () => {
    const backup = localBackup();
    backup.tables.trainingPlans.push({
      id: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      status: 'archived',
      goal: 'Half marathon',
      weeks: 16,
      generationContext: 'ctx2',
    });
    backup.tables.plannedWorkouts.push({
      id: 12,
      planId: 2,
      date: '2026-08-02',
      type: 'easy',
      description: 'Easy 5k',
      status: 'pending',
    });

    const { envelope } = remapBackupForCloud(backup, fakeNewId());
    const [plan1, plan2] = envelope.tables.trainingPlans;
    const workouts = envelope.tables.plannedWorkouts;

    expect(plan1.id).not.toBe(plan2.id);
    expect(workouts.filter((w) => w.planId === plan1.id)).toHaveLength(2);
    expect(workouts.filter((w) => w.planId === plan2.id)).toHaveLength(1);
  });
});

describe('isAlreadyCloudShaped', () => {
  it('is false for a local backup with numeric ids', () => {
    expect(isAlreadyCloudShaped(localBackup())).toBe(false);
  });

  it('is true for the output of a remap — re-running it is a no-op decision', () => {
    const { envelope } = remapBackupForCloud(localBackup(), fakeNewId());
    expect(isAlreadyCloudShaped(envelope)).toBe(true);
  });

  it('is true for an empty backup', () => {
    const { envelope } = remapBackupForCloud({
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-07-29T00:00:00.000Z',
      tables: {
        runs: [],
        trainingPlans: [],
        plannedWorkouts: [],
        chatMessages: [],
        shoes: [],
        settings: [],
      },
    }, fakeNewId());
    expect(isAlreadyCloudShaped(envelope)).toBe(true);
  });
});

describe('remapBackupForCloud — ids must come from Dexie, not invented here', () => {
  // Regression. This module used to mint `run_<uuid>` itself, and every test
  // passed — because they only checked internal consistency (uniqueness, FK
  // rewiring), never that an id is something Dexie Cloud will accept. It
  // isn't: Dexie Cloud derives a per-table prefix (runs -> "rns") and rejects
  // anything else at write time.
  //   ConstraintError: The ID "3" is not valid for table "runs".
  //   Primary '@' keys requires the key to be prefixed with "rns"
  // Ids must therefore come from Dexie's own table.newId().
  it('asks the factory for one id per row, using real Dexie table names', () => {
    const asked: CloudTable[] = [];
    remapBackupForCloud(localBackup(), (table) => {
      asked.push(table);
      return `${PREFIX[table]}x${asked.length}`;
    });
    // One request per row across the five synced tables: 1+2+1+1+1.
    expect(asked).toHaveLength(6);
    // Must be the ACTUAL Dexie table names — the caller resolves the factory as
    // `db[table].newId()`, so 'run'/'plan'/'msg' would not resolve to a table.
    expect(new Set(asked)).toEqual(
      new Set([
        'runs',
        'trainingPlans',
        'plannedWorkouts',
        'chatMessages',
        'shoes',
      ]),
    );
  });

  it('fabricates no id of its own — every output id came from the factory', () => {
    const issued = new Set<string>();
    const { envelope } = remapBackupForCloud(localBackup(), (table) => {
      const id = `${PREFIX[table]}${issued.size}`;
      issued.add(id);
      return id;
    });
    const outputIds = [
      ...envelope.tables.runs,
      ...envelope.tables.trainingPlans,
      ...envelope.tables.plannedWorkouts,
      ...envelope.tables.chatMessages,
      ...envelope.tables.shoes,
    ].map((r) => String(r.id));
    for (const id of outputIds) {
      expect(issued.has(id), `${id} was not issued by the factory`).toBe(true);
    }
  });
});
