// The single conversion boundary (dev plan §8.2).
//
// Everything is STORED in SI (metres, seconds) exactly as parsed — conversion
// happens only on the way to a display string or an LLM prompt. That is what
// keeps backups portable between metric and imperial users.

export type UnitSystem = 'metric' | 'imperial';

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

export const METERS_PER_KM = 1000;
export const METERS_PER_MILE = 1609.344;
export const METERS_PER_FOOT = 0.3048;

/** Metres in one unit of displayed distance (km or mile). */
export function metersPerDistanceUnit(unit: UnitSystem): number {
  return unit === 'imperial' ? METERS_PER_MILE : METERS_PER_KM;
}

export function distanceUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'mi' : 'km';
}

export function paceUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? '/mi' : '/km';
}

export function elevationUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'ft' : 'm';
}

/** Metres → km or miles. */
export function toDisplayDistance(meters: number, unit: UnitSystem): number {
  return meters / metersPerDistanceUnit(unit);
}

/** km or miles → metres. Use for anything the user types. */
export function toMeters(displayDistance: number, unit: UnitSystem): number {
  return displayDistance * metersPerDistanceUnit(unit);
}

/** Metres → metres or feet. (Elevation is not currently captured by the TCX
 * parser; kept here so the unit system is complete if it ever is.) */
export function toDisplayElevation(meters: number, unit: UnitSystem): number {
  return unit === 'imperial' ? meters / METERS_PER_FOOT : meters;
}

/**
 * Seconds per displayed distance unit. Pace *inverts* with distance — a mile
 * is longer than a kilometre, so min/mile is a bigger number than min/km.
 * Returns undefined when pace is undefined rather than guessing.
 */
export function secondsPerDistanceUnit(
  meters: number,
  seconds: number,
  unit: UnitSystem,
): number | undefined {
  if (meters <= 0 || seconds <= 0) return undefined;
  return seconds / (meters / metersPerDistanceUnit(unit));
}
