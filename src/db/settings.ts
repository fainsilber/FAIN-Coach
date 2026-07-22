import { db } from './db';

export const SETTING_KEYS = {
  apiKey: 'openrouterApiKey',
  fastModel: 'fastModel',
  reasoningModel: 'reasoningModel',
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
