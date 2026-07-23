import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { LapChart, type LapPoint } from '@/components/LapChart';
import { StatGrid } from '@/components/StatGrid';
import { db } from '@/db/db';
import { FEEL_TAGS, type FeelTag, type LapSplit } from '@/db/types';

function isFeelTag(tag: string): tag is FeelTag {
  return (FEEL_TAGS as readonly string[]).includes(tag);
}
import {
  formatDate,
  formatDistance,
  formatDistanceValue,
  formatDuration,
  formatPace,
  formatPaceValue,
} from '@/lib/format';
import { localeOf, useI18n } from '@/i18n';
import { usePreferences } from '@/lib/usePreferences';
import {
  distanceUnitLabel,
  paceUnitLabel,
  secondsPerDistanceUnit,
  type UnitSystem,
} from '@/lib/units';

/** Bare m:ss — the Pace column header already carries the unit. */
function lapPace(lap: LapSplit, unit: UnitSystem): string {
  const perUnit = secondsPerDistanceUnit(
    lap.distanceMeters,
    lap.durationSeconds,
    unit,
  );
  return perUnit === undefined ? '—' : formatPaceValue(perUnit);
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

function dayGap(a: string, b: string): number {
  return Math.abs(
    Math.round(
      (Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000,
    ),
  );
}

export function RunDetailPage() {
  const { t, language } = useI18n();
  const { unitSystem } = usePreferences();
  const { id } = useParams();
  // undefined = still loading; null = looked up and not found
  const run = useLiveQuery(
    async () => (await db.runs.get(Number(id))) ?? null,
    [id],
  );
  const linkOptions = useLiveQuery(async () => {
    if (!run) return [];
    const plan = await db.trainingPlans.where('status').equals('active').first();
    if (plan?.id === undefined) return [];
    const workouts = await db.plannedWorkouts
      .where('planId')
      .equals(plan.id)
      .toArray();
    return workouts
      .filter((w) => w.type !== 'rest' && dayGap(w.date, run.date) <= 7)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [run?.id, run?.plannedWorkoutId]);

  async function handleRelink(value: string) {
    if (!run?.id) return;
    const newId = value ? Number(value) : undefined;
    const oldId = run.plannedWorkoutId;
    await db.transaction('rw', [db.runs, db.plannedWorkouts], async () => {
      if (oldId !== undefined && oldId !== newId) {
        await db.plannedWorkouts.update(oldId, { status: 'pending' });
      }
      if (newId !== undefined) {
        await db.plannedWorkouts.update(newId, { status: 'completed' });
      }
      await db.runs.update(run.id!, {
        plannedWorkoutId: newId,
        matchStatus: newId !== undefined ? 'confirmed' : 'unplanned',
      });
    });
  }

  if (run === undefined) return null; // initial DB read

  if (run === null) {
    return (
      <section className="mx-auto max-w-2xl">
        <p className="text-muted-foreground">{t('run.notFound')}</p>
        <Link to="/" className="text-sm underline">
          {t('run.backToHistory')}
        </Link>
      </section>
    );
  }

  const stats: Array<[string, string]> = [
    [t('stat.distance'), formatDistance(run.totalDistanceMeters, unitSystem)],
    [t('stat.time'), formatDuration(run.totalDurationSeconds)],
    [
      t('stat.pace'),
      formatPace(run.totalDistanceMeters, run.totalDurationSeconds, unitSystem),
    ],
  ];
  if (run.avgHeartRate !== undefined)
    stats.push([t('stat.avgHr'), `${run.avgHeartRate} bpm`]);
  if (run.maxHeartRate !== undefined)
    stats.push([t('stat.maxHr'), `${run.maxHeartRate} bpm`]);
  if (run.avgCadence !== undefined)
    stats.push([t('stat.cadence'), `${run.avgCadence} spm`]);
  if (run.avgPower !== undefined)
    stats.push([t('stat.power'), `${run.avgPower} W`]);
  if (run.rpe !== undefined) stats.push([t('stat.rpe'), String(run.rpe)]);

  const pace = points(run.laps, (l) =>
    secondsPerDistanceUnit(l.distanceMeters, l.durationSeconds, unitSystem),
  );
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
          {t('run.back')}
        </Link>
        <h2 className="mt-1 text-xl font-semibold">
          {formatDate(run.date, localeOf(language))}
        </h2>
        {run.feelTags && run.feelTags.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1.5">
            {run.feelTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs"
              >
                {isFeelTag(tag) ? t(`feel.${tag}`) : tag.replace('-', ' ')}
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

      {linkOptions !== undefined && linkOptions.length > 0 && (
        <label className="block rounded-lg border p-3">
          <span className="mb-1 block text-sm font-medium">
            {t('run.plannedWorkout')}
          </span>
          <select
            value={run.plannedWorkoutId ?? ''}
            onChange={(e) => void handleRelink(e.target.value)}
            className="w-full rounded-md border bg-background p-2 text-sm"
          >
            <option value="">{t('run.notLinked')}</option>
            {linkOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.date} · {t(`type.${w.type}`)} · {w.description.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-6">
        {pace.length > 0 && (
          <LapChart
            title={t('chart.pace')}
            unit={`min${paceUnitLabel(unitSystem)}`}
            color="var(--chart-pace)"
            data={pace}
            format={formatPaceValue}
          />
        )}
        {hasHr && (
          <LapChart
            title={t('chart.hr')}
            unit="bpm"
            color="var(--chart-hr)"
            data={hr}
            format={(v) => String(Math.round(v))}
          />
        )}
        {hasCadence && (
          <LapChart
            title={t('chart.cadence')}
            unit="spm"
            color="var(--chart-cadence)"
            data={cadence}
            format={(v) => String(Math.round(v))}
          />
        )}
        {hasPower && (
          <LapChart
            title={t('chart.power')}
            unit="W"
            color="var(--chart-power)"
            data={power}
            format={(v) => String(Math.round(v))}
          />
        )}
      </div>

      {/* Manually entered runs have no laps — render nothing rather than a
          header row over an empty body.
          dir="ltr": a numeric grid keeps LTR column flow even in an RTL UI;
          the translated headers still read correctly per cell */}
      {run.laps.length > 0 && (
      <div className="overflow-x-auto rounded-lg border" dir="ltr">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b bg-secondary/50 text-start text-xs text-muted-foreground">
              <th className="p-2 font-medium">{t('table.lap')}</th>
              <th className="p-2 font-medium">{distanceUnitLabel(unitSystem)}</th>
              <th className="p-2 font-medium">{t('table.time')}</th>
              <th className="p-2 font-medium">{t('table.pace')}</th>
              {hasHr && <th className="p-2 font-medium">{t('table.hr')}</th>}
              {hasCadence && (
                <th className="p-2 font-medium">{t('table.cadence')}</th>
              )}
              {hasPower && <th className="p-2 font-medium">{t('table.watts')}</th>}
            </tr>
          </thead>
          <tbody>
            {run.laps.map((lap) => (
              <tr key={lap.lapIndex} className="border-b last:border-0">
                <td className="p-2">{lap.lapIndex + 1}</td>
                <td className="p-2">
                  {formatDistanceValue(lap.distanceMeters, unitSystem)}
                </td>
                <td className="p-2">{formatDuration(lap.durationSeconds)}</td>
                <td className="p-2">
                  {lapPace(lap, unitSystem)}
                </td>
                {hasHr && <td className="p-2">{lap.avgHeartRate ?? '—'}</td>}
                {hasCadence && <td className="p-2">{lap.avgCadence ?? '—'}</td>}
                {hasPower && <td className="p-2">{lap.avgPower ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
