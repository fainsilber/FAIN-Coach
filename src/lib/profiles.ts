import Dexie from 'dexie';

// Local device profiles — data SEPARATION for shared devices, not security.
// Each profile owns its own IndexedDB database; the optional PIN is a hashed
// gate against casual access, but anyone with device access can read any
// profile's data via DevTools. Real per-user security is the documented
// Dexie Cloud upgrade path (see docs/dev-plan.md §7).

export interface Profile {
  id: string;
  name: string;
  dbName: string;
  createdAt: string;
  pinSalt?: string;
  pinHash?: string;
}

const PROFILES_KEY = 'fain-coach.profiles';
const ACTIVE_KEY = 'fain-coach.activeProfileId';

/** The pre-profiles database name; the first profile adopts it so existing
 * data survives the upgrade. */
export const LEGACY_DB_NAME = 'FainCoachDB';

export function listProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Profile[]) : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveProfile(): Profile | undefined {
  const id = localStorage.getItem(ACTIVE_KEY);
  if (!id) return undefined;
  return listProfiles().find((p) => p.id === id);
}

export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function clearActiveProfile(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createProfile(
  name: string,
  pin?: string,
): Promise<Profile> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Profile name is required');
  const id = crypto.randomUUID().slice(0, 8);
  const profile: Profile = {
    id,
    name: trimmed,
    dbName: `FainCoachDB-${id}`,
    createdAt: new Date().toISOString(),
  };
  if (pin) {
    profile.pinSalt = crypto.randomUUID();
    profile.pinHash = await sha256Hex(profile.pinSalt + pin);
  }
  saveProfiles([...listProfiles(), profile]);
  return profile;
}

export async function verifyPin(
  profile: Profile,
  pin: string,
): Promise<boolean> {
  if (!profile.pinHash || !profile.pinSalt) return true; // no PIN set
  return (await sha256Hex(profile.pinSalt + pin)) === profile.pinHash;
}

/** Removes the profile from the registry and deletes its database. */
export async function deleteProfile(id: string): Promise<void> {
  const profile = listProfiles().find((p) => p.id === id);
  if (!profile) return;
  saveProfiles(listProfiles().filter((p) => p.id !== id));
  if (localStorage.getItem(ACTIVE_KEY) === id) clearActiveProfile();
  await Dexie.delete(profile.dbName);
}

/** One-time upgrade: if no profiles exist but the legacy single-user database
 * does, wrap it in a "Default" profile so existing data stays reachable. */
export async function adoptLegacyDatabase(): Promise<Profile | undefined> {
  if (listProfiles().length > 0) return undefined;
  if (!('databases' in indexedDB)) return undefined;
  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === LEGACY_DB_NAME)) return undefined;
  const profile: Profile = {
    id: 'default',
    name: 'Default',
    dbName: LEGACY_DB_NAME,
    createdAt: new Date().toISOString(),
  };
  saveProfiles([profile]);
  return profile;
}
