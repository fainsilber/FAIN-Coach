import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GarminImport } from '@/components/GarminImport';
import { MatchConfirm } from '@/components/MatchConfirm';
import { PostRunForm, type PostRunDetails } from '@/components/PostRunForm';
import { StatGrid } from '@/components/StatGrid';
import type { PlannedWorkout } from '@/db/types';
import { localeOf, useI18n } from '@/i18n';
import { buildBatchImportMessage, buildCoachMessage } from '@/lib/coachMessage';
import { formatDistance, formatDuration, formatPace } from '@/lib/format';
import { logEvent } from '@/lib/log';
import { usePreferences } from '@/lib/usePreferences';
import { findMatchCandidate } from '@/lib/matching';
import {
  activePlanWorkouts,
  saveRunAndPromptCoach,
  saveRunsBatch,
  type BatchEntry,
} from '@/lib/saveRun';
import {
  markDuplicates,
  parseImportCandidate,
  type ImportCandidate,
} from '@/lib/providerImport';
import { cn } from '@/lib/utils';
import { parseTcx, TcxParseError, type ParsedRun } from '@/parser/tcx';

/** A batch row: a parsed candidate plus the UI state around it. */
interface BatchRow extends ImportCandidate {
  selected: boolean;
  match?: PlannedWorkout;
}

type UploadState =
  | { step: 'idle' }
  | {
      step: 'review';
      run: ParsedRun;
      fileName: string;
      match?: PlannedWorkout;
    }
  | { step: 'batch'; rows: BatchRow[] };

