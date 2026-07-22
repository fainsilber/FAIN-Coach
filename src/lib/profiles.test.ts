import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  adoptLegacyDatabase,
  clearActiveProfile,
  createProfile,
  deleteProfile,
  getActiveProfile,
  listProfiles,
  setActiveProfile,
  verifyPin,
} from './profiles';

beforeEach(() => {
  localStorage.clear();
});

describe('profile registry', () => {
  it('creates profiles with distinct databases', async () => {
    const a = await createProfile('Jonathan');
    const b = await createProfile('Guest');
    expect(a.dbName).not.toBe(b.dbName);
    expect(listProfiles().map((p) => p.name)).toEqual(['Jonathan', 'Guest']);
  });

  it('rejects empty names', async () => {
    await expect(createProfile('   ')).rejects.toThrow(/name is required/);
  });

  it('tracks the active profile', async () => {
    const p = await createProfile('Jonathan');
    expect(getActiveProfile()).toBeUndefined();
    setActiveProfile(p.id);
    expect(getActiveProfile()?.name).toBe('Jonathan');
    clearActiveProfile();
    expect(getActiveProfile()).toBeUndefined();
  });

  it('deletes a profile and deactivates it if active', async () => {
    const p = await createProfile('Temp');
    setActiveProfile(p.id);
    await deleteProfile(p.id);
    expect(listProfiles()).toHaveLength(0);
    expect(getActiveProfile()).toBeUndefined();
  });

  it('survives corrupted registry JSON', () => {
    localStorage.setItem('fain-coach.profiles', '{not json');
    expect(listProfiles()).toEqual([]);
  });
});

describe('PIN', () => {
  it('stores only a salted hash and verifies correctly', async () => {
    const p = await createProfile('Locked', '1234');
    expect(p.pinHash).toBeDefined();
    expect(p.pinHash).not.toContain('1234');
    expect(await verifyPin(p, '1234')).toBe(true);
    expect(await verifyPin(p, '9999')).toBe(false);
  });

  it('accepts any input when no PIN is set', async () => {
    const p = await createProfile('Open');
    expect(await verifyPin(p, 'anything')).toBe(true);
  });

  it('salts hashes — same PIN, different hashes', async () => {
    const a = await createProfile('A', '1234');
    const b = await createProfile('B', '1234');
    expect(a.pinHash).not.toBe(b.pinHash);
  });
});

describe('legacy database adoption', () => {
  it('adopts the legacy DB into a Default profile when present', async () => {
    // fake-indexeddb: create the legacy database so it shows up in databases()
    const req = indexedDB.open('FainCoachDB', 1);
    await new Promise((res) => {
      req.onupgradeneeded = () => req.result.createObjectStore('runs');
      req.onsuccess = () => {
        req.result.close();
        res(undefined);
      };
    });

    const adopted = await adoptLegacyDatabase();
    expect(adopted?.name).toBe('Default');
    expect(adopted?.dbName).toBe('FainCoachDB');
    expect(listProfiles()).toHaveLength(1);
  });

  it('does nothing when profiles already exist', async () => {
    await createProfile('Existing');
    expect(await adoptLegacyDatabase()).toBeUndefined();
    expect(listProfiles()).toHaveLength(1);
  });
});
