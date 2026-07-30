import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import corruptXml from '@/parser/fixtures/corrupt.tcx?raw';
import garminXml from '@/parser/fixtures/garmin-21k.tcx?raw';
// 2 KB rather than 5.5 MB — the dedupe rules don't care what's in the file,
// and re-parsing the big export per candidate made this suite time out.
import smallXml from '@/parser/fixtures/coros-prefix.tcx?raw';
import {
  externalIdFromFilename,
  importableCount,
  markDuplicates,
  parseImportCandidate,
  type ImportCandidate,
} from './providerImport';

describe('externalIdFromFilename', () => {
  it('extracts the activity id from the helper naming convention', () => {
    expect(externalIdFromFilename('garmin-23754217618.tcx')).toBe('23754217618');
  });

  it('is case-insensitive about the extension', () => {
    expect(externalIdFromFilename('GARMIN-123.TCX')).toBe('123');
  });

  it('returns undefined for a file the user renamed', () => {
    // Deliberate: a renamed file still imports, it just can't be recognised
    // on a later re-import. Failing this way round is the safe one.
    expect(externalIdFromFilename('morning run.tcx')).toBeUndefined();
    expect(externalIdFromFilename('garmin-abc.tcx')).toBeUndefined();
    expect(externalIdFromFilename('strava-123.tcx')).toBeUndefined();
  });
});

describe('parseImportCandidate', () => {
  // Parsed here rather than inside `it` — the 5.5 MB fixture takes seconds, and
  // only test *bodies* are subject to the timeout. Same pattern as tcx.test.ts.
  const bigExport = parseImportCandidate('garmin-999.tcx', garminXml);

  it('parses a real export into a ready row carrying its external id', () => {
    expect(bigExport.status).toBe('ready');
    expect(bigExport.externalId).toBe('999');
    expect(bigExport.run?.laps).toHaveLength(22);
  });

  it('turns a corrupt file into an error row instead of throwing', () => {
    // One bad export must never abort a 200-file batch.
    const c = parseImportCandidate('garmin-1.tcx', corruptXml);
    expect(c.status).toBe('error');
    expect(c.error).toBeTruthy();
    expect(c.run).toBeUndefined();
  });

  it('still parses a file with no recognisable id', () => {
    const c = parseImportCandidate('whatever.tcx', smallXml);
    expect(c.status).toBe('ready');
    expect(c.externalId).toBeUndefined();
  });
});

describe('markDuplicates', () => {
  beforeEach(async () => {
    await db.runs.clear();
  });

  const sampleRun = parseImportCandidate('sample.tcx', smallXml).run;
  const ready = (fileName: string, externalId?: string): ImportCandidate => ({
    fileName,
    status: 'ready',
    run: sampleRun,
    ...(externalId && { externalId }),
  });

  it('flags an activity already in the database', async () => {
    await db.runs.add({
      date: '2026-04-17T02:16:20.000Z',
      totalDistanceMeters: 100,
      totalDurationSeconds: 60,
      laps: [],
      matchStatus: 'unplanned',
      source: 'garmin',
      externalId: '555',
    });

    const marked = await markDuplicates([ready('garmin-555.tcx', '555')]);
    expect(marked[0].status).toBe('duplicate');
  });

  it('leaves genuinely new activities importable', async () => {
    const marked = await markDuplicates([ready('garmin-777.tcx', '777')]);
    expect(marked[0].status).toBe('ready');
    expect(importableCount(marked)).toBe(1);
  });

  it('catches the same activity appearing twice within one batch', async () => {
    const marked = await markDuplicates([
      ready('garmin-42.tcx', '42'),
      ready('garmin-42 (1).tcx', '42'),
    ]);
    expect(marked.map((c) => c.status)).toEqual(['ready', 'duplicate']);
  });

  it('never flags rows with no external id, and leaves error rows alone', async () => {
    const marked = await markDuplicates([
      ready('renamed.tcx'),
      { fileName: 'bad.tcx', status: 'error', error: 'nope' },
    ]);
    expect(marked.map((c) => c.status)).toEqual(['ready', 'error']);
  });

  it('does not confuse a TCX-sourced run with a provider one', async () => {
    // A hand-uploaded run has no externalId at all, so it must never occupy
    // an id in the dedupe index.
    await db.runs.add({
      date: '2026-04-17T02:16:20.000Z',
      totalDistanceMeters: 100,
      totalDurationSeconds: 60,
      laps: [],
      matchStatus: 'unplanned',
      source: 'tcx',
    });
    const marked = await markDuplicates([ready('garmin-1.tcx', '1')]);
    expect(marked[0].status).toBe('ready');
  });
});
