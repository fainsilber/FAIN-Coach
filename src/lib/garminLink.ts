import { db } from '@/db/db';

/**
 * Client for the Garmin import Worker (dev plan §15.1 stage B).
 *
 * The Worker holds the Garmin tokens; this holds only a *link code* — a bearer
 * credential for our own Worker, minted when the user ran the export helper.
 *
 * **Where the link code lives, and why.** In the `settings` table, which is
 * listed in `unsyncedTables` and excluded from backup export — exactly the
 * treatment the OpenRouter API key gets. That satisfies FR-9.7's "never in
 * synced data": the Garmin tokens themselves never reach the browser at all,
 * and the code that stands in for them never leaves the device it was pasted
 * into.
 */

const LINK_CODE_KEY = 'garminLinkCode';

/** Base URL of the Worker, or null when this build has none. Folds to a
 * build-time constant, so the request paths below become provably dead code in
 * a build without a Worker (verified: no `/api/garmin` string survives in the
 * Pages bundle). */
export const GARMIN_WORKER_URL: string | null = __GARMIN_WORKER_URL__;

export function isGarminImportAvailable(): boolean {
  return __GARMIN_WORKER_URL__ !== null;
}

export async function getLinkCode(): Promise<string | undefined> {
  const row = await db.settings.get(LINK_CODE_KEY);
  return row?.value || undefined;
}

export async function setLinkCode(code: string): Promise<void> {
  await db.settings.put({ key: LINK_CODE_KEY, value: code.trim() });
}

export async function clearLinkCode(): Promise<void> {
  await db.settings.delete(LINK_CODE_KEY);
}

/** A link code as printed by the helper. Checked before spending a request. */
export function looksLikeLinkCode(value: string): boolean {
  return /^fc_[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export interface GarminActivity {
  activityId: string;
  startTimeLocal: string;
  activityName: string;
  typeKey: string;
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * A Worker/Garmin failure the UI can explain, rather than a bare throw.
 * `code` mirrors the Worker's error codes so callers can special-case
 * reconnect-required and rate-limited without matching on prose.
 */
export class GarminLinkError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GarminLinkError';
  }
}

async function call(path: string, linkCode: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${GARMIN_WORKER_URL ?? ''}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${linkCode}` },
  });
  if (res.ok) return res;

  let code = 'garmin_error';
  let message = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error) code = body.error;
    if (body.message) message = body.message;
  } catch {
    // Non-JSON error body — keep the generic message.
  }
  throw new GarminLinkError(code, message);
}

export async function listActivities(
  linkCode: string,
  from: string,
  to: string,
): Promise<GarminActivity[]> {
  const res = await call(
    `/api/garmin/activities?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    linkCode,
  );
  const body = (await res.json()) as { activities?: GarminActivity[] };
  return body.activities ?? [];
}

/** The activity's original TCX, as text ready for `parseTcx`. */
export async function fetchActivityTcx(
  linkCode: string,
  activityId: string,
): Promise<string> {
  const res = await call(`/api/garmin/activity/${activityId}.tcx`, linkCode);
  return res.text();
}

/** Revoke the link (FR-9.6). Already-imported runs are untouched. */
export async function disconnect(linkCode: string): Promise<void> {
  try {
    await call('/api/garmin/link', linkCode, { method: 'DELETE' });
  } finally {
    // Forget it locally even if the Worker call failed — leaving a code the
    // user believes is revoked would be worse than a stale KV entry.
    await clearLinkCode();
  }
}
