import { DEFAULT_UNIT_SYSTEM, type UnitSystem } from '@/lib/units';
import { DEFAULT_WEEK_START, type WeekStart } from '@/lib/week';
import { db } from './db';

export const SETTING_KEYS = {
  apiKey: 'openrouterApiKey',
  fastModel: 'fastModel',
  // Storage key kept as "reasoningModel" for backward compatibility with
  // profiles saved before plans defaulted to an instruct model.
  reasoningModel: 'reasoningModel',
  unitSystem: 'unitSystem',
  weekStart: 'weekStart',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  if (value) {
    await db.settings.put({ key, value });
  } else {
    await db.settings.delete(key);
  }
}

/** Preferences with defaults applied — the shape the rest of the app consumes. */
export interface Preferences {
  unitSystem: UnitSystem;
  weekStart: WeekStart;
}

export function toPreferences(rows: Array<{ key: string; value: string }>): Preferences {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    unitSystem:
      get(SETTING_KEYS.unitSystem) === 'imperial' ? 'imperial' : DEFAULT_UNIT_SYSTEM,
    weekStart:
      get(SETTING_KEYS.weekStart) === 'monday' ? 'monday' : DEFAULT_WEEK_START,
  };
}

export async function getPreferences(): Promise<Preferences> {
  return toPreferences(await db.settings.toArray());
}
