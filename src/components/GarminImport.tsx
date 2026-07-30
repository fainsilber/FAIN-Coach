import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/i18n';
import {
  clearLinkCode,
  disconnect,
  fetchActivityTcx,
  getLinkCode,
  GarminLinkError,
  isGarminImportAvailable,
  listActivities,
  looksLikeLinkCode,
  setLinkCode,
} from '@/lib/garminLink';
import { logEvent } from '@/lib/log';
import { markDuplicates, parseImportCandidate, type ImportCandidate } from '@/lib/providerImport';

/**
 * Import straight from Garmin (dev plan §15.1 stage B).
 *
 * Connecting and importing live together because both answer "how do I get my
 * runs in?", and splitting them across two screens makes the one-time setup
 * feel like a separate feature.
 *
 * Renders nothing on a deployment with no Worker: `isGarminImportAvailable()`
 * folds to a build-time constant, so every request path is provably dead and
 * Rollup drops it (verified — the Pages bundle contains no `/api/garmin`
 * string). The component shell and its i18n strings do remain, since catalogs
 * carry every key regardless; that residue is a few hundred bytes, not the
 * ~240 kB that made the Dexie Cloud addon worth aliasing out.
 */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function GarminImport({
  onCandidates,
}: {
  onCandidates: (candidates: ImportCandidate[]) => void;
}) {
  const { t } = useI18n();
  const linkCode = useLiveQuery(getLinkCode, [], undefined);
  const [codeInput, setCodeInput] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();

  if (!isGarminImportAvailable()) return null;

  async function handleConnect() {
    setError(undefined);
    if (!looksLikeLinkCode(codeInput)) {
      setError(t('garmin.badCode'));
      return;
    }
    await setLinkCode(codeInput);
    setCodeInput('');
  }

  async function handleDisconnect() {
    if (!linkCode) return;
    try {
      await disconnect(linkCode);
    } catch {
      // disconnect() already clears locally in its finally block.
      await clearLinkCode();
    }
  }

  async function handleImport() {
    if (!linkCode) return;
    setError(undefined);
    setProgress({ done: 0, total: 0 });
    try {
      const activities = await listActivities(linkCode, from, to);
      if (activities.length === 0) {
        setProgress(undefined);
        setError(t('garmin.noneFound'));
        return;
      }

      const candidates: ImportCandidate[] = [];
      for (const [i, a] of activities.entries()) {
        setProgress({ done: i, total: activities.length });
        try {
          const xml = await fetchActivityTcx(linkCode, a.activityId);
          // Same filename convention the helper writes, so dedupe and the
          // batch review behave identically whichever route the file took.
          candidates.push(parseImportCandidate(`garmin-${a.activityId}.tcx`, xml));
        } catch (e) {
          // One activity failing must not lose the rest of the batch.
          candidates.push({
            fileName: `garmin-${a.activityId}.tcx`,
            status: 'error',
            error: e instanceof GarminLinkError ? e.message : String(e),
            externalId: a.activityId,
          });
        }
      }

      onCandidates(await markDuplicates(candidates));
      setProgress(undefined);
    } catch (e) {
      setProgress(undefined);
      const known = e instanceof GarminLinkError;
      void logEvent('error', 'garmin.import.failed', known ? e.code : 'unknown');
      setError(known ? e.message : t('garmin.failed'));
    }
  }

  const busy = progress !== undefined;

  return (
    <section className="rounded-xl border p-4">
      <h3 className="font-medium">{t('garmin.title')}</h3>

      {!linkCode ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">{t('garmin.connectHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="fc_…"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
              aria-label={t('garmin.codeLabel')}
            />
            <button
              type="button"
              onClick={() => void handleConnect()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t('garmin.connect')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-muted-foreground">{t('garmin.from')}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                dir="ltr"
                className="rounded-md border px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-muted-foreground">{t('garmin.to')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                dir="ltr"
                className="rounded-md border px-2 py-1.5"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? t('garmin.fetching', {
                    done: progress.done + 1,
                    total: Math.max(progress.total, 1),
                  })
                : t('garmin.fetch')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="text-xs text-muted-foreground underline"
          >
            {t('garmin.disconnect')}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
