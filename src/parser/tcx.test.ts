import { describe, expect, it } from 'vitest';
import { parseTcx, TcxParseError } from './tcx';
import corosXml from './fixtures/coros-prefix.tcx?raw';
import corruptXml from './fixtures/corrupt.tcx?raw';
import garminXml from './fixtures/garmin-21k.tcx?raw';
import missingCadenceXml from './fixtures/missing-cadence.tcx?raw';
import missingHrXml from './fixtures/missing-hr.tcx?raw';

describe('parseTcx — Garmin 21k export (real device file)', () => {
  // Expected values independently computed from the fixture's lap elements.
  const run = parseTcx(garminXml);

  it('reads the activity date from <Id>', () => {
    expect(run.date).toBe('2026-04-17T02:16:20.000Z');
  });

  it('aggregates all 22 laps', () => {
    expect(run.laps).toHaveLength(22);
    expect(run.totalDistanceMeters).toBeCloseTo(21290.1, 1);
    expect(run.totalDurationSeconds).toBeCloseTo(7417.981, 2);
  });

  it('computes duration-weighted run averages', () => {
    expect(run.avgHeartRate).toBe(148); // weighted 147.817
    expect(run.maxHeartRate).toBe(161);
    expect(run.avgCadence).toBe(175); // weighted single-leg 87.473 × 2
    expect(run.avgPower).toBe(290); // weighted 289.741
  });

  it('extracts lap 1 metrics from lap aggregates and ns3:LX extensions', () => {
    expect(run.laps[0]).toEqual({
      lapIndex: 0,
      distanceMeters: 1000.0,
      durationSeconds: 360.107,
      avgHeartRate: 125,
      avgCadence: 178, // LX AvgRunCadence 89, single-leg → ×2
      avgPower: 277,
    });
  });

  it('discards trackpoints — laps carry only aggregate fields', () => {
    for (const lap of run.laps) {
      expect(Object.keys(lap).sort()).toEqual(
        [
          'avgCadence',
          'avgHeartRate',
          'avgPower',
          'distanceMeters',
          'durationSeconds',
          'lapIndex',
        ].sort(),
      );
    }
  });

  it('starts as unmatched against any training plan', () => {
    expect(run.matchStatus).toBe('unmatched');
  });

  it('parses a 5.5MB file in reasonable time', () => {
    const start = performance.now();
    parseTcx(garminXml);
    const elapsed = performance.now() - start;
    // Real target is < 50ms in a browser (PRD NFR); jsdom's DOMParser is far
    // slower, so this only guards against pathological regressions.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('parseTcx — optional metrics (FR-1.3)', () => {
  it('omits heart rate entirely when the file has none (never defaults to 0)', () => {
    const run = parseTcx(missingHrXml);
    expect('avgHeartRate' in run).toBe(false);
    expect('maxHeartRate' in run).toBe(false);
    expect('avgHeartRate' in run.laps[0]).toBe(false);
    // Metrics that ARE present still come through.
    expect(run.avgCadence).toBe(180); // LX 90 single-leg → ×2
    expect(run.avgPower).toBe(255);
  });

  it('omits cadence and power when the file has no extensions', () => {
    const run = parseTcx(missingCadenceXml);
    expect('avgCadence' in run).toBe(false);
    expect('avgPower' in run).toBe(false);
    expect(run.avgHeartRate).toBe(140);
    expect(run.maxHeartRate).toBe(152);
  });
});

describe('parseTcx — non-Garmin namespace prefixes and fallbacks', () => {
  const run = parseTcx(corosXml);

  it('resolves extensions regardless of namespace prefix', () => {
    expect(run.laps[0].avgCadence).toBe(170); // trackpoint mean 85 → ×2
  });

  it('falls back to trackpoint means when lap has no LX aggregates', () => {
    expect(run.laps[0].avgHeartRate).toBe(135); // mean of 130, 140
  });

  it('does not double cadence already at or above 120 SPM', () => {
    expect(run.laps[1].avgCadence).toBe(130);
  });

  it('derives lap distance from cumulative trackpoints when lap omits it', () => {
    expect(run.laps[1].distanceMeters).toBe(500); // 1500 - 1000
    expect(run.totalDistanceMeters).toBe(1500);
  });

  it('computes lap max heart rate from trackpoints when lap omits it', () => {
    expect(run.maxHeartRate).toBe(140);
  });
});

describe('parseTcx — invalid input', () => {
  it('rejects corrupt XML with TcxParseError', () => {
    expect(() => parseTcx(corruptXml)).toThrow(TcxParseError);
  });

  it('rejects XML without an <Activity>', () => {
    expect(() => parseTcx('<TrainingCenterDatabase/>')).toThrow(
      /No <Activity>/,
    );
  });

  it('rejects an activity with no laps', () => {
    expect(() =>
      parseTcx('<TrainingCenterDatabase><Activities><Activity><Id>x</Id></Activity></Activities></TrainingCenterDatabase>'),
    ).toThrow(/no laps/);
  });
});
