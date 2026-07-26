import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { RunRecord } from '@/db/types';
import {
  BackupError,
  exportBackup,
  importBackup,
  parseBackup,
  wipeAllData,
} from './backup';

const sampleRun: RunRecord = {
  date: '2026-04-17T02:16:20.000Z',
  totalDistanceMeters: 21290.1,
  totalDurationSeconds: 7417.981,
  avgHeartRate: 148,
  maxHeartRate: 161,
  avgCadence: 175,
  avgPower: 290,
  laps: [
    {
      lapIndex: 0,
      distanceMeters: 1000,
      durationSeconds: 360.107,
      avgHeartRate: 125,
      avgCadence: 178,
      avgPower: 277,
    },
  ],
  rpe: 8,
  feelTags: ['strong'],
  userNotes: 'Race day',
  plannedWorkoutId: 3,
  matchStatus: 'confirmed',
};

beforeEach(async () => {
  await wipeAllData();
});

describe('backup export → wipe → import', () => {
  it('round-trips all tables losslessly, preserving ids and links', async () => {
    const shoeId = (await db.shoes.add({
      name: 'Pegasus 40',
      initialDistanceMeters: 0,
      retirementDistanceMeters: 800_000,
      retired: false,
    })) as number;
    await db.runs.add({ ...sampleRun, shoeId });
    await db.trainingPlans.add({
      createdAt: '2026-07-01T00:00:00.000Z',
      status: 'active',
      goal: 'Sub-50 10k on 2026-10-04',
      weeks: 12,
      generationContext: 'ctx',
    });
    await db.plannedWorkouts.add({
      planId: 1,
      date: '2026-07-22',
      type: 'tempo',
      description: '3x10min at threshold',
      status: 'pending',
    });
    await db.chatMessages.add({
      timestamp: '2026-07-22T10:00:00.000Z',
      role: 'assistant',
      content: 'Nice run!',
      planId: 1,
    });
    await db.settings.put({ key: 'fastModel', value: 'meta-llama/llama-3.3-70b-instruct' });

    const before = await exportBackup();
    await wipeAllData();
    expect(await db.runs.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);

    await importBackup(parseBackup(JSON.stringify(before)));
    const after = await exportBackup();

    expect(after.tables).toEqual(before.tables);
    // Links survive: the run still points at plannedWorkout id 3 and its shoe.
    const restored = await db.runs.toCollection().first();
    expect(restored?.plannedWorkoutId).toBe(3);
    expect(restored?.shoeId).toBe(shoeId);
    expect((await db.shoes.get(shoeId))?.name).toBe('Pegasus 40');
  });

  it('does not resurrect old rows after import (import replaces)', async () => {
    await db.runs.add({ ...sampleRun });
    const backup = await exportBackup();

    await db.runs.add({ ...sampleRun, date: '2026-05-01T06:00:00.000Z' });
    expect(await db.runs.count()).toBe(2);

    await importBackup(backup);
    expect(await db.runs.count()).toBe(1);
  });
});

describe('parseBackup validation', () => {
  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
  });

  it('rejects JSON from another app', () => {
    expect(() => parseBackup('{"app":"other"}')).toThrow(/Not a FAIN Coach/);
  });

  it('rejects unsupported schema versions', () => {
    expect(() =>
      parseBackup('{"app":"fain-coach","schemaVersion":999,"tables":{}}'),
    ).toThrow(/Unsupported backup version/);
  });

  it('rejects envelopes with missing tables', () => {
    expect(() =>
      parseBackup(
        '{"app":"fain-coach","schemaVersion":1,"tables":{"runs":[],"trainingPlans":[],"plannedWorkouts":[],"chatMessages":[]}}',
      ),
    ).toThrow(/missing table data/);
  });
});

describe('parseBackup v1 compatibility (Sprint 13)', () => {
  it('accepts a pre-shoes (v1) backup with no shoes key at all', () => {
    const v1 = JSON.stringify({
      app: 'fain-coach',
      schemaVersion: 1,
      exportedAt: '2026-07-01T00:00:00.000Z',
      tables: {
        runs: [{ ...sampleRun }],
        trainingPlans: [],
        plannedWorkouts: [],
        chatMessages: [],
        settings: [],
        // no `shoes` — this file predates Sprint 13
      },
    });
    const parsed = parseBackup(v1);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.tables.shoes).toEqual([]);
    expect(parsed.tables.runs).toHaveLength(1);
  });

  it('a v1 backup imports cleanly end to end', async () => {
    const v1 = JSON.stringify({
      app: 'fain-coach',
      schemaVersion: 1,
      exportedAt: '2026-07-01T00:00:00.000Z',
      tables: {
        runs: [{ ...sampleRun, plannedWorkoutId: undefined }],
        trainingPlans: [],
        plannedWorkouts: [],
        chatMessages: [],
        settings: [],
      },
    });
    await importBackup(parseBackup(v1));
    expect(await db.runs.count()).toBe(1);
    expect(await db.shoes.count()).toBe(0);
  });
});

describe('diagnostics log exclusion (FR-8.10)', () => {
  it('never appears in an exported backup, even when entries exist', async () => {
    const { logEvent } = await import('./log');
    await logEvent('error', 'test.entry', 'should never be backed up');
    const envelope = await exportBackup();
    expect('logs' in envelope.tables).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain('should never be backed up');
  });
});
