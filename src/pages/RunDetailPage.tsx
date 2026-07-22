import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { LapChart, type LapPoint } from '@/components/LapChart';
import { StatGrid } from '@/components/StatGrid';
import { db } from '@/db/db';
import type { LapSplit } from '@/db/types';
import { formatDate, formatDuration, formatKm, formatPace } from '@/lib/format';

function paceSecPerKm(lap: LapSplit): number | undefined {
  if (lap.distanceMeters <= 0 || lap.durationSeconds <= 0) return undefined;
  return lap.durationSeconds / (lap.distanceMeters / 1000);
}

function formatPaceValue(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

function points(
  laps: LapSplit[],
  pick: (lap: LapSplit) => number | undefined,
): LapPoint[] {
  const out: LapPoint[] = [];
  for (const lap of laps) {
    const value = pick(lap);
    if (value !== undefined) out.push({ lap: lap.lapIndex + 1, value });
  }
  return out;
}

export function RunDetailPage() {
  const { id } = useParams();
  // undefined = still loading; null = looked up and not found
  const run = useLiveQuery(
    async () => (await db.runs.get(Number(id))) ?? null,
    [id],
  );

  if (run === undefined) return null; // initial DB read

  if (run === null) {
    return (
      <section className="mx-auto max-w-2xl">
        <p className="text-muted-foreground">Run not found.</p>
        <Link to="/" className="text-sm underline">
          Back to history
        </Link>
      </section>
    );
  }

  const stats: Array<[string, string]> = [
    ['Distance', formatKm(run.totalDistanceMeters)],
    ['Time', formatDuration(run.totalDurationSeconds)],
    ['Pace', formatPace(run.totalDistanceMeters, run.totalDurationSeconds)],
  ];
  if (run.avgHeartRate !== undefined)
    stats.push(['Avg HR', `${run.avgHeartRate} bpm`]);
  if (run.maxHeartRate !== undefined)
    stats.push(['Max HR', `${run.maxHeartRate} bpm`]);
  if (run.avgCadence !== undefined)
    stats.push(['Cadence', `${run.avgCadence} spm`]);
  if (run.avgPower !== undefined) stats.push(['Power', `${run.avgPower} W`]);
  if (run.rpe !== undefined) stats.push(['RPE', String(run.rpe)]);

  const pace = points(run.laps, paceSecPerKm);
  const hr = points(run.laps, (l) => l.avgHeartRate);
  const cadence = points(run.laps, (l) => l.avgCadence);
  const power = points(run.laps, (l) => l.avgPower);

  const hasHr = hr.length > 0;
  const hasCadence = cadence.length > 0;
  const hasPower = power.length > 0;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/" className="text-sm text-muted-foreground underline">
          ← History
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{formatDate(run.date)}</h2>
        {run.feelTags && run.feelTags.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1.5">
            {run.feelTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs"
              >
                {tag.replace('-', ' ')}
              </span>
            ))}
          </p>
        )}
      </div>

      <StatGrid stats={stats} />

      {run.userNotes && (
        <blockquote className="rounded-lg border p-3 text-sm text-muted-foreground">
          {run.userNotes}
        </blockquote>
      )}

      <div className="space-y-6">
        {pace.length > 0 && (
          <LapChart
            title="Pace"
            unit="min/km"
            color="var(--chart-pace)"
            data={pace}
            format={formatPaceValue}
          />
        )}
        {hasHr && (
          <LapChart
            title="Heart rate"
            unit="bpm"
            color="var(--chart-hr)"
            data={hr}
            format={(v) => String(Math.round(v))}
          />
        )}
        {hasCadence && (
          <LapChart
            title="Cadence"
            unit="spm"
            color="var(--chart-cadence)"
            data={cadence}
            format={(v) => String(Math.round(v))}
          />
        )}
        {hasPower && (
          <LapChart
            title="Power"
            unit="W"
            color="var(--chart-power)"
            data={power}
            format={(v) => String(Math.round(v))}
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b bg-secondary/50 text-left text-xs text-muted-foreground">
              <th className="p-2 font-medium">Lap</th>
              <th className="p-2 font-medium">km</th>
              <th className="p-2 font-medium">Time</th>
              <th className="p-2 font-medium">Pace</th>
              {hasHr && <th className="p-2 font-medium">HR</th>}
              {hasCadence && <th className="p-2 font-medium">Cad</th>}
              {hasPower && <th className="p-2 font-medium">W</th>}
            </tr>
          </thead>
          <tbody>
            {run.laps.map((lap) => (
              <tr key={lap.lapIndex} className="border-b last:border-0">
                <td className="p-2">{lap.lapIndex + 1}</td>
                <td className="p-2">{(lap.distanceMeters / 1000).toFixed(2)}</td>
                <td className="p-2">{formatDuration(lap.durationSeconds)}</td>
                <td className="p-2">
                  {formatPace(lap.distanceMeters, lap.durationSeconds).replace(
                    ' /km',
                    '',
                  )}
                </td>
                {hasHr && <td className="p-2">{lap.avgHeartRate ?? '—'}</td>}
                {hasCadence && <td className="p-2">{lap.avgCadence ?? '—'}</td>}
                {hasPower && <td className="p-2">{lap.avgPower ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
