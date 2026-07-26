// Build identity (PRD FR-8.1–8.2). These come from `define` in
// vite.config.ts — sourced from package.json and `git rev-parse`, never
// hand-maintained, so they can't silently go stale.
export const APP_VERSION = __APP_VERSION__;
export const GIT_SHA = __GIT_SHA__;
export const BUILD_TIME = __BUILD_TIME__;

/** "2026-07-23 14:22" — precise and locale-agnostic, for a bug report. */
export function formatBuildTime(iso: string = BUILD_TIME): string {
  return iso.slice(0, 16).replace('T', ' ');
}
