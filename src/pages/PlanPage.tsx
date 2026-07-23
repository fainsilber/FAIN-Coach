import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/db';
import { getSetting, SETTING_KEYS } from '@/db/settings';
import type { PlannedWorkout } from '@/db/types';
import { cn } from '@/lib/utils';
import { LlmError } from '@/llm/LlmClient';
import { DEFAULT_PLAN_MODEL, OpenRouterClient } from '@/llm/openrouter';
import { requestPlanWorkouts, PlanParseError } from '@/prompts/planResponse';
import { weeksUntil } from '@/prompts/prompts';
import { localeOf, useI18n, type Language } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { formatDate, formatDistanceShort } from '@/lib/format';
import { usePreferences } from '@/lib/usePreferences';
import { groupByWeek } from '@/lib/week';
import { distanceUnitLabel, toMeters, METERS_PER_KM } from '@/lib/units';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';
const STATUS_OPTIONS = ['pending', 'completed', 'missed', 'skipped'] as const;

const TYPE_STYLES: Record<PlannedWorkout['type'], string> = {
  easy: 'bg-secondary',
  tempo: 'bg-[var(--chart-power)]/15',
  intervals: 'bg-[var(--chart-hr)]/15',
  long: 'bg-[var(--chart-pace)]/15',
  race: 'bg-[var(--chart-cadence)]/20 font-semibold',
  rest: 'bg-secondary/50',
};

function weekHeadingDate(weekStartDate: string, language: Language): string {
  return new Date(`${weekStartDate}T12:00:00Z`).toLocaleDateString(
    localeOf(language),
    { month: 'short', day: 'numeric' },
  );
}

