import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MatchConfirm } from '@/components/MatchConfirm';
import { PostRunForm, type PostRunDetails } from '@/components/PostRunForm';
import type { PlannedWorkout } from '@/db/types';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { buildCoachMessage } from '@/lib/coachMessage';
import { formatPace } from '@/lib/format';
import {
  buildManualRun,
  durationSeconds,
  EMPTY_MANUAL_RUN,
  type ManualRunInput,
} from '@/lib/manualRun';
import { findMatchCandidate } from '@/lib/matching';
import { activePlanWorkouts, saveRunAndPromptCoach } from '@/lib/saveRun';
import { distanceUnitLabel, toMeters } from '@/lib/units';
import { usePreferences } from '@/lib/usePreferences';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';

/** Manual run entry (PRD §4.6). Totals only — manual runs have no splits. */
export function ManualRunPage() {
  const { t } = useI18n();
  const { unitSystem } = usePreferences();
  const navigate = useNavigate();

  const [input, setInput] = useState<ManualRunInput>(EMPTY_MANUAL_RUN);
  const [error, setError] = useState<MessageKey>();
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState<PlannedWorkout>();
  const [matchAccepted, setMatchAccepted] = useState(true);

  const set = (field: keyof ManualRunInput) => (value: string) =>
    setInput((prev) => ({ ...prev, [field]: value }));

  // Live pace feedback — cheap reassurance that the numbers are sane. Pace is
  // derived, never entered, so it can't contradict distance and duration.
  const distanceValue = Number(input.distance.trim());
  const seconds = durationSeconds(input);
  const pacePreview =
    Number.isFinite(distanceValue) && distanceValue > 0 && seconds > 0
      ? formatPace(toMeters(distanceValue, unitSystem), seconds, unitSystem)
      : undefined;

  // Offer the plan match as soon as the run is well-formed, so the question is
  // answered before saving rather than interrupting it.
  useEffect(() => {
    let cancelled = false;
    const result = buildManualRun(input, unitSystem);
    if (!result.ok) {
      setMatch(undefined);
      return;
    }
    void activePlanWorkouts().then((workouts) => {
      if (cancelled) return;
      setMatch(findMatchCandidate(result.run, workouts));
      setMatchAccepted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [input.date, input.distance, input.hours, input.minutes, input.seconds, unitSystem]);

  async function handleSave(details: PostRunDetails) {
    const result = buildManualRun(input, unitSystem);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      const run = { ...result.run, ...details };
      const linkedWorkout = matchAccepted ? match : undefined;
      await saveRunAndPromptCoach({
        run,
        linkedWorkout,
        coachMessage: buildCoachMessage({ run, linkedWorkout, unitSystem, t }),
      });
      navigate('/chat', { state: { pendingReply: true } });
    } catch {
      setError('upload.saveFailed');
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('manual.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('manual.subtitle')}</p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm">{t('manual.date')}</span>
          <input
            type="date"
            value={input.date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set('date')(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">
            {t('manual.distance', { unit: distanceUnitLabel(unitSystem) })}
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={input.distance}
            onChange={(e) => set('distance')(e.target.value)}
            className={inputClass}
          />
        </label>

        <fieldset>
          <legend className="mb-1 text-sm">{t('manual.duration')}</legend>
          <div className="flex gap-2" dir="ltr">
            {(['hours', 'minutes', 'seconds'] as const).map((unit) => (
              <label key={unit} className="flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={input[unit]}
                  onChange={(e) => set(unit)(e.target.value)}
                  aria-label={t(`manual.${unit}` as MessageKey)}
                  className={inputClass}
                />
                <span className="mt-1 block text-center text-xs text-muted-foreground">
                  {t(`manual.${unit}` as MessageKey)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {pacePreview && (
          <p className="text-sm text-muted-foreground">
            <bdi>{t('manual.pacePreview', { pace: pacePreview })}</bdi>
          </p>
        )}
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">
          {t('manual.optional')}
        </p>
        {(
          [
            ['avgHeartRate', 'manual.avgHr', 250],
            ['maxHeartRate', 'manual.maxHr', 250],
            ['avgCadence', 'manual.cadence', 300],
            ['avgPower', 'manual.power', 2000],
          ] as const
        ).map(([field, labelKey, max]) => (
          <label key={field} className="block">
            <span className="mb-1 block text-sm">{t(labelKey)}</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={max}
              value={input[field]}
              onChange={(e) => set(field)(e.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </div>

      {match && (
        <MatchConfirm
          match={match}
          accepted={matchAccepted}
          onChange={setMatchAccepted}
        />
      )}

      {error && <p className="text-sm text-destructive">{t(error)}</p>}

      <PostRunForm onSave={handleSave} saving={saving} />

      <Link to="/upload" className="block text-sm text-muted-foreground underline">
        {t('manual.cancel')}
      </Link>
    </section>
  );
}
