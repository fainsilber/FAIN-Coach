import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostRunForm, type PostRunDetails } from '@/components/PostRunForm';
import { StatGrid } from '@/components/StatGrid';
import { db, requestPersistentStorage } from '@/db/db';
import type { PlannedWorkout } from '@/db/types';
import { formatDuration, formatKm, formatPace } from '@/lib/format';
import { findMatchCandidate } from '@/lib/matching';
import { cn } from '@/lib/utils';
import { parseTcx, TcxParseError, type ParsedRun } from '@/parser/tcx';
import { summarizeRun } from '@/prompts/prompts';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    setError(undefined);
    if (!file.name.toLowerCase().endsWith('.tcx')) {
      setError(`"${file.name}" is not a .tcx file.`);
      return;
    }
    try {
      const run = parseTcx(await file.text());
      // Auto-match against the active plan (confirmed by the user below).
      const plan = await db.trainingPlans.where('status').equals('active').first();
      const workouts =
        plan?.id !== undefined
          ? await db.plannedWorkouts.where('planId').equals(plan.id).toArray()
          : [];
      const match = findMatchCandidate(run, workouts);
      setMatchAccepted(true);
      setState({ step: 'review', run, fileName: file.name, match });
    } catch (e) {
      setError(
        e instanceof TcxParseError
          ? `Could not parse ${file.name}: ${e.message}`
          : `Unexpected error reading ${file.name}.`,
      );
    }
  }

  async function handleSave(details: PostRunDetails) {
    if (state.step !== 'review') return;
    setSaving(true);
    try {
      const linked = state.match !== undefined && matchAccepted;
      const record = {
        ...state.run,
        ...details,
        ...(linked
          ? {
              plannedWorkoutId: state.match!.id,
              matchStatus: 'confirmed' as const,
            }
          : { matchStatus: 'unplanned' as const }),
      };
      await db.runs.add(record);
      if (linked) {
        await db.plannedWorkouts.update(state.match!.id!, {
          status: 'completed',
        });
      }
      void requestPersistentStorage(); // FR-2.2, fire-and-forget
      // Hand the run to the coach: inject the macro summary as a user message
      // and let ChatPage request the coached response.
      const planNote = linked
        ? `\n\nThis was my planned workout: "${state.match!.description}"`
        : '';
      await db.chatMessages.add({
        timestamp: new Date().toISOString(),
        role: 'user',
        content: `I just finished a run.\n\n${summarizeRun(record)}${planNote}\n\nWhat do you make of it, and what should I do next?`,
      });
      navigate('/chat', { state: { pendingReply: true } });
    } catch {
      setError('Failed to save the run to local storage.');
      setSaving(false);
    }
  }

  if (state.step === 'review') {
    const { run, fileName } = state;
    const stats: Array<[string, string]> = [
      ['Distance', formatKm(run.totalDistanceMeters)],
      ['Time', formatDuration(run.totalDurationSeconds)],
      ['Pace', formatPace(run.totalDistanceMeters, run.totalDurationSeconds)],
      ['Laps', String(run.laps.length)],
    ];
    if (run.avgHeartRate !== undefined)
      stats.push(['Avg HR', `${run.avgHeartRate} bpm`]);
    if (run.maxHeartRate !== undefined)
      stats.push(['Max HR', `${run.maxHeartRate} bpm`]);
    if (run.avgCadence !== undefined)
      stats.push(['Cadence', `${run.avgCadence} spm`]);
    if (run.avgPower !== undefined) stats.push(['Power', `${run.avgPower} W`]);

    return (
      <section className="mx-auto max-w-xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">How was this run?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName} · {new Date(run.date).toLocaleString()}
          </p>
        </div>
        <StatGrid stats={stats} />
        {state.match && (
          <div className="rounded-lg border border-primary/40 p-3">
            <p className="text-sm">
              Looks like your planned <strong>{state.match.type}</strong> for{' '}
              {new Date(`${state.match.date}T12:00:00Z`).toLocaleDateString(
                undefined,
                { weekday: 'long' },
              )}
              : “{state.match.description}” — was it?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                aria-pressed={matchAccepted}
                onClick={() => setMatchAccepted(true)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm',
                  matchAccepted && 'bg-primary text-primary-foreground',
                )}
              >
                Yes, that's it
              </button>
              <button
                type="button"
                aria-pressed={!matchAccepted}
                onClick={() => setMatchAccepted(false)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm',
                  !matchAccepted && 'bg-primary text-primary-foreground',
                )}
              >
                No, unplanned run
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <PostRunForm onSave={handleSave} saving={saving} />
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => setState({ step: 'idle' })}
        >
          Discard and choose another file
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Upload Run</h2>
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
        <p className="font-medium">Drop a .tcx file here</p>
        <p className="text-sm text-muted-foreground">
          or tap to choose a file exported from your watch
        </p>
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
      <p className="text-xs text-muted-foreground">
        Parsing happens entirely in your browser — the file never leaves this
        device.
      </p>
    </section>
  );
}
