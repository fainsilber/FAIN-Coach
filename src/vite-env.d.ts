/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Build identity, injected via `define` in vite.config.ts (dev plan §14.2).
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_TIME__: string;

// Dexie Cloud database URL (Sprint 11), or null in a local-only build.
// Injected via `define` rather than read from `import.meta.env` so it becomes
// a literal Rollup can constant-fold — see src/db/cloudConfig.ts.
declare const __CLOUD_DATABASE_URL__: string | null;

// Garmin import Worker base URL (Sprint 15 stage B): '' for same-origin, or
// null when the deployment has no Worker and the feature is compiled out.
declare const __GARMIN_WORKER_URL__: string | null;
