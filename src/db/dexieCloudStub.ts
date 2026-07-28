/**
 * Stand-in for `dexie-cloud-addon` in local-only builds (Sprint 11).
 *
 * `vite.config.ts` aliases the real package to this file whenever
 * `VITE_DEXIE_CLOUD_URL` is unset. Without the alias the addon ships in every
 * bundle — measured at ~240 kB raw / ~78 kB gzip — even though the free tier
 * can never reach the code path that uses it. Rollup cannot tree-shake it on
 * its own: a Dexie addon mutates the Dexie prototype at import time, which is
 * exactly the kind of module-level side effect that defeats tree-shaking.
 *
 * Nothing should ever call this. `FainCoachCloudDB` is only constructed when
 * `CLOUD_DATABASE_URL` is set, and in a build where that is set, the real
 * addon is aliased in and this file is not part of the graph at all. Throwing
 * rather than silently no-op'ing means a wiring mistake surfaces immediately
 * instead of producing a database that looks fine and never syncs.
 */
export default function dexieCloudAddonUnavailable(): never {
  throw new Error(
    'dexie-cloud-addon is not included in this build. Rebuild with ' +
      'VITE_DEXIE_CLOUD_URL set to enable cloud sync (see docs/dexie-cloud-setup.md).',
  );
}
