import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostRunForm, type PostRunDetails } from '@/components/PostRunForm';
import { db, requestPersistentStorage } from '@/db/db';
import { formatDuration, formatKm, formatPace } from '@/lib/format';
import { cn } from '@/lib/utils';
import { parseTcx, TcxParseError, type ParsedRun } from '@/parser/tcx';

type UploadState =
  | { step: 'idle' }
  | { step: 'review'; run: ParsedRun; fileName: string };

export function UploadPage() {
  const [state, setState] = useState<UploadState>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setState({ step: 'review', run, fileName: file.name });
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
      await db.runs.add({ ...state.run, ...details });
      void requestPersistentStorage(); // FR-2.2, fire-and-forget
      navigate('/');
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
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
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
