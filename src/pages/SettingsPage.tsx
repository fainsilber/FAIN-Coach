import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, requestPersistentStorage } from '@/db/db';
import { SETTING_KEYS, setSetting } from '@/db/settings';
import {
  exportBackup,
  importBackup,
  parseBackup,
  wipeAllData,
  BackupError,
} from '@/lib/backup';
import { DEFAULT_FAST_MODEL, DEFAULT_PLAN_MODEL } from '@/llm/openrouter';
import { ModelSelect } from '@/components/ModelSelect';
import { CHAT_MODEL_GROUPS, PLAN_MODEL_GROUPS } from '@/llm/models';
import { DEFAULT_UNIT_SYSTEM, type UnitSystem } from '@/lib/units';
import { DEFAULT_WEEK_START, type WeekStart } from '@/lib/week';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';

export function SettingsPage() {
  const settings = useLiveQuery(async () => {
    const rows = await db.settings.toArray();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fastModel, setFastModel] = useState('');
  const [reasoningModel, setReasoningModel] = useState('');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(DEFAULT_UNIT_SYSTEM);
  const [weekStart, setWeekStart] = useState<WeekStart>(DEFAULT_WEEK_START);
  const [status, setStatus] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{
    usageMB: string;
    quotaMB: string;
    persisted: boolean;
  }>();
  const loaded = settings !== undefined;

  useEffect(() => {
    void (async () => {
      if (!navigator.storage?.estimate) return;
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted?.() ?? Promise.resolve(false),
      ]);
      setStorage({
        usageMB: ((estimate.usage ?? 0) / 1048576).toFixed(1),
        quotaMB: ((estimate.quota ?? 0) / 1048576).toFixed(0),
        persisted,
      });
    })();
  }, []);

  async function handleRequestPersist() {
    const granted = await requestPersistentStorage();
    setStorage((s) => (s ? { ...s, persisted: granted } : s));
    setStatus(
      granted
        ? 'Persistent storage granted.'
        : 'The browser declined for now — it usually grants this after the app is installed or used more.',
    );
    setTimeout(() => setStatus(undefined), 4000);
  }

  // Prefill the form once the DB read resolves.
  useEffect(() => {
    if (settings === undefined) return;
    setApiKey(settings[SETTING_KEYS.apiKey] ?? '');
    setFastModel(settings[SETTING_KEYS.fastModel] ?? '');
    setReasoningModel(settings[SETTING_KEYS.reasoningModel] ?? '');
    setUnitSystem(
      settings[SETTING_KEYS.unitSystem] === 'imperial'
        ? 'imperial'
        : DEFAULT_UNIT_SYSTEM,
    );
    setWeekStart(
      settings[SETTING_KEYS.weekStart] === 'monday'
        ? 'monday'
        : DEFAULT_WEEK_START,
    );
  }, [loaded]);

  if (!loaded) return null;

  async function handleSave() {
    await setSetting(SETTING_KEYS.apiKey, apiKey.trim());
    await setSetting(SETTING_KEYS.fastModel, fastModel.trim());
    await setSetting(SETTING_KEYS.reasoningModel, reasoningModel.trim());
    await setSetting(SETTING_KEYS.unitSystem, unitSystem);
    await setSetting(SETTING_KEYS.weekStart, weekStart);
    setStatus('Settings saved.');
    setTimeout(() => setStatus(undefined), 2500);
  }

  async function handleExport() {
    const envelope = await exportBackup();
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fain-coach-backup-${envelope.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setImportError(undefined);
    try {
      const envelope = parseBackup(await file.text());
      const counts = `${envelope.tables.runs.length} runs, ${envelope.tables.trainingPlans.length} plans, ${envelope.tables.chatMessages.length} chat messages`;
      if (
        !window.confirm(
          `Import backup from ${envelope.exportedAt.slice(0, 10)} (${counts})?\n\nThis REPLACES all data currently on this device.`,
        )
      ) {
        return;
      }
      await importBackup(envelope);
      setStatus('Backup imported.');
      setTimeout(() => setStatus(undefined), 2500);
    } catch (e) {
      setImportError(
        e instanceof BackupError ? e.message : 'Failed to import backup.',
      );
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        {status && <p className="mt-1 text-sm text-muted-foreground">{status}</p>}
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Preferences</h3>

        <label className="block">
          <span className="mb-1 block text-sm">Units</span>
          <select
            value={unitSystem}
            onChange={(e) => setUnitSystem(e.target.value as UnitSystem)}
            className={inputClass}
          >
            <option value="metric">Metric — kilometres, min/km</option>
            <option value="imperial">Imperial — miles, min/mile</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Changes how values are shown. Your runs are always stored in metres,
            so switching never alters your data or your backups.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Week starts on</span>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value as WeekStart)}
            className={inputClass}
          >
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Used to group your training plan into weeks.
          </span>
        </label>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">AI Coach (OpenRouter)</h3>
        <label className="block">
          <span className="mb-1 block text-sm">API key</span>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-…"
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border px-3 text-sm"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            Stored only in this browser. Sent only to openrouter.ai.
          </span>
        </label>

        <ModelSelect
          label="Chat model"
          hint="Used for post-run coaching."
          groups={CHAT_MODEL_GROUPS}
          value={fastModel}
          defaultModel={DEFAULT_FAST_MODEL}
          onChange={setFastModel}
        />

        <ModelSelect
          label="Plan model"
          hint="Used to generate training plans. Reasoning models produce the best plans but can take several minutes — instruct models finish in seconds and are more reliable on mobile."
          groups={PLAN_MODEL_GROUPS}
          value={reasoningModel}
          defaultModel={DEFAULT_PLAN_MODEL}
          onChange={setReasoningModel}
        />

        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Save settings
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Data</h3>
        <p className="text-sm text-muted-foreground">
          Backups contain the current profile's runs, plans, chat history,
          and settings (including your API key) as a JSON file.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Export backup
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Import backup…
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {importError && (
          <p className="text-sm text-destructive">{importError}</p>
        )}
      </div>

      {storage && (
        <div className="space-y-2">
          <h3 className="font-medium">Storage</h3>
          <p className="text-sm text-muted-foreground">
            Using {storage.usageMB} MB of {storage.quotaMB} MB available ·{' '}
            {storage.persisted
              ? 'protected from browser eviction'
              : 'not yet protected from browser eviction'}
          </p>
          {!storage.persisted && (
            <button
              type="button"
              onClick={() => void handleRequestPersist()}
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              Request persistent storage
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium text-destructive">Danger zone</h3>
        <p className="text-sm text-muted-foreground">
          Wipe removes this profile's runs, plans, chat history, and settings
          permanently.
        </p>
        <button
          type="button"
          onClick={() => void handleWipe()}
          className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive"
        >
          Wipe all data…
        </button>
      </div>
    </section>
  );

  async function handleWipe() {
    if (
      window.confirm(
        'Export a backup before wiping? (Recommended — this is your last chance.)',
      )
    ) {
      await handleExport();
    }
    if (
      !window.confirm(
        'Really delete ALL data for this profile — runs, plans, chat, and settings? This cannot be undone.',
      )
    ) {
      return;
    }
    await wipeAllData();
    setStatus('All data wiped.');
    setTimeout(() => setStatus(undefined), 2500);
  }
}
