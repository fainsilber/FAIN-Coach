import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/db';
import { getSetting, SETTING_KEYS } from '@/db/settings';
import type { PlannedWorkout } from '@/db/types';
import { cn } from '@/lib/utils';
import { LlmError } from '@/llm/LlmClient';
import { DEFAULT_REASONING_MODEL, OpenRouterClient } from '@/llm/openrouter';
import { requestPlanWorkouts, PlanParseError } from '@/prompts/planResponse';
import { weeksUntil } from '@/prompts/prompts';

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

function isoWeekLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `Week of ${monday.toISOString().slice(0, 10)}`;
}

function PlanWizard() {
  const [goal, setGoal] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [weeklyKm, setWeeklyKm] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState('4');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();

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
        setError('Add your OpenRouter API key in Settings first.');
        return;
      }
      const model =
        (await getSetting(SETTING_KEYS.reasoningModel)) ||
        DEFAULT_REASONING_MODEL;
      const history = await db.runs.orderBy('date').reverse().limit(8).toArray();
      const goalInput = {
        goal: goal.trim(),
        raceDate,
        currentWeeklyKm: Number(weeklyKm),
        daysPerWeek: Number(daysPerWeek),
      };
      const { workouts, generationContext } = await requestPlanWorkouts(
        new OpenRouterClient(key),
        model,
        goalInput,
        history,
        new Date(),
        ({ phase, chars }) => {
          const label =
            phase === 'reasoning'
              ? 'Model is thinking'
              : phase === 'retrying'
                ? 'Response was malformed — retrying'
                : 'Writing your plan';
          setProgress(`${label}… (${chars.toLocaleString()} characters)`);
        },
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
        setError(
          'The model could not produce a valid plan (even after a retry). Try again, or pick a different reasoning model in Settings.',
        );
      } else if (e instanceof LlmError) {
        setError(
          e.code === 'invalid-key'
            ? 'OpenRouter rejected the request — check your API key in Settings.'
            : e.message,
        );
      } else {
        setError('Plan generation failed unexpectedly.');
      }
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Create a Training Plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The reasoning model builds a week-by-week plan from your goal and
          recent runs.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm">Goal</span>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Sub-50 10k"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">Race date</span>
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
          <span className="mb-1 block text-sm">Current km/week</span>
          <input
            type="number"
            min="1"
            value={weeklyKm}
            onChange={(e) => setWeeklyKm(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Runs per week</span>
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => void handleGenerate()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Building your plan…' : 'Generate plan'}
      </button>
      {busy && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {progress ?? 'Contacting the model…'} Reasoning models can take a few
          minutes.
        </p>
      )}
    </section>
  );
}

export function PlanPage() {
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
  const byWeek = new Map<string, PlannedWorkout[]>();
  for (const w of workouts) {
    const label = isoWeekLabel(w.date);
    byWeek.set(label, [...(byWeek.get(label) ?? []), w]);
  }

  async function handleArchive() {
    if (
      !window.confirm(
        'Archive this plan and start fresh? The plan and its history stay in your data but are no longer active.',
      )
    ) {
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
          {plan.weeks}-week plan · created {plan.createdAt.slice(0, 10)}
        </p>
      </div>

      <div className="space-y-4">
        {[...byWeek.entries()].map(([label, weekWorkouts]) => (
          <div key={label}>
            <h3 className="mb-1.5 text-sm font-medium text-muted-foreground">
              {label}
            </h3>
            <ul className="space-y-1.5">
              {weekWorkouts.map((w) => (
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
                        undefined,
                        { weekday: 'short', month: 'short', day: 'numeric' },
                      )}
                      <span
                        className={cn(
                          'ml-2 rounded-full px-2 py-0.5 text-xs',
                          TYPE_STYLES[w.type],
                        )}
                      >
                        {w.type}
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
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {w.description}
                    {w.targetDistanceMeters !== undefined &&
                      ` · ${(w.targetDistanceMeters / 1000).toFixed(1)}km`}
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
        Archive plan & start a new one
      </button>
    </section>
  );
}
