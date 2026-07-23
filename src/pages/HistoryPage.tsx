import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/db/db';
import { localeOf, useI18n } from '@/i18n';
import { formatDate, formatDistance, formatDuration, formatPace } from '@/lib/format';
import { usePreferences } from '@/lib/usePreferences';

export function HistoryPage() {
  const { t, language } = useI18n();
  const { unitSystem } = usePreferences();
  const runs = useLiveQuery(() =>
    db.runs.orderBy('date').reverse().toArray(),
  );

  if (runs === undefined) return null; // initial DB read

  if (runs.length === 0) {
    return (
      <section className="mx-auto max-w-xl">
        <h2 className="text-xl font-semibold">{t('history.title')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('history.empty')}{' '}
          <Link to="/upload" className="underline">
            {t('history.uploadCta')}
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">{t('history.title')}</h2>
      <ul className="mt-4 divide-y rounded-lg border">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              to={`/runs/${run.id}`}
              className="flex items-center justify-between p-3 hover:bg-accent/50"
            >
              <div>
                <p className="text-sm font-medium">
                  {formatDate(run.date, localeOf(language))}
                </p>
                {/* dir="ltr": a numeric compound line must not be visually
                    reordered inside an RTL page (FR-5.3) */}
                <p className="text-sm text-muted-foreground" dir="ltr">
                  {formatDistance(run.totalDistanceMeters, unitSystem)} ·{' '}
                  {formatDuration(run.totalDurationSeconds)} ·{' '}
                  {formatPace(
                    run.totalDistanceMeters,
                    run.totalDurationSeconds,
                    unitSystem,
                  )}
                </p>
              </div>
              {run.rpe !== undefined && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                  <bdi>{t('history.rpe', { rpe: run.rpe })}</bdi>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