function PlanWizard() {
  const { t, language } = useI18n();
  const { unitSystem } = usePreferences();
  const [goal, setGoal] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [weeklyKm, setWeeklyKm] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState('4');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<MessageKey>();

  const valid =
    goal.trim() &&
    raceDate &&
    Number(weeklyKm) > 0 &&
    Number(daysPerWeek) >= 1 &&
    Number(daysPerWeek) <= 7;

  async function handleGenerate() {
    setError(undefined);
    setBusy(true);
    try {
      const key = await getSetting(SETTING_KEYS.apiKey);
      if (!key) {
        setError('plan.needKey');
        return;
      }
      const model =
        (await getSetting(SETTING_KEYS.reasoningModel)) || DEFAULT_PLAN_MODEL;
      const history = await db.runs.orderBy('date').reverse().limit(8).toArray();
      const goalInput = {
        goal: goal.trim(),
        raceDate,
        // The field is entered in the user's units; PlanGoalInput is canonical km.
        currentWeeklyKm: toMeters(Number(weeklyKm), unitSystem) / METERS_PER_KM,
        daysPerWeek: Number(daysPerWeek),
      };
      const { workouts, generationContext } = await requestPlanWorkouts(
        new OpenRouterClient(key),
        model,
        goalInput,
        history,
        new Date(),
        ({ phase, chars }) => {
          const label = t(
            phase === 'reasoning'
              ? 'plan.progressThinking'
              : phase === 'retrying'
                ? 'plan.progressRetrying'
                : 'plan.progressWriting',
          );
          setProgress(
            t('plan.progressLine', {
              label,
              chars: chars.toLocaleString(localeOf(language)),
            }),
          );
        },
        unitSystem,
        language,
      );
      const planId = (await db.trainingPlans.add({
        createdAt: new Date().toISOString(),
        status: 'active',
        goal: `${goalInput.goal} on ${raceDate}`,
        weeks: weeksUntil(raceDate, new Date()),
        generationContext,
      })) as number;
      await db.plannedWorkouts.bulkAdd(
        workouts.map((w) => ({ ...w, planId, status: 'pending' as const })),
      );
    } catch (e) {
      if (e instanceof PlanParseError) {
        setError('plan.errMalformed');
      } else if (e instanceof LlmError) {
        setError(
          e.code === 'invalid-key'
            ? 'chat.errInvalidKey'
            : e.code === 'rate-limit'
              ? 'chat.errRateLimit'
              : 'chat.errNetwork',
        );
      } else {
        setError('plan.errGeneric');
      }
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t('plan.createTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('plan.createSubtitle')}
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm">{t('plan.goal')}</span>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t('plan.goalPlaceholder')}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">{t('plan.raceDate')}</span>
        <input
          type="date"
          value={raceDate}
          onChange={(e) => setRaceDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm">
            {t('plan.currentVolume', { unit: distanceUnitLabel(unitSystem) })}
          </span>
          <input
            type="number"
            min="1"
            value={weeklyKm}
            onChange={(e) => setWeeklyKm(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">{t('plan.runsPerWeek')}</span>
          <input
            type="number"
            min="1"
            max="7"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{t(error)}</p>}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => void handleGenerate()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? t('plan.generating') : t('plan.generate')}
      </button>
      {busy && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {progress ?? t('plan.contacting')} {t('plan.patienceNote')}
        </p>
      )}
    </section>
  );
}

export function PlanPage() {
  const { t, language } = useI18n();
  const { unitSystem, weekStart } = usePreferences();
  // undefined = still loading; null = no active plan
  const plan = useLiveQuery(async () =>
    (await db.trainingPlans.where('status').equals('active').first()) ?? null,
  );
  const workouts = useLiveQuery(
    async () =>
      plan?.id !== undefined
        ? db.plannedWorkouts.where('planId').equals(plan.id).sortBy('date')
        : [],
    [plan?.id],
  );

  if (plan === undefined || workouts === undefined) return null;
  if (plan === null) return <PlanWizard />;

  const todayIso = new Date().toISOString().slice(0, 10);
  const weeks = groupByWeek(workouts, (w) => w.date, weekStart);

  async function handleArchive() {
    if (!window.confirm(t('plan.archiveConfirm'))) {
      return;
    }
    if (plan?.id !== undefined) {
      await db.trainingPlans.update(plan.id, { status: 'archived' });
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{plan.goal}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('plan.header', {
            weeks: plan.weeks,
            date: formatDate(plan.createdAt, localeOf(language)),
          })}
        </p>
      </div>

      <div className="space-y-4">
        {weeks.map(({ weekStart: weekStartDate, items }) => (
          <div key={weekStartDate}>
            <h3 className="mb-1.5 text-sm font-medium text-muted-foreground">
              {t('plan.weekOf', {
                date: weekHeadingDate(weekStartDate, language),
              })}
            </h3>
            <ul className="space-y-1.5">
              {items.map((w) => (
                <li
                  key={w.id}
                  className={cn(
                    'rounded-lg border p-2.5',
                    w.date === todayIso && 'border-primary',
                    w.status === 'completed' && 'opacity-60',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {new Date(`${w.date}T12:00:00Z`).toLocaleDateString(
                        localeOf(language),
                        { weekday: 'short', month: 'short', day: 'numeric' },
                      )}
                      <span
                        className={cn(
                          'ms-2 rounded-full px-2 py-0.5 text-xs',
                          TYPE_STYLES[w.type],
                        )}
                      >
                        {t(`type.${w.type}`)}
                      </span>
                    </span>
                    <select
                      value={w.status}
                      onChange={(e) =>
                        void db.plannedWorkouts.update(w.id!, {
                          status: e.target
                            .value as PlannedWorkout['status'],
                        })
                      }
                      className="rounded-md border bg-background px-1.5 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                    {w.description}
                    {w.targetDistanceMeters !== undefined && (
                      <>
                        {' · '}
                        <bdi>
                          {formatDistanceShort(
                            w.targetDistanceMeters,
                            unitSystem,
                          )}
                        </bdi>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleArchive()}
        className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:text-destructive"
      >
        {t('plan.archive')}
      </button>
    </section>
  );
}
