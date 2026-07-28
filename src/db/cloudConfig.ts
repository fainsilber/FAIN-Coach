// Sprint 11 — Dexie Cloud configuration (dev plan §12.2).
//
// The database URL is a BUILD-TIME value, not a user setting: it identifies
// which Dexie Cloud instance this deployment talks to, the same way the deploy
// base path does. It is not a secret — the CLI's `dexie-cloud.key` file is the
// secret, and that never reaches the client (see docs/dexie-cloud-setup.md).
//
// When it is absent, EVERYTHING here is inert and the app runs exactly as it
// did before Sprint 11: a purely local Dexie database, no addon, no network,
// no account. That is the free tier's guarantee, and it is enforced by
// construction rather than by a runtime flag someone could flip by accident.

/**
 * Set from `VITE_DEXIE_CLOUD_URL` at build time, injected as a literal via
 * `define` in vite.config.ts (see the note there on why `define` and not
 * `import.meta.env`). `null` in a local-only build.
 */
const RAW_URL: string | null = __CLOUD_DATABASE_URL__;

/**
 * A Dexie Cloud database URL looks like `https://z1a2b3c4d.dexie.cloud`.
 * Validating the shape here turns a typo'd env var into an obvious no-cloud
 * build rather than a runtime failure deep inside the addon on first sync.
 */
function validateCloudUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const ok =
      parsed.protocol === 'https:' && parsed.hostname.endsWith('.dexie.cloud');
    if (!ok) {
      console.error(
        `[FAIN Coach] VITE_DEXIE_CLOUD_URL is not a Dexie Cloud URL: ${url}. ` +
          'Expected https://<id>.dexie.cloud — running fully local instead.',
      );
      return undefined;
    }
    return url;
  } catch {
    console.error(
      `[FAIN Coach] VITE_DEXIE_CLOUD_URL is not a valid URL: ${url}. ` +
        'Running fully local instead.',
    );
    return undefined;
  }
}

/**
 * Deliberately written as a ternary directly on the env value rather than
 * through a helper taking `string | undefined`. Vite replaces
 * `import.meta.env.VITE_DEXIE_CLOUD_URL` with a literal at build time, so in a
 * build without it this whole expression folds to `undefined` — which lets
 * Rollup prove the cloud branch in db.ts is dead and drop `dexie-cloud-addon`
 * from the bundle entirely. Wrapping the env read in a function that accepts
 * `undefined` defeats that folding and costs free-tier users ~240 kB of addon
 * they can never use.
 */
export const CLOUD_DATABASE_URL: string | undefined = RAW_URL
  ? validateCloudUrl(RAW_URL)
  : undefined;

/** Whether this build can talk to a cloud database at all. */
export function isCloudBuild(): boolean {
  return CLOUD_DATABASE_URL !== undefined;
}

/**
 * Tables that must NEVER leave the device, passed to the addon as
 * `unsyncedTables`.
 *
 * - `settings` holds the OpenRouter API key. Syncing it would push a
 *   user's key through the sync service to every device on the account —
 *   explicitly forbidden (dev plan §12.2, PRD FR-9.7 in spirit). The whole
 *   table is excluded rather than just the key row, because a row-level
 *   exclusion is one refactor away from leaking.
 * - `logs` is the diagnostics log, already excluded from backups (FR-8.10)
 *   for the same privacy reason; syncing it would reintroduce exactly what
 *   that exclusion prevents.
 */
export const UNSYNCED_TABLES = ['settings', 'logs'] as const;
