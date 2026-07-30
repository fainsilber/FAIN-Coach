/**
 * Garmin token handling for the Worker (dev plan §15.1 stage B).
 *
 * Everything here is pure and network-free so it can be unit-tested: the parts
 * that talk to Garmin live in index.ts. The split matters because the spike's
 * expensive lesson was that a test proving only internal self-consistency
 * proves nothing about an external contract — so these functions encode only
 * what we actually measured against Garmin, and nothing we assumed.
 *
 * Measured 2026-07-31, and the reason a Worker can do this at all:
 * `diauth.garmin.com` (refresh) and `connectapi.garmin.com` (data) both answer
 * plain TLS. Only Garmin's LOGIN needs curl_cffi impersonation, and login
 * happens on the user's own machine, never here.
 */

/** Exactly what `python-garminconnect`'s tokenstore holds — nothing more. */
export interface GarminTokens {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}

export const DI_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
export const CONNECT_API = 'https://connectapi.garmin.com';

/** Refresh this long before expiry, so a request never races the deadline. */
const EXPIRY_MARGIN_SECONDS = 900;

export function isGarminTokens(value: unknown): value is GarminTokens {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.di_token === 'string' &&
    t.di_token.length > 0 &&
    typeof t.di_refresh_token === 'string' &&
    t.di_refresh_token.length > 0 &&
    typeof t.di_client_id === 'string' &&
    t.di_client_id.length > 0
  );
}

/**
 * `exp` from a JWT payload, or undefined if the token isn't a readable JWT.
 *
 * This only *reads* the claim — it does not verify the signature, and must not
 * be used to decide anything security-relevant. Garmin verifies the token; all
 * we want to know is whether to refresh before spending a request finding out.
 */
export function tokenExpiry(jwt: string): number | undefined {
  const parts = jwt.split('.');
  if (parts.length < 2) return undefined;
  try {
    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether to refresh before using this token.
 *
 * An unreadable token returns **false**: we can't tell, so let Garmin be the
 * judge rather than burning a refresh on every single request.
 */
export function needsRefresh(jwt: string, nowSeconds = Date.now() / 1000): boolean {
  const exp = tokenExpiry(jwt);
  if (exp === undefined) return false;
  return nowSeconds > exp - EXPIRY_MARGIN_SECONDS;
}

/** Garmin's DI auth expects the client id as HTTP Basic with an empty password. */
export function basicAuthHeader(clientId: string): string {
  return `Basic ${btoa(`${clientId}:`)}`;
}

/** The refresh call, as a Request — built here so it can be asserted in tests. */
export function buildRefreshRequest(tokens: GarminTokens): Request {
  return new Request(DI_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(tokens.di_client_id),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: tokens.di_client_id,
      refresh_token: tokens.di_refresh_token,
    }),
  });
}

/**
 * Fold a refresh response into the stored tokens.
 *
 * Garmin does not always return a new refresh token; when it doesn't, the old
 * one stays valid and must be kept. Dropping it would silently un-link the
 * account on the next refresh.
 */
export function applyRefreshResponse(
  previous: GarminTokens,
  response: { access_token?: unknown; refresh_token?: unknown },
): GarminTokens {
  if (typeof response.access_token !== 'string' || !response.access_token) {
    throw new Error('Refresh response contained no access_token');
  }
  return {
    di_token: response.access_token,
    di_refresh_token:
      typeof response.refresh_token === 'string' && response.refresh_token
        ? response.refresh_token
        : previous.di_refresh_token,
    di_client_id: previous.di_client_id,
  };
}

/**
 * KV key for a link code: the SHA-256 of it, never the code itself.
 *
 * The link code is a bearer credential that ultimately reaches a Garmin
 * account, so a KV key listing must not hand over working codes.
 */
export async function linkKeyFor(linkCode: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(linkCode),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A fresh link code. 32 bytes of CSPRNG, URL-safe so it survives a paste. */
export function generateLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `fc_${btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`;
}

/** The one activity shape the app needs — everything else is dropped here, so
 * Garmin's response schema can't leak into the client. */
export interface GarminActivitySummary {
  activityId: string;
  startTimeLocal: string;
  activityName: string;
  typeKey: string;
  distanceMeters: number;
  durationSeconds: number;
}

export function toActivitySummary(raw: unknown): GarminActivitySummary | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const a = raw as Record<string, any>;
  if (a.activityId === undefined || a.activityId === null) return undefined;
  return {
    activityId: String(a.activityId),
    startTimeLocal: typeof a.startTimeLocal === 'string' ? a.startTimeLocal : '',
    activityName: typeof a.activityName === 'string' ? a.activityName : '',
    typeKey: a.activityType?.typeKey ?? 'unknown',
    distanceMeters: typeof a.distance === 'number' ? a.distance : 0,
    durationSeconds: typeof a.duration === 'number' ? a.duration : 0,
  };
}

/** Running only, unless the caller asks for everything. Mirrors the helper. */
export function isRunning(a: GarminActivitySummary): boolean {
  return a.typeKey.includes('running');
}
