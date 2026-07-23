import { describe, expect, it } from 'vitest';
import {
  buildManualRun,
  durationSeconds,
  EMPTY_MANUAL_RUN,
  type ManualRunInput,
} from './manualRun';

const TODAY = new Date('2026-07-23T12:00:00.000Z');

const minimal: ManualRunInput = {
  ...EMPTY_MANUAL_RUN,
  date: '2026-07-20',
  distance: '10',
  minutes: '50',
};

function run(input: Partial<ManualRunInput>, unit: 'metric' | 'imperial' = 'metric') {
  const result = buildManualRun({ ...minimal, ...input }, unit, TODAY);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.run;
}

function error(input: Partial<ManualRunInput>) {
  const result = buildManualRun({ ...minimal, ...input }, 'metric', TODAY);
  if (result.ok) throw new Error('expected a validation error');
  return result.error;
}

describe('durationSeconds', () => {
  it('sums h/m/s, treating blanks as zero', () => {
    expect(
      durationSeconds({ ...EMPTY_MANUAL_RUN, hours: '1', minutes: '2', seconds: '3' }),
    ).toBe(3723);
    expect(durationSeconds({ ...EMPTY_MANUAL_RUN, minutes: '50' })).toBe(3000);
  });
});

describe('buildManualRun — required fields', () => {
  it('accepts date + distance + duration alone', () => {
    const r = run({});
    expect(r.totalDistanceMeters).toBe(10000);
    expect(r.totalDurationSeconds).toBe(3000);
    expect(r.laps).toEqual([]);
    expect(r.source).toBe('manual');
  });

  it('anchors a bare date to noon UTC so it cannot shift a day', () => {
    expect(run({}).date).toBe('2026-07-20T12:00:00.000Z');
  });

  it.each([
    ['missing distance', { distance: '' }, 'manual.errDistance'],
    ['zero distance', { distance: '0' }, 'manual.errDistance'],
    ['negative distance', { distance: '-5' }, 'manual.errDistance'],
    ['no duration', { minutes: '', hours: '', seconds: '' }, 'manual.errDuration'],
    ['missing date', { date: '' }, 'manual.errDate'],
    ['future date', { date: '2026-08-01' }, 'manual.errDate'],
  ])('rejects %s', (_name, input, expected) => {
    expect(error(input)).toBe(expected);
  });
});

describe('buildManualRun — optional metrics (FR-6.4)', () => {
  it('omits blank metrics entirely rather than storing zero', () => {
    const r = run({});
    for (const key of ['avgHeartRate', 'maxHeartRate', 'avgCadence', 'avgPower']) {
      expect(key in r, `${key} should be absent`).toBe(false);
    }
  });

  it('keeps a genuine zero when the user really types 0', () => {
    expect(run({ avgPower: '0' }).avgPower).toBe(0);
  });

  it('carries provided metrics through', () => {
    const r = run({
      avgHeartRate: '148',
      maxHeartRate: '161',
      avgCadence: '175',
      avgPower: '290',
    });
    expect(r).toMatchObject({
      avgHeartRate: 148,
      maxHeartRate: 161,
      avgCadence: 175,
      avgPower: 290,
    });
  });
});

describe('buildManualRun — validation ranges', () => {
  it.each([
    ['implausible avg HR', { avgHeartRate: '400' }, 'manual.errHrRange'],
    ['implausible max HR', { maxHeartRate: '10' }, 'manual.errHrRange'],
    ['max HR below avg', { avgHeartRate: '160', maxHeartRate: '140' }, 'manual.errHrOrder'],
    ['absurd cadence', { avgCadence: '900' }, 'manual.errCadence'],
    ['absurd power', { avgPower: '9000' }, 'manual.errPower'],
    ['non-numeric HR', { avgHeartRate: 'abc' }, 'manual.errHrRange'],
  ])('rejects %s', (_name, input, expected) => {
    expect(error(input)).toBe(expected);
  });

  it('allows equal avg and max heart rate', () => {
    expect(run({ avgHeartRate: '150', maxHeartRate: '150' }).maxHeartRate).toBe(150);
  });
});

describe('buildManualRun — units (FR-6.5)', () => {
  it('stores metric input as metres unchanged', () => {
    expect(run({ distance: '21.1' }).totalDistanceMeters).toBeCloseTo(21100, 6);
  });

  it('converts imperial input to metres', () => {
    // 13.1 miles ≈ 21082.9 m — the value stored must be SI regardless of entry
    expect(run({ distance: '13.1' }, 'imperial').totalDistanceMeters).toBeCloseTo(
      21082.4,
      1,
    );
  });

  it('the same number means different distances in each system', () => {
    const metric = run({ distance: '10' }).totalDistanceMeters;
    const imperial = run({ distance: '10' }, 'imperial').totalDistanceMeters;
    expect(imperial).toBeGreaterThan(metric);
  });
});
