import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MatchConfirm } from '@/components/MatchConfirm';
import { PostRunForm, type PostRunDetails } from '@/components/PostRunForm';
import { StatGrid } from '@/components/StatGrid';
import type { PlannedWorkout } from '@/db/types';
import { localeOf, useI18n } from '@/i18n';
import { buildCoachMessage } from '@/lib/coachMessage';
import { formatDistance, formatDuration, formatPace } from '@/lib/format';
import { usePreferences } from '@/lib/usePreferences';
import { findMatchCandidate } from '@/lib/matching';
import { activePlanWorkouts, saveRunAndPromptCoach } from '@/lib/saveRun';
import { cn } from '@/lib/utils';
import { parseTcx, TcxParseError, type ParsedRun } from '@/parser/tcx';

type UploadState =
  | { step: 'idle' }
  | {
      step: 'review';
      run: ParsedRun;
      fileName: string;
      match?: PlannedWorkout;
    };

export function UploadPage() {
  const [state, setState] = useState<UploadState>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setError(
        e instanceof TcxParseError
          ? t('upload.parseFailed', { name: file.name, message: e.message })
          : t('upload.readFailed', { name: file.name }),
      );
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
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center',
          dragging ? 'border-primary bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <p className="font-medium">{t('upload.dropHere')}</p>
        <p className="text-sm text-muted-foreground">{t('upload.tapToChoose')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tcx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
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
