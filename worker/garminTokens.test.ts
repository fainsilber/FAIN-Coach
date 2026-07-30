import { describe, expect, it } from 'vitest';
import {
  applyRefreshResponse,
  basicAuthHeader,
  buildRefreshRequest,
  generateLinkCode,
  isGarminTokens,
  isRunning,
  linkKeyFor,
  needsRefresh,
  toActivitySummary,
  tokenExpiry,
  type GarminTokens,
} from './garminTokens';

/** Builds a JWT-shaped string with the given exp. Signature is irrelevant —
 * we only ever read the claim, never trust it. */
function jwtWithExp(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replace(/=+$/, '');
  return `header.${payload}.signature`;
}

const tokens: GarminTokens = {
  di_token: jwtWithExp(2_000_000_000),
  di_refresh_token: 'refresh-abc',
  di_client_id: 'GARMIN_ANDROID',
};

describe('isGarminTokens', () => {
  it('accepts exactly the shape python-garminconnect writes', () => {
    expect(isGarminTokens(tokens)).toBe(true);
  });

  it('rejects anything missing or blank', () => {
    expect(isGarminTokens(null)).toBe(false);
    expect(isGarminTokens({})).toBe(false);
    expect(isGarminTokens({ ...tokens, di_refresh_token: '' })).toBe(false);
    expect(isGarminTokens({ ...tokens, di_client_id: undefined })).toBe(false);
  });
});

describe('tokenExpiry / needsRefresh', () => {
  it('reads exp out of the payload', () => {
    expect(tokenExpiry(jwtWithExp(1_700_000_000))).toBe(1_700_000_000);
  });

  it('refreshes inside the 15-minute margin, not before', () => {
    const exp = 1_000_000;
    expect(needsRefresh(jwtWithExp(exp), exp - 500)).toBe(true); // 8m20s left
    expect(needsRefresh(jwtWithExp(exp), exp - 899)).toBe(true); // just inside
    expect(needsRefresh(jwtWithExp(exp), exp - 901)).toBe(false); // just outside
    expect(needsRefresh(jwtWithExp(exp), exp - 1800)).toBe(false); // 30m left
  });

  it('treats an already-expired token as needing refresh', () => {
    expect(needsRefresh(jwtWithExp(1000), 5000)).toBe(true);
  });

  it('does NOT refresh an unreadable token', () => {
    // We can't tell, so let Garmin judge rather than burn a refresh per request.
    expect(needsRefresh('not-a-jwt')).toBe(false);
    expect(tokenExpiry('not-a-jwt')).toBeUndefined();
    expect(tokenExpiry('a.!!!not-base64!!!.c')).toBeUndefined();
  });
});

describe('buildRefreshRequest', () => {
  it('posts the grant Garmin expects, with the client id as basic auth', async () => {
    const req = buildRefreshRequest(tokens);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://diauth.garmin.com/di-oauth2-service/oauth/token');
    expect(req.headers.get('Authorization')).toBe(basicAuthHeader('GARMIN_ANDROID'));
    expect(req.headers.get('Content-Type')).toContain('application/x-www-form-urlencoded');
    const body = new URLSearchParams(await req.text());
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-abc');
  });

  it('encodes the client id with an empty password', () => {
    expect(basicAuthHeader('abc')).toBe(`Basic ${btoa('abc:')}`);
  });
});

describe('applyRefreshResponse', () => {
  it('takes the new access token', () => {
    const next = applyRefreshResponse(tokens, { access_token: 'new-access' });
    expect(next.di_token).toBe('new-access');
  });

  it('KEEPS the old refresh token when Garmin omits one', () => {
    // Garmin does not always rotate it. Dropping it would silently un-link the
    // account on the next refresh.
    const next = applyRefreshResponse(tokens, { access_token: 'new-access' });
    expect(next.di_refresh_token).toBe('refresh-abc');
  });

  it('takes a rotated refresh token when one is sent', () => {
    const next = applyRefreshResponse(tokens, {
      access_token: 'new-access',
      refresh_token: 'rotated',
    });
    expect(next.di_refresh_token).toBe('rotated');
  });

  it('throws rather than storing a tokenless response', () => {
    expect(() => applyRefreshResponse(tokens, {})).toThrow(/access_token/);
    expect(() => applyRefreshResponse(tokens, { access_token: '' })).toThrow();
  });
});

describe('link codes', () => {
  it('are unique and URL-safe, so a paste survives intact', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateLinkCode()));
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^fc_[A-Za-z0-9_-]+$/);
  });

  it('are never themselves the KV key', async () => {
    // A KV listing must not hand out working credentials.
    const code = generateLinkCode();
    const key = await linkKeyFor(code);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(code);
  });

  it('hash deterministically, so a link resolves on every request', async () => {
    const code = generateLinkCode();
    expect(await linkKeyFor(code)).toBe(await linkKeyFor(code));
  });
});

describe('toActivitySummary', () => {
  const raw = {
    activityId: 23754217618,
    startTimeLocal: '2026-07-27 20:53:51',
    activityName: 'Running',
    activityType: { typeKey: 'running' },
    distance: 6758.88,
    duration: 2504.381,
    someOtherGarminField: 'ignored',
  };

  it('narrows Garmin JSON to the fields the app needs', () => {
    expect(toActivitySummary(raw)).toEqual({
      activityId: '23754217618',
      startTimeLocal: '2026-07-27 20:53:51',
      activityName: 'Running',
      typeKey: 'running',
      distanceMeters: 6758.88,
      durationSeconds: 2504.381,
    });
  });

  it('stringifies the id — provider ids are opaque, never numbers', () => {
    expect(toActivitySummary(raw)?.activityId).toBe('23754217618');
  });

  it('survives missing fields instead of throwing', () => {
    const summary = toActivitySummary({ activityId: 7 });
    expect(summary).toEqual({
      activityId: '7',
      startTimeLocal: '',
      activityName: '',
      typeKey: 'unknown',
      distanceMeters: 0,
      durationSeconds: 0,
    });
  });

  it('drops entries with no id at all', () => {
    expect(toActivitySummary({})).toBeUndefined();
    expect(toActivitySummary(null)).toBeUndefined();
  });

  it('recognises treadmill runs as runs', () => {
    expect(isRunning({ ...toActivitySummary(raw)!, typeKey: 'treadmill_running' })).toBe(true);
    expect(isRunning({ ...toActivitySummary(raw)!, typeKey: 'cycling' })).toBe(false);
  });
});
