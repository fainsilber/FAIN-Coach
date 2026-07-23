import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/db/db';
import { formatDate, formatDistance, formatDuration, formatPace } from '@/lib/format';
import { usePreferences } from '@/lib/usePreferences';

export function HistoryPage() {
  const { unitSystem } = usePreferences();
  const runs = useLiveQuery(() =>
    db.runs.orderBy('date').reverse().toArray(),
  );

  if (runs === undefined) return null; // initial DB read

  if (runs.length === 0) {
    return (
      <section className="mx-auto max-w-xl">
        <h2 className="text-xl font-semibold">Run History</h2>
        <p className="mt-2 text-muted-foreground">
          No runs yet.{' '}
          <Link to="/upload" className="underline">
            Upload a TCX file
          </Link>{' '}
          to get started.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">Run History</h2>
      <ul className="mt-4 divide-y rounded-lg border">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              to={`/runs/${run.id}`}
              className="flex items-center justify-between p-3 hover:bg-accent/50"
            >
              <div>
                <p className="text-sm font-medium">{formatDate(run.date)}</p>
                <p className="text-sm text-muted-foreground">
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
                  RPE {run.rpe}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
