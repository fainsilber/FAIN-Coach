import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { clearLog, exportLogText, getLogEntries, logEvent } from './log';

beforeEach(async () => {
  await db.logs.clear();
});

describe('logEvent redaction (FR-8.8)', () => {
  it('redacts anything shaped like an OpenRouter API key', async () => {
    await logEvent(
      'error',
      'chat.request.failed',
      'key sk-or-v1-abcdefghijklmnop failed',
    );
    const [entry] = await getLogEntries();
    expect(entry.detail).not.toContain('sk-or-v1-abcdefghijklmnop');
    expect(entry.detail).toContain('[redacted]');
  });

  it('truncates an overly long detail rather than storing it verbatim', async () => {
    await logEvent('info', 'test.long', 'x'.repeat(5000));
    const [entry] = await getLogEntries();
    expect(entry.detail!.length).toBeLessThanOrEqual(500);
  });

  it('omits the detail key entirely when none is given', async () => {
    await logEvent('info', 'test.no-detail');
    const [entry] = await getLogEntries();
    expect('detail' in entry).toBe(false);
  });
});

describe('logEvent bounding', () => {
  it(
    'trims to the newest entries once the cap is exceeded',
    async () => {
      for (let i = 0; i < 520; i++) {
        await logEvent('info', `test.event.${i}`);
      }
      const entries = await getLogEntries();
      expect(entries.length).toBeLessThanOrEqual(500);
      expect(entries.at(-1)?.event).toBe('test.event.519');
      expect(entries.some((e) => e.event === 'test.event.0')).toBe(false);
    },
    20000,
  );
});

describe('logEvent resilience (FR-8.11)', () => {
  it('never throws even if the underlying write fails', async () => {
    const spy = vi.spyOn(db.logs, 'add').mockRejectedValueOnce(new Error('boom'));
    await expect(logEvent('error', 'test.will.fail')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('clearLog', () => {
  it('empties the log', async () => {
    await logEvent('info', 'test.one');
    await clearLog();
    expect(await getLogEntries()).toHaveLength(0);
  });
});

describe('exportLogText (FR-8.7, 8.9)', () => {
  it('is human-readable and carries the build identity as a header', async () => {
    await logEvent('error', 'tcx.parse.failed', 'size=1234 bad xml');
    const text = await exportLogText();
    expect(text).toContain('FAIN Coach diagnostics log');
    expect(text).toContain('Build:');
    expect(text).toContain('ERROR tcx.parse.failed');
    expect(text).toContain('size=1234 bad xml');
  });
});
