import type { MessageKey } from '@/i18n/en';
import type { NewRun } from './saveRun';
import { toMeters, type UnitSystem } from './units';

/** Raw form strings, exactly as the inputs hold them. */
export interface ManualRunInput {
  date: string; // YYYY-MM-DD
  distance: string; // in the user's units
  hours: string;
  minutes: string;
  seconds: string;
  avgHeartRate: string;
  maxHeartRate: string;
  avgCadence: string;
  avgPower: string;
}

export const EMPTY_MANUAL_RUN: ManualRunInput = {
  date: '',
  distance: '',
  hours: '',
  minutes: '',
  seconds: '',
  avgHeartRate: '',
  maxHeartRate: '',
  avgCadence: '',
  avgPower: '',
};

/** Blank stays blank: an unmeasured metric must be absent, never 0 (FR-6.4). */
function optionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function durationSeconds(input: ManualRunInput): number {
  const h = Number(input.hours.trim() || 0);
  const m = Number(input.minutes.trim() || 0);
  const s = Number(input.seconds.trim() || 0);
  if (![h, m, s].every(Number.isFinite)) return Number.NaN;
  return h * 3600 + m * 60 + s;
}

export type ValidationResult =
  | { ok: true; run: NewRun }
  | { ok: false; error: MessageKey };

/**
 * Validates and converts a manual entry into a storable run.
 * Distance arrives in the user's units and leaves in metres (FR-6.5); pace is
 * never an input, so it can't contradict distance and duration.
 */
export function buildManualRun(
  input: ManualRunInput,
  unit: UnitSystem,
  today: Date = new Date(),
): ValidationResult {
  const distance = Number(input.distance.trim());
  if (!input.distance.trim() || !Number.isFinite(distance) || distance <= 0) {
    return { ok: false, error: 'manual.errDistance' };
  }

  const seconds = durationSeconds(input);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, error: 'manual.errDuration' };
  }

  if (!input.date) return { ok: false, error: 'manual.errDate' };
  // Noon UTC: a bare date must not shift across a timezone boundary.
  const dateIso = `${input.date}T12:00:00.000Z`;
  const parsed = Date.parse(dateIso);
  if (Number.isNaN(parsed) || parsed > today.getTime()) {
    return { ok: false, error: 'manual.errDate' };
  }

  const avgHeartRate = optionalNumber(input.avgHeartRate);
  const maxHeartRate = optionalNumber(input.maxHeartRate);
  const avgCadence = optionalNumber(input.avgCadence);
  const avgPower = optionalNumber(input.avgPower);

  const hrOutOfRange = (v: number | undefined) =>
    v !== undefined && (!Number.isFinite(v) || v < 30 || v > 250);
  if (hrOutOfRange(avgHeartRate) || hrOutOfRange(maxHeartRate)) {
    return { ok: false, error: 'manual.errHrRange' };
  }
  // The one cross-field check that catches a real transposition mistake.
  if (
    avgHeartRate !== undefined &&
    maxHeartRate !== undefined &&
    maxHeartRate < avgHeartRate
  ) {
    return { ok: false, error: 'manual.errHrOrder' };
  }
  if (
    avgCadence !== undefined &&
    (!Number.isFinite(avgCadence) || avgCadence < 0 || avgCadence > 300)
  ) {
    return { ok: false, error: 'manual.errCadence' };
  }
  if (
    avgPower !== undefined &&
    (!Number.isFinite(avgPower) || avgPower < 0 || avgPower > 2000)
  ) {
    return { ok: false, error: 'manual.errPower' };
  }

  return {
    ok: true,
    run: {
      date: dateIso,
      totalDistanceMeters: toMeters(distance, unit),
      totalDurationSeconds: seconds,
      // Spread-if-defined so omitted metrics are absent keys, not undefined
      // values that would serialize into backups.
      ...(avgHeartRate !== undefined && { avgHeartRate }),
      ...(maxHeartRate !== undefined && { maxHeartRate }),
      ...(avgCadence !== undefined && { avgCadence }),
      ...(avgPower !== undefined && { avgPower }),
      laps: [], // manual runs have no splits
      source: 'manual',
    },
  };
}
