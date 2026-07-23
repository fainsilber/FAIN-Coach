import {
  distanceUnitLabel,
  paceUnitLabel,
  secondsPerDistanceUnit,
  toDisplayDistance,
  toDisplayElevation,
  elevationUnitLabel,
  type UnitSystem,
} from './units';

/** e.g. "21.29 km" / "13.23 mi" */
export function formatDistance(meters: number, unit: UnitSystem): string {
  return `${toDisplayDistance(meters, unit).toFixed(2)} ${distanceUnitLabel(unit)}`;
}

/** Compact form for tight spaces (plan targets): "8.0 km" / "5.0 mi" */
export function formatDistanceShort(meters: number, unit: UnitSystem): string {
  return `${toDisplayDistance(meters, unit).toFixed(1)} ${distanceUnitLabel(unit)}`;
}

/** Bare number, for table cells that carry the unit in the column header. */
export function formatDistanceValue(meters: number, unit: UnitSystem): string {
  return toDisplayDistance(meters, unit).toFixed(2);
}

export function formatElevation(meters: number, unit: UnitSystem): string {
  return `${Math.round(toDisplayElevation(meters, unit))} ${elevationUnitLabel(unit)}`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** m:ss with no unit suffix — for chart axes and table cells. */
export function formatPaceValue(secondsPerUnit: number): string {
  const m = Math.floor(secondsPerUnit / 60);
  const s = Math.round(secondsPerUnit % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** e.g. "5:48 /km" / "9:20 /mi" */
export function formatPace(
  meters: number,
  seconds: number,
  unit: UnitSystem,
): string {
  const perUnit = secondsPerDistanceUnit(meters, seconds, unit);
  if (perUnit === undefined) return '—';
  return `${formatPaceValue(perUnit)} ${paceUnitLabel(unit)}`;
}

export function formatDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}
