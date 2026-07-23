import type { PlannedWorkout } from '@/db/types';
import { localeOf, useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * "Looks like your planned tempo — was it?" Shared by TCX upload and manual
 * entry so both confirm a plan match identically (dev plan §10.4).
 */
export function MatchConfirm({
  match,
  accepted,
  onChange,
}: {
  match: PlannedWorkout;
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}) {
  const { t, language } = useI18n();

  return (
    <div className="rounded-lg border border-primary/40 p-3">
      <p className="text-sm">
        {t('upload.matchQuestion', {
          type: t(`type.${match.type}`),
          weekday: new Date(`${match.date}T12:00:00Z`).toLocaleDateString(
            localeOf(language),
            { weekday: 'long' },
          ),
          description: match.description,
        })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          aria-pressed={accepted}
          onClick={() => onChange(true)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm',
            accepted && 'bg-primary text-primary-foreground',
          )}
        >
          {t('upload.matchYes')}
        </button>
        <button
          type="button"
          aria-pressed={!accepted}
          onClick={() => onChange(false)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm',
            !accepted && 'bg-primary text-primary-foreground',
          )}
        >
          {t('upload.matchNo')}
        </button>
      </div>
    </div>
  );
}
