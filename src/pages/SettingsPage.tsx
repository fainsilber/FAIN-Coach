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
import { LANGUAGES, isLanguage, useI18n } from '@/i18n';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
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
      granted ? t('settings.persistGranted') : t('settings.persistDeclined'),
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
    setStatus(t('settings.saved'));
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
      const counts = t('settings.importCounts', {
        runs: envelope.tables.runs.length,
        plans: envelope.tables.trainingPlans.length,
        messages: envelope.tables.chatMessages.length,
      });
      if (
        !window.confirm(
          t('settings.importConfirm', {
            date: envelope.exportedAt.slice(0, 10),
            counts,
          }),
        )
      ) {
        return;
      }
      await importBackup(envelope);
      setStatus(t('settings.imported'));
      setTimeout(() => setStatus(undefined), 2500);
    } catch (e) {
      setImportError(
        e instanceof BackupError ? e.message : t('settings.importFailed'),
      );
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('settings.title')}</h2>
        {status && <p className="mt-1 text-sm text-muted-foreground">{status}</p>}
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">{t('settings.preferences')}</h3>

        <label className="block">
          <span className="mb-1 block text-sm">{t('settings.language')}</span>
          <select
            value={language}
            onChange={(e) => {
              // Applies immediately — no Save needed for language.
              if (isLanguage(e.target.value)) void setLanguage(e.target.value);
            }}
            className={inputClass}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">{t('settings.units')}</span>
          <select
            value={unitSystem}
            onChange={(e) => setUnitSystem(e.target.value as UnitSystem)}
            className={inputClass}
          >
            <option value="metric">{t('settings.unitsMetric')}</option>
            <option value="imperial">{t('settings.unitsImperial')}</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t('settings.unitsHint')}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">{t('settings.weekStart')}</span>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value as WeekStart)}
            className={inputClass}
          >
            <option value="sunday">{t('settings.sunday')}</option>
            <option value="monday">{t('settings.monday')}</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t('settings.weekStartHint')}
          </span>
        </label>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">{t('settings.aiSection')}</h3>
        <label className="block">
          <span className="mb-1 block text-sm">{t('settings.apiKey')}</span>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-…"
              autoComplete="off"
              dir="ltr"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border px-3 text-sm"
            >
              {showKey ? t('settings.hide') : t('settings.show')}
            </button>
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t('settings.apiKeyHint')}
          </span>
        </label>

        <ModelSelect
          label={t('settings.chatModel')}
          hint={t('settings.chatModelHint')}
          groups={CHAT_MODEL_GROUPS}
          value={fastModel}
          defaultModel={DEFAULT_FAST_MODEL}
          onChange={setFastModel}
        />

        <ModelSelect
          label={t('settings.planModel')}
          hint={t('settings.planModelHint')}
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
          {t('settings.save')}
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{t('settings.data')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.dataDesc')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            {t('settings.export')}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            {t('settings.import')}
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
          <h3 className="font-medium">{t('settings.storage')}</h3>
          <p className="text-sm text-muted-foreground">
            <bdi>
              {t('settings.storageLine', {
                usage: storage.usageMB,
                quota: storage.quotaMB,
              })}
            </bdi>{' '}
            ·{' '}
            {storage.persisted
              ? t('settings.protected')
              : t('settings.notProtected')}
          </p>
          {!storage.persisted && (
            <button
              type="button"
              onClick={() => void handleRequestPersist()}
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              {t('settings.requestPersist')}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium text-destructive">{t('settings.danger')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.dangerDesc')}</p>
        <button
          type="button"
          onClick={() => void handleWipe()}
          className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive"
        >
          {t('settings.wipe')}
        </button>
      </div>
    </section>
  );

  async function handleWipe() {
    if (window.confirm(t('settings.wipeExportPrompt'))) {
      await handleExport();
    }
    if (!window.confirm(t('settings.wipeConfirm'))) {
      return;
    }
    await wipeAllData();
    setStatus(t('settings.wiped'));
    setTimeout(() => setStatus(undefined), 2500);
  }
}