export function UploadPage() {
  const [state, setState] = useState<UploadState>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchReading, setBatchReading] = useState(0);
  const [matchAccepted, setMatchAccepted] = useState(true);
  const { unitSystem } = usePreferences();
  const { t, language } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    setError(undefined);
    if (!file.name.toLowerCase().endsWith('.tcx')) {
      setError(t('upload.notTcx', { name: file.name }));
      return;
    }
    try {
      const run = parseTcx(await file.text());
      // Auto-match against the active plan (confirmed by the user below).
      const match = findMatchCandidate(run, await activePlanWorkouts());
      setMatchAccepted(true);
      setState({ step: 'review', run, fileName: file.name, match });
    } catch (e) {
      void logEvent(
        'error',
        'tcx.parse.failed',
        `size=${file.size} ${e instanceof Error ? e.message : String(e)}`,
      );
      setError(
        e instanceof TcxParseError
          ? t('upload.parseFailed', { name: file.name, message: e.message })
          : t('upload.readFailed', { name: file.name }),
      );
    }
  }

  /**
   * Entry point for both the picker and drag-drop. One file keeps the original
   * single-run flow (review, match confirm, RPE/feel/notes) untouched; several
   * switch to batch review, where per-run subjective input makes no sense.
   */
  async function handleFiles(files: File[]) {
    setError(undefined);
    const tcx = files.filter((f) => f.name.toLowerCase().endsWith('.tcx'));
    if (tcx.length === 0) {
      setError(t('upload.notTcx', { name: files[0]?.name ?? '' }));
      return;
    }
    if (tcx.length === 1) {
      await handleFile(tcx[0]);
      return;
    }

    setBatchReading(tcx.length);
    try {
      const parsed = await Promise.all(
        tcx.map(async (f) => parseImportCandidate(f.name, await f.text())),
      );
      await showBatch(await markDuplicates(parsed));
    } finally {
      setBatchReading(0);
    }
  }

  /**
   * Turn parsed candidates into the batch review screen. Shared by file drop
   * and the Garmin Worker import, so both routes get identical review,
   * matching and dedupe — the provider is just a different way to obtain the
   * same TCX.
   */
  async function showBatch(candidates: ImportCandidate[], workouts?: PlannedWorkout[]) {
    // Auto-match consumes each workout as it is claimed — otherwise two runs a
    // day apart could both match the same planned session.
    const pool = workouts ?? (await activePlanWorkouts());
    const rows: BatchRow[] = candidates.map((c) => {
      const match = c.run ? findMatchCandidate(c.run, pool) : undefined;
      if (match) pool.splice(pool.indexOf(match), 1);
      return { ...c, selected: c.status === 'ready', ...(match && { match }) };
    });
    const failed = rows.filter((r) => r.status === 'error').length;
    if (failed > 0) void logEvent('warn', 'import.batch.partial', `failed=${failed}`);
    setState({ step: 'batch', rows });
  }

  async function handleBatchSave() {
    if (state.step !== 'batch') return;
    const chosen = state.rows.filter((r) => r.selected && r.status === 'ready' && r.run);
    if (chosen.length === 0) return;

    setSaving(true);
    try {
      const entries: BatchEntry[] = chosen.map((r) => ({
        // An externalId means the file came from the export helper and can be
        // recognised on re-import; without one it is an ordinary hand-exported
        // file, so it keeps the 'tcx' source.
        run: {
          ...r.run!,
          ...(r.externalId
            ? { source: 'garmin' as const, externalId: r.externalId }
            : { source: 'tcx' as const }),
        },
        ...(r.match && { linkedWorkout: r.match }),
      }));

      const dates = chosen.map((r) => r.run!.date).sort();
      const fmt = (iso: string) =>
        new Date(iso).toLocaleDateString(localeOf(language));
      await saveRunsBatch({
        entries,
        coachMessage: buildBatchImportMessage({
          count: entries.length,
          rangeLabel: `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`,
          t,
        }),
      });
      navigate('/chat', { state: { pendingReply: true } });
    } catch {
      setError(t('upload.batchFailed'));
      setSaving(false);
    }
  }

  async function handleSave(details: PostRunDetails) {
    if (state.step !== 'review') return;
    setSaving(true);
    try {
      const run = { ...state.run, ...details, source: 'tcx' as const };
      const linkedWorkout = matchAccepted ? state.match : undefined;
      await saveRunAndPromptCoach({
        run,
        linkedWorkout,
        coachMessage: buildCoachMessage({ run, linkedWorkout, unitSystem, t }),
      });
      navigate('/chat', { state: { pendingReply: true } });
    } catch {
      setError(t('upload.saveFailed'));
      setSaving(false);
    }
  }

  function toggleRow(index: number) {
    setState((s) =>
      s.step === 'batch'
        ? {
            ...s,
            rows: s.rows.map((r, i) =>
              i === index && r.status === 'ready' ? { ...r, selected: !r.selected } : r,
            ),
          }
        : s,
    );
  }

  function toggleAll(next: boolean) {
    setState((s) =>
      s.step === 'batch'
        ? {
            ...s,
            rows: s.rows.map((r) =>
              r.status === 'ready' ? { ...r, selected: next } : r,
            ),
          }
        : s,
    );
  }

  if (state.step === 'batch') {
    const { rows } = state;
    const importable = rows.filter((r) => r.status === 'ready');
    const selected = importable.filter((r) => r.selected);

    return (
      <section className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-xl font-semibold">
            {t('upload.batchTitle', { count: importable.length })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('upload.batchSubtitle')}
          </p>
        </div>

        {importable.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.length === importable.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            {t('upload.batchSelectAll')}
          </label>
        )}

        <ul className="divide-y rounded-lg border">
          {rows.map((row, i) => (
            <li
              key={`${row.fileName}-${i}`}
              className="flex items-start gap-3 p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={row.selected}
                disabled={row.status !== 'ready'}
                onChange={() => toggleRow(i)}
                aria-label={row.fileName}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <bdi>{row.fileName}</bdi>
                </p>
                {row.run && (
                  <p className="text-muted-foreground" dir="ltr">
                    {new Date(row.run.date).toLocaleDateString(localeOf(language))} ·{' '}
                    {formatDistance(row.run.totalDistanceMeters, unitSystem)} ·{' '}
                    {formatDuration(row.run.totalDurationSeconds)}
                  </p>
                )}
                {row.status === 'duplicate' && (
                  <p className="text-muted-foreground">
                    {t('upload.batchStatusDuplicate')}
                  </p>
                )}
                {row.status === 'error' && (
                  <p className="text-destructive">
                    {t('upload.batchStatusError')} — <bdi>{row.error}</bdi>
                  </p>
                )}
                {row.match && (
                  <p className="text-muted-foreground">
                    {t('upload.batchMatched')}: <bdi>{row.match.description}</bdi>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          {t('upload.batchNoSubjective')}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void handleBatchSave()}
            disabled={selected.length === 0 || saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {selected.length === 0
              ? t('upload.batchNothing')
              : selected.length === 1
                ? t('upload.batchImportOne')
                : t('upload.batchImport', { count: selected.length })}
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => setState({ step: 'idle' })}
          >
            {t('upload.discard')}
          </button>
        </div>
      </section>
    );
  }

  if (state.step === 'review') {
    const { run, fileName } = state;
    const stats: Array<[string, string]> = [
      [t('stat.distance'), formatDistance(run.totalDistanceMeters, unitSystem)],
      [t('stat.time'), formatDuration(run.totalDurationSeconds)],
      [
        t('stat.pace'),
        formatPace(run.totalDistanceMeters, run.totalDurationSeconds, unitSystem),
      ],
      [t('stat.laps'), String(run.laps.length)],
    ];
    if (run.avgHeartRate !== undefined)
      stats.push([t('stat.avgHr'), `${run.avgHeartRate} bpm`]);
    if (run.maxHeartRate !== undefined)
      stats.push([t('stat.maxHr'), `${run.maxHeartRate} bpm`]);
    if (run.avgCadence !== undefined)
      stats.push([t('stat.cadence'), `${run.avgCadence} spm`]);
    if (run.avgPower !== undefined)
      stats.push([t('stat.power'), `${run.avgPower} W`]);

    return (
      <section className="mx-auto max-w-xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{t('upload.reviewTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <bdi>{fileName}</bdi> ·{' '}
            <bdi>{new Date(run.date).toLocaleString(localeOf(language))}</bdi>
          </p>
        </div>
        <StatGrid stats={stats} />
        {state.match && (
          <MatchConfirm
            match={state.match}
            accepted={matchAccepted}
            onChange={setMatchAccepted}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <PostRunForm onSave={handleSave} saving={saving} />
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => setState({ step: 'idle' })}
        >
          {t('upload.discard')}
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">{t('upload.title')}</h2>
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) void handleFiles(files);
        }}
        className={cn(
          'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center',
          dragging ? 'border-primary bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <p className="font-medium">
          {batchReading > 0
            ? t('upload.batchReading', { count: batchReading })
            : t('upload.dropHere')}
        </p>
        <p className="text-sm text-muted-foreground">{t('upload.tapToChoose')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tcx"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void handleFiles(files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <GarminImport onCandidates={(c) => void showBatch(c)} />
      <Link
        to="/upload/manual"
        className="block text-center text-sm text-muted-foreground underline"
      >
        {t('manual.link')}
      </Link>
      <p className="text-xs text-muted-foreground">{t('upload.privacyNote')}</p>
    </section>
  );
}
