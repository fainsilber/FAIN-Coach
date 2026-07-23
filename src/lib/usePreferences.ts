import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { toPreferences, type Preferences } from '@/db/settings';
import { DEFAULT_UNIT_SYSTEM } from './units';
import { DEFAULT_WEEK_START } from './week';

const FALLBACK: Preferences = {
  unitSystem: DEFAULT_UNIT_SYSTEM,
  weekStart: DEFAULT_WEEK_START,
};

/**
 * Live per-profile display preferences. Returns defaults during the initial
 * DB read so nothing has to render a loading state for a formatting concern.
 */
export function usePreferences(): Preferences {
  return (
    useLiveQuery(async () => toPreferences(await db.settings.toArray())) ??
    FALLBACK
  );
}
