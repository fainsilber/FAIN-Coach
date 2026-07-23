import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { en, type MessageKey } from './en';
import { he } from './he';

// Adding a language = one catalog file + one entry here. Nothing else changes.
export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'he', label: 'עברית', dir: 'rtl' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

const catalogs: Record<Language, Record<MessageKey, string>> = { en, he };

export const LANGUAGE_SETTING_KEY = 'language';
const DEVICE_LANGUAGE_KEY = 'fain-coach.language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

export function dirOf(language: Language): 'ltr' | 'rtl' {
  return LANGUAGES.find((l) => l.code === language)?.dir ?? 'ltr';
}

/** Date-formatting locale for the language. */
export function localeOf(language: Language): string {
  return language === 'he' ? 'he-IL' : 'en-GB';
}

/**
 * Device-level language: last explicit choice, else browser preference, else
 * English. This is what the PROFILE PICKER uses — it renders before any
 * profile (and its settings) is active.
 */
export function detectLanguage(): Language {
  const stored = localStorage.getItem(DEVICE_LANGUAGE_KEY);
  if (isLanguage(stored)) return stored;
  for (const pref of navigator.languages ?? []) {
    const base = pref.slice(0, 2).toLowerCase();
    if (base === 'he' || base === 'iw') return 'he'; // 'iw' = legacy Hebrew tag
    if (isLanguage(base)) return base;
  }
  return 'en';
}

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translateFor(language: Language): Translate {
  return (key, params) =>
    // he is typed complete; the ?? en is a runtime belt against future drift.
    interpolate(catalogs[language][key] ?? catalogs.en[key], params);
}

interface I18nContextValue {
  language: Language;
  dir: 'ltr' | 'rtl';
  t: Translate;
  setLanguage: (language: Language) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  // Profile setting wins once a profile's DB is readable (FR-5.5).
  const profileLanguage = useLiveQuery(
    async () => (await db.settings.get(LANGUAGE_SETTING_KEY))?.value,
  );
  useEffect(() => {
    if (isLanguage(profileLanguage)) setLanguageState(profileLanguage);
  }, [profileLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dirOf(language);
    localStorage.setItem(DEVICE_LANGUAGE_KEY, language);
  }, [language]);

  const setLanguage = useCallback(async (next: Language) => {
    setLanguageState(next);
    // Persist per profile (rides along in backups); the effect above keeps
    // the device-level fallback in sync for the profile picker.
    await db.settings.put({ key: LANGUAGE_SETTING_KEY, value: next });
  }, []);

  const t = useCallback<Translate>(
    (key, params) => translateFor(language)(key, params),
    [language],
  );

  return (
    <I18nContext.Provider
      value={{ language, dir: dirOf(language), t, setLanguage }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function useT(): Translate {
  return useI18n().t;
}
