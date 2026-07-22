import { useEffect, useState } from 'react';
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
    if (
      !window.confirm(
        `Delete profile "${profile.name}" and ALL of its runs, plans, and chat history? This cannot be undone.`,
      )
    ) {
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
        <h1 className="text-xl font-semibold">Hi {unlocking.name}</h1>
        <label className="block">
          <span className="mb-1 block text-sm">Enter your PIN</span>
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
        {pinError && <p className="text-sm text-destructive">Wrong PIN.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleUnlock()} className={primaryBtn}>
            Unlock
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
            Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">FAIN Coach</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who's running?</p>
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
                className="flex-1 rounded-lg border p-3 text-left font-medium hover:bg-accent"
              >
                {profile.name}
                {profile.pinHash && (
                  <span className="ml-2 text-xs text-muted-foreground">🔒</span>
                )}
              </button>
              <button
                type="button"
                aria-label={`Delete profile ${profile.name}`}
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
            <span className="mb-1 block text-sm">Name</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              PIN <span className="text-muted-foreground">(optional)</span>
            </span>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              A PIN deters casual access on a shared device. It does not
              encrypt your data.
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={() => void handleCreate()}
              className={primaryBtn}
            >
              Create profile
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
        >
          + New profile
        </button>
      )}
    </main>
  );
}
