import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import {
  adoptLegacyDatabase,
  createProfile,
  deleteProfile,
  listProfiles,
  setActiveProfile,
  verifyPin,
  type Profile,
} from '@/lib/profiles';

function enter(profile: Profile) {
  setActiveProfile(profile.id);
  // The db singleton binds to the profile's database at module load,
  // so entering a profile is always a full reload.
  window.location.reload();
}

export function ProfileGate() {
  const t = useT();
  const [profiles, setProfiles] = useState<Profile[]>();
  const [unlocking, setUnlocking] = useState<Profile>();
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');

  useEffect(() => {
    void adoptLegacyDatabase().then(() => setProfiles(listProfiles()));
  }, []);

  if (profiles === undefined) return null;

  async function handleUnlock() {
    if (!unlocking) return;
    if (await verifyPin(unlocking, pinEntry)) {
      enter(unlocking);
    } else {
      setPinError(true);
      setPinEntry('');
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const profile = await createProfile(newName, newPin || undefined);
    enter(profile);
  }

  async function handleDelete(profile: Profile) {
    if (!window.confirm(t('gate.deleteConfirm', { name: profile.name }))) {
      return;
    }
    await deleteProfile(profile.id);
    setProfiles(listProfiles());
  }

  const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';
  const primaryBtn =
    'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50';

  if (unlocking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">
          {t('gate.hi', { name: unlocking.name })}
        </h1>
        <label className="block">
          <span className="mb-1 block text-sm">{t('gate.enterPin')}</span>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinEntry}
            onChange={(e) => {
              setPinEntry(e.target.value);
              setPinError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUnlock();
            }}
            className={inputClass}
          />
        </label>
        {pinError && (
          <p className="text-sm text-destructive">{t('gate.wrongPin')}</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleUnlock()} className={primaryBtn}>
            {t('gate.unlock')}
          </button>
          <button
            type="button"
            onClick={() => {
              setUnlocking(undefined);
              setPinEntry('');
              setPinError(false);
            }}
            className="rounded-md border px-4 py-2 text-sm"
          >
            {t('gate.back')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">FAIN Coach</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('gate.whosRunning')}
        </p>
      </div>

      {profiles.length > 0 && (
        <ul className="space-y-2">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  profile.pinHash ? setUnlocking(profile) : enter(profile)
                }
                className="flex-1 rounded-lg border p-3 text-start font-medium hover:bg-accent"
              >
                {profile.name}
                {profile.pinHash && (
                  <span className="ms-2 text-xs text-muted-foreground">🔒</span>
                )}
              </button>
              <button
                type="button"
                aria-label={t('gate.deleteAria', { name: profile.name })}
                onClick={() => void handleDelete(profile)}
                className="rounded-md border px-3 py-3 text-sm text-muted-foreground hover:text-destructive"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="space-y-3 rounded-lg border p-4">
          <label className="block">
            <span className="mb-1 block text-sm">{t('gate.name')}</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              {t('gate.pin')}{' '}
              <span className="text-muted-foreground">{t('gate.optional')}</span>
            </span>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t('gate.pinHint')}
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={() => void handleCreate()}
              className={primaryBtn}
            >
              {t('gate.create')}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              {t('gate.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
        >
          {t('gate.newProfile')}
        </button>
      )}
    </main>
  );
}
