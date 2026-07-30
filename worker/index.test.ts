import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
import { linkKeyFor, type GarminTokens } from './garminTokens';
import type { KVNamespace } from './workers';

function jwtWithExp(exp: number): string {
  return `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;
}

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 86_400;
const ALREADY_EXPIRED = Math.floor(Date.now() / 1000) - 60;

function tokens(exp = FAR_FUTURE): GarminTokens {
  return {
    di_token: jwtWithExp(exp),
    di_refresh_token: 'refresh-abc',
    di_client_id: 'GARMIN_ANDROID',
  };
}

function fakeKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (async (key: string, type: string) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    }) as KVNamespace['get'],
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  };
}

let env: Env & { GARMIN_LINKS: ReturnType<typeof fakeKV> };
let garmin: ReturnType<typeof vi.fn>;

beforeEach(() => {
  env = { GARMIN_LINKS: fakeKV() };
  garmin = vi.fn();
  vi.stubGlobal('fetch', garmin);
});

afterEach(() => vi.unstubAllGlobals());

const req = (path: string, init?: RequestInit) =>
  new Request(`https://coach.example${path}`, init);

/** The URL of a stubbed fetch call — the Worker passes a Request for the
 * refresh and a plain URL string for data calls. */
const calledUrl = (index: number): string => {
  const arg = garmin.mock.calls[index][0];
  return arg instanceof Request ? arg.url : String(arg);
};

/** Create a link the way the helper does, returning its code. */
async function makeLink(exp = FAR_FUTURE): Promise<string> {
  const res = await worker.fetch(
    req('/api/garmin/link', { method: 'POST', body: JSON.stringify({ tokens: tokens(exp) }) }),
    env,
  );
  return ((await res.json()) as { linkCode: string }).linkCode;
}

const auth = (code: string) => ({ Authorization: `Bearer ${code}` });

describe('POST /api/garmin/link', () => {
  it('returns a link code and stores tokens under its HASH, never the code', async () => {
    const code = await makeLink();
    expect(code).toMatch(/^fc_/);
    expect(env.GARMIN_LINKS.store.has(code)).toBe(false);
    expect(env.GARMIN_LINKS.store.has(await linkKeyFor(code))).toBe(true);
  });

  it('rejects a malformed token blob rather than storing junk', async () => {
    const res = await worker.fetch(
      req('/api/garmin/link', { method: 'POST', body: JSON.stringify({ tokens: { nope: 1 } }) }),
      env,
    );
    expect(res.status).toBe(400);
    expect(env.GARMIN_LINKS.store.size).toBe(0);
  });

  it('rejects a non-JSON body', async () => {
    const res = await worker.fetch(
      req('/api/garmin/link', { method: 'POST', body: 'not json' }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('authentication', () => {
  it('refuses a request with no link code', async () => {
    const res = await worker.fetch(req('/api/garmin/activities?from=2026-01-01&to=2026-02-01'), env);
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe('no_link');
  });

  it('refuses an unrecognised link code', async () => {
    const res = await worker.fetch(
      req('/api/garmin/activities?from=2026-01-01&to=2026-02-01', { headers: auth('fc_bogus') }),
      env,
    );
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe('unknown_link');
  });
});

describe('GET /api/garmin/activities', () => {
  it('narrows Garmin JSON and keeps only runs by default', async () => {
    const code = await makeLink();
    garmin.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { activityId: 1, activityType: { typeKey: 'running' }, distance: 5000, duration: 1500, startTimeLocal: '2026-07-01 08:00:00', activityName: 'Morning' },
          { activityId: 2, activityType: { typeKey: 'cycling' }, distance: 20000, duration: 3600, startTimeLocal: '2026-07-02 08:00:00', activityName: 'Ride' },
          { activityId: 3, activityType: { typeKey: 'treadmill_running' }, distance: 8000, duration: 2400, startTimeLocal: '2026-07-03 08:00:00', activityName: 'Base' },
        ]),
        { status: 200 },
      ),
    );

    const res = await worker.fetch(
      req('/api/garmin/activities?from=2026-07-01&to=2026-07-31', { headers: auth(code) }),
      env,
    );
    expect(res.status).toBe(200);
    const { activities } = (await res.json()) as any;
    expect(activities.map((a: any) => a.activityId)).toEqual(['1', '3']);
    expect(activities[0].distanceMeters).toBe(5000);
    // The date range must actually reach Garmin.
    expect(calledUrl(0)).toContain('startDate=2026-07-01');
  });

  it('includes non-runs when asked', async () => {
    const code = await makeLink();
    garmin.mockResolvedValueOnce(
      new Response(JSON.stringify([{ activityId: 2, activityType: { typeKey: 'cycling' } }]), { status: 200 }),
    );
    const res = await worker.fetch(
      req('/api/garmin/activities?from=2026-07-01&to=2026-07-31&all=1', { headers: auth(code) }),
      env,
    );
    expect(((await res.json()) as any).activities).toHaveLength(1);
  });

  it('requires both ends of the date range', async () => {
    const code = await makeLink();
    const res = await worker.fetch(req('/api/garmin/activities?from=2026-07-01', { headers: auth(code) }), env);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/garmin/activity/<id>.tcx', () => {
  it('streams the TCX straight through', async () => {
    const code = await makeLink();
    garmin.mockResolvedValueOnce(new Response('<TrainingCenterDatabase/>', { status: 200 }));
    const res = await worker.fetch(req('/api/garmin/activity/998877.tcx', { headers: auth(code) }), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<TrainingCenterDatabase/>');
    expect(calledUrl(0)).toContain('/download-service/export/tcx/activity/998877');
  });
});

describe('Garmin failure states are recoverable, not crashes (FR-9.8)', () => {
  it('maps 429 to a rate-limit response the UI can explain', async () => {
    const code = await makeLink();
    garmin.mockResolvedValueOnce(new Response('slow down', { status: 429 }));
    const res = await worker.fetch(req('/api/garmin/activity/1.tcx', { headers: auth(code) }), env);
    expect(res.status).toBe(429);
    expect((await res.json() as any).error).toBe('garmin_rate_limited');
  });

  it('maps a rejected session to 401 telling the user to reconnect', async () => {
    const code = await makeLink();
    garmin.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const res = await worker.fetch(req('/api/garmin/activity/1.tcx', { headers: auth(code) }), env);
    expect(res.status).toBe(401);
    expect((await res.json() as any).message).toMatch(/reconnect/i);
  });
});

describe('token refresh', () => {
  it('refreshes an expiring token and PERSISTS the new one', async () => {
    const code = await makeLink(ALREADY_EXPIRED);
    garmin
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: jwtWithExp(FAR_FUTURE), refresh_token: 'rotated' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const res = await worker.fetch(
      req('/api/garmin/activities?from=2026-07-01&to=2026-07-31', { headers: auth(code) }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calledUrl(0)).toContain('diauth.garmin.com');

    const stored = JSON.parse(env.GARMIN_LINKS.store.get(await linkKeyFor(code))!);
    expect(stored.tokens.di_refresh_token).toBe('rotated');
    expect(stored.tokens.di_token).not.toBe(jwtWithExp(ALREADY_EXPIRED));
  });

  it('does not destroy a working link when refresh fails transiently', async () => {
    const code = await makeLink(ALREADY_EXPIRED);
    garmin.mockResolvedValueOnce(new Response('upstream down', { status: 500 }));

    const res = await worker.fetch(
      req('/api/garmin/activities?from=2026-07-01&to=2026-07-31', { headers: auth(code) }),
      env,
    );
    expect(res.status).toBe(502);
    // The link must survive so a later retry can succeed.
    expect(env.GARMIN_LINKS.store.has(await linkKeyFor(code))).toBe(true);
  });

  it('skips the refresh call entirely when the token is still fresh', async () => {
    const code = await makeLink(FAR_FUTURE);
    garmin.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await worker.fetch(req('/api/garmin/activities?from=2026-07-01&to=2026-07-31', { headers: auth(code) }), env);
    expect(calledUrl(0)).toContain('connectapi.garmin.com');
  });
});

describe('DELETE /api/garmin/link (FR-9.6)', () => {
  it('revokes the link so it stops working', async () => {
    const code = await makeLink();
    const del = await worker.fetch(req('/api/garmin/link', { method: 'DELETE', headers: auth(code) }), env);
    expect(del.status).toBe(200);
    expect(env.GARMIN_LINKS.store.size).toBe(0);

    const after = await worker.fetch(
      req('/api/garmin/activities?from=2026-07-01&to=2026-07-31', { headers: auth(code) }),
      env,
    );
    expect(after.status).toBe(401);
  });
});

describe('deployment safety', () => {
  it('says so plainly when no KV namespace is bound', async () => {
    const res = await worker.fetch(req('/api/garmin/link', { method: 'POST', body: '{}' }), {});
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('not_configured');
  });

  it('hands every non-/api request to static assets, untouched', async () => {
    const assets = { fetch: vi.fn().mockResolvedValue(new Response('index.html')) };
    const res = await worker.fetch(req('/history'), { ...env, ASSETS: assets });
    expect(await res.text()).toBe('index.html');
    expect(assets.fetch).toHaveBeenCalledOnce();
    // Garmin must not be touched for an ordinary page load.
    expect(garmin).not.toHaveBeenCalled();
  });

  it('answers CORS preflight without needing a link', async () => {
    const res = await worker.fetch(req('/api/garmin/link', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });
});
