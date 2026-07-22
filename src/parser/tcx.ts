import type { LapSplit, RunRecord } from '@/db/types';

/** A parsed run, ready for the post-run form (RPE, tags, notes) and DB insert. */
export type ParsedRun = Omit<
  RunRecord,
  'id' | 'rpe' | 'feelTags' | 'userNotes' | 'plannedWorkoutId'
>;

export class TcxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TcxParseError';
  }
}

// FR-1.4: values below this are single-leg cadence and must be doubled to SPM.
const SINGLE_LEG_CADENCE_THRESHOLD = 120;

function normalizeCadence(value: number): number {
  return value < SINGLE_LEG_CADENCE_THRESHOLD ? value * 2 : value;
}

// All lookups match on localName so the parser is agnostic to the extension
// namespace prefix (Garmin uses ns3:, other devices differ).
function childByLocal(el: Element, local: string): Element | undefined {
  for (const child of Array.from(el.children)) {
    if (child.localName === local) return child;
  }
  return undefined;
}

function descendantsByLocal(root: Element | Document, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local));
}

function numFrom(el: Element | undefined): number | undefined {
  const text = el?.textContent?.trim();
  if (!text) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** <AverageHeartRateBpm><Value>N</Value></...> and friends. */
function hrValue(el: Element | undefined): number | undefined {
  return el ? numFrom(childByLocal(el, 'Value')) : undefined;
}

/** Numeric field inside a trackpoint's <ns3:TPX> extension block. */
function tpxNum(trackpoint: Element, local: string): number | undefined {
  const tpx = descendantsByLocal(trackpoint, 'TPX')[0];
  return tpx ? numFrom(childByLocal(tpx, local)) : undefined;
}

function collect<T>(
  items: T[],
  pick: (item: T) => number | undefined,
): number[] {
  const out: number[] = [];
  for (const item of items) {
    const v = pick(item);
    if (v !== undefined) out.push(v);
  }
  return out;
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function maxOf(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}

/** Distance covered per trackpoints: last cumulative reading minus first. */
function trackpointDistance(trackpoints: Element[]): number {
  const readings = collect(trackpoints, (tp) =>
    numFrom(childByLocal(tp, 'DistanceMeters')),
  );
  if (readings.length < 2) return 0;
  return readings[readings.length - 1] - readings[0];
}

interface LapAggregate {
  split: LapSplit;
  maxHeartRate?: number;
}

function parseLap(lapEl: Element, lapIndex: number): LapAggregate {
  const trackpoints = descendantsByLocal(lapEl, 'Trackpoint');
  const lx = descendantsByLocal(lapEl, 'LX')[0];

  const durationSeconds = numFrom(childByLocal(lapEl, 'TotalTimeSeconds')) ?? 0;
  const distanceMeters =
    numFrom(childByLocal(lapEl, 'DistanceMeters')) ??
    trackpointDistance(trackpoints);

  // Prefer device-computed lap aggregates; fall back to averaging trackpoints.
  // Absent metrics stay undefined — never defaulted (FR-1.3 / FR-3.4).
  const avgHeartRate =
    hrValue(childByLocal(lapEl, 'AverageHeartRateBpm')) ??
    mean(collect(trackpoints, (tp) => hrValue(childByLocal(tp, 'HeartRateBpm'))));
  const maxHeartRate =
    hrValue(childByLocal(lapEl, 'MaximumHeartRateBpm')) ??
    maxOf(collect(trackpoints, (tp) => hrValue(childByLocal(tp, 'HeartRateBpm'))));
  const rawCadence =
    (lx ? numFrom(childByLocal(lx, 'AvgRunCadence')) : undefined) ??
    mean(collect(trackpoints, (tp) => tpxNum(tp, 'RunCadence')));
  const avgPower =
    (lx ? numFrom(childByLocal(lx, 'AvgWatts')) : undefined) ??
    mean(collect(trackpoints, (tp) => tpxNum(tp, 'Watts')));

  return {
    split: {
      lapIndex,
      distanceMeters,
      durationSeconds,
      ...(avgHeartRate !== undefined && {
        avgHeartRate: Math.round(avgHeartRate),
      }),
      ...(rawCadence !== undefined && {
        avgCadence: Math.round(normalizeCadence(rawCadence)),
      }),
      ...(avgPower !== undefined && { avgPower: Math.round(avgPower) }),
    },
    ...(maxHeartRate !== undefined && { maxHeartRate }),
  };
}

/** Duration-weighted average across laps, using only laps that have the metric. */
function weightedAvg(
  laps: LapSplit[],
  pick: (lap: LapSplit) => number | undefined,
): number | undefined {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const lap of laps) {
    const value = pick(lap);
    if (value === undefined || lap.durationSeconds <= 0) continue;
    weightedSum += value * lap.durationSeconds;
    totalWeight += lap.durationSeconds;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : undefined;
}

/**
 * Defensive client-side TCX parser (PRD 4.1 / dev plan Sprint 1).
 * Aggregates to lap level and discards trackpoints — the returned run contains
 * no time series. Runs entirely in the browser via native DOMParser.
 */
export function parseTcx(xml: string): ParsedRun {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (descendantsByLocal(doc, 'parsererror').length > 0) {
    throw new TcxParseError('File is not valid XML');
  }

  const activity = descendantsByLocal(doc, 'Activity')[0];
  if (!activity) {
    throw new TcxParseError('No <Activity> found in file');
  }

  const lapEls = descendantsByLocal(activity, 'Lap');
  if (lapEls.length === 0) {
    throw new TcxParseError('Activity contains no laps');
  }

  const date =
    childByLocal(activity, 'Id')?.textContent?.trim() ||
    lapEls[0].getAttribute('StartTime');
  if (!date) {
    throw new TcxParseError('Activity has no start date');
  }

  const aggregates = lapEls.map(parseLap);
  const laps = aggregates.map((a) => a.split);

  const avgHeartRate = weightedAvg(laps, (l) => l.avgHeartRate);
  const avgCadence = weightedAvg(laps, (l) => l.avgCadence);
  const avgPower = weightedAvg(laps, (l) => l.avgPower);
  const maxHeartRate = maxOf(collect(aggregates, (a) => a.maxHeartRate));

  return {
    date,
    totalDistanceMeters: laps.reduce((s, l) => s + l.distanceMeters, 0),
    totalDurationSeconds: laps.reduce((s, l) => s + l.durationSeconds, 0),
    ...(avgHeartRate !== undefined && {
      avgHeartRate: Math.round(avgHeartRate),
    }),
    ...(maxHeartRate !== undefined && { maxHeartRate }),
    ...(avgCadence !== undefined && { avgCadence: Math.round(avgCadence) }),
    ...(avgPower !== undefined && { avgPower: Math.round(avgPower) }),
    laps,
    matchStatus: 'unmatched',
  };
}
