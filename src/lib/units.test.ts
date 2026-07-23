import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatPace,
  formatPaceValue,
  formatDuration,
} from './format';
import {
  METERS_PER_MILE,
  secondsPerDistanceUnit,
  toDisplayDistance,
  toMeters,
} from './units';

describe('distance conversion', () => {
  it('leaves metric as kilometres', () => {
    expect(toDisplayDistance(21290.1, 'metric')).toBeCloseTo(21.2901, 4);
    expect(formatDistance(21290.1, 'metric')).toBe('21.29 km');
  });

  it('converts to miles for imperial', () => {
    expect(toDisplayDistance(METERS_PER_MILE, 'imperial')).toBeCloseTo(1, 10);
    expect(formatDistance(21290.1, 'imperial')).toBe('13.23 mi');
  });

  it('round-trips display → metres → display in both systems', () => {
    for (const unit of ['metric', 'imperial'] as const) {
      expect(toDisplayDistance(toMeters(8, unit), unit)).toBeCloseTo(8, 10);
    }
  });
});

describe('pace conversion', () => {
  // 21290.1 m in 7417.981 s = 348.4 s/km (5:48) = 560.8 s/mi (9:21)
  const meters = 21290.1;
  const seconds = 7417.981;

  it('computes min/km under metric', () => {
    expect(formatPace(meters, seconds, 'metric')).toBe('5:48 /km');
  });

  it('computes min/mile under imperial', () => {
    expect(formatPace(meters, seconds, 'imperial')).toBe('9:21 /mi');
  });

  it('pace inverts with distance — a mile pace is slower than a km pace', () => {
    const perKm = secondsPerDistanceUnit(meters, seconds, 'metric')!;
    const perMile = secondsPerDistanceUnit(meters, seconds, 'imperial')!;
    expect(perMile).toBeGreaterThan(perKm);
    expect(perMile / perKm).toBeCloseTo(METERS_PER_MILE / 1000, 6);
  });

  it('returns a dash rather than guessing when pace is undefined', () => {
    expect(formatPace(0, 100, 'metric')).toBe('—');
    expect(formatPace(1000, 0, 'imperial')).toBe('—');
  });

  it('carries 59.5s up to the next minute instead of showing :60', () => {
    expect(formatPaceValue(359.6)).toBe('6:00');
  });
});

describe('unit-independent formatting', () => {
  it('formats durations with and without hours', () => {
    expect(formatDuration(7417.981)).toBe('2:03:38');
    expect(formatDuration(360.107)).toBe('6:00');
  });
});
