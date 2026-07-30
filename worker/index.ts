/**
 * FAIN Coach Worker — Garmin import proxy (dev plan §15.1 stage B).
 *
 * ## Why this exists
 *
 * Garmin's LOGIN needs Python + curl_cffi (CAPTCHA, MFA, TLS impersonation,
 * 429 retries) and cannot run here. But every call *after* login — listing
 * activities, downloading a TCX, refreshing the token — is a plain bearer-token
 * HTTPS request, measured working over ordinary TLS on 2026-07-31. So the split
 * is: the user mints tokens once on their own machine, and this Worker does the
 * routine work from then on.
 *
 * **The user's Garmin password never reaches this Worker.** Only the tokens
 * their own machine minted.
 *
 * ## Authentication
 *
 * A random *link code* returned when the helper uploads tokens. It is a bearer
 * credential, so KV is keyed by its SHA-256 rather than the code itself — a KV
 * listing must not yield working codes.
 *
 * Deliberately NOT tied to a Dexie Cloud identity: Dexie Cloud publishes no
 * documented way for a third-party server to verify one of its tokens, and
 * building on undocumented internals is how integrations rot. The side benefit
 * is that this works on the free tier too, which has no account at all.
 *
 * ## Everything else
 *
 * Non-`/api` requests fall through to the static assets binding, so adding this
 * Worker does not change how the app itself is served.
 */

import {
  applyRefreshResponse,
  buildRefreshRequest,
  CONNECT_API,
  generateLinkCode,
  isGarminTokens,
  isRunning,
  linkKeyFor,
  needsRefresh,
  toActivitySummary,
  type GarminTokens,
} from './garminTokens';
import type { Fetcher, KVNamespace } from './workers';

export interface Env {
  /** KV namespace holding link → Garmin tokens. See docs/garmin-worker-setup.md. */
  GARMIN_LINKS?: KVNamespace;
  /** Static assets binding, provided by Cloudflare's assets config. */
  ASSETS?: Fetcher;
}

interface StoredLink {
  tokens: GarminTokens;
  createdAt: string;
  label?: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return json({ error: code, message }, status);
}

/**
 * CORS. The app is served from the same origin in production, but the helper
 * posts from a script and local development runs on :5173, so preflight has to
 * work. Only the routes below are exposed, and every one of them still requires
 * the link code.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function bearer(request: Request): string | undefined {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

/** Load the link, refreshing and persisting the token when it is about to expire. */
async function loadLink(
  env: Env,
  linkCode: string,
): Promise<{ key: string; link: StoredLink } | undefined> {
  const kv = env.GARMIN_LINKS;
  if (!kv) return undefined;
  const key = await linkKeyFor(linkCode);
  const stored = await kv.get<StoredLink>(key, 'json');
  if (!stored || !isGarminTokens(stored.tokens)) return undefined;

  if (!needsRefresh(stored.tokens.di_token)) return { key, link: stored };

  const res = await fetch(buildRefreshRequest(stored.tokens));
  if (!res.ok) {
    // Leave the stored token alone — a transient refresh failure must not
    // destroy a working link. Garmin will reject the stale token and the
    // caller sees a clear 502.
    throw new GarminError(
      502,
      'garmin_refresh_failed',
      `Garmin refused to refresh the session (${res.status}). Re-run the helper with --link to reconnect.`,
    );
  }
  const refreshed = applyRefreshResponse(
    stored.tokens,
    (await res.json()) as Record<string, unknown>,
  );
  const link: StoredLink = { ...stored, tokens: refreshed };
  await kv.put(key, JSON.stringify(link));
  return { key, link };
}

class GarminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A GET against Garmin's API with the link's current bearer token. */
async function garminGet(tokens: GarminTokens, path: string): Promise<Response> {
  const res = await fetch(`${CONNECT_API}${path}`, {
    headers: {
      Authorization: `Bearer ${tokens.di_token}`,
      Accept: '*/*',
      'Di-Backend': 'connectapi.garmin.com',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new GarminError(
      401,
      'garmin_unauthorized',
      'Garmin rejected the stored session. Re-run the helper with --link to reconnect.',
    );
  }
  // 429 is a normal, recoverable state for this API rather than a bug (FR-9.8).
  if (res.status === 429) {
    throw new GarminError(
      429,
      'garmin_rate_limited',
      'Garmin is rate limiting this account right now. Wait a few minutes and try again.',
    );
  }
  if (!res.ok) {
    throw new GarminError(502, 'garmin_error', `Garmin returned ${res.status}.`);
  }
  return res;
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const kv = env.GARMIN_LINKS;
  if (!kv) {
    return errorResponse(
      503,
      'not_configured',
      'This deployment has no GARMIN_LINKS KV namespace bound. See docs/garmin-worker-setup.md.',
    );
  }

  // --- Link creation: the helper uploads tokens it minted locally. ----------
  if (url.pathname === '/api/garmin/link' && request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'bad_json', 'Body was not valid JSON.');
    }
    const { tokens, label } = (body ?? {}) as { tokens?: unknown; label?: unknown };
    if (!isGarminTokens(tokens)) {
      return errorResponse(
        400,
        'bad_tokens',
        'Expected { tokens: { di_token, di_refresh_token, di_client_id } }.',
      );
    }
    const linkCode = generateLinkCode();
    const stored: StoredLink = {
      tokens,
      createdAt: new Date().toISOString(),
      ...(typeof label === 'string' && label ? { label } : {}),
    };
    await kv.put(await linkKeyFor(linkCode), JSON.stringify(stored));
    return json({ linkCode });
  }

  // Everything below needs the link code.
  const code = bearer(request);
  if (!code) {
    return errorResponse(401, 'no_link', 'Missing link code.');
  }
  const found = await loadLink(env, code);
  if (!found) {
    return errorResponse(401, 'unknown_link', 'That link code is not recognised.');
  }
  const { key, link } = found;

  // --- Disconnect (FR-9.6): revoke here; imported runs stay in the app. -----
  if (url.pathname === '/api/garmin/link' && request.method === 'DELETE') {
    await kv.delete(key);
    return json({ disconnected: true });
  }

  // --- Activity list --------------------------------------------------------
  if (url.pathname === '/api/garmin/activities' && request.method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      return errorResponse(400, 'bad_range', 'Both from and to are required (YYYY-MM-DD).');
    }
    const res = await garminGet(
      link.tokens,
      `/activitylist-service/activities/search/activities?startDate=${encodeURIComponent(from)}&endDate=${encodeURIComponent(to)}&limit=200`,
    );
    const raw = (await res.json()) as unknown[];
    const all = (Array.isArray(raw) ? raw : [])
      .map(toActivitySummary)
      .filter((a): a is NonNullable<typeof a> => a !== undefined);
    const activities = url.searchParams.get('all') === '1' ? all : all.filter(isRunning);
    return json({ activities });
  }

  // --- TCX download ---------------------------------------------------------
  const tcxMatch = /^\/api\/garmin\/activity\/(\d+)\.tcx$/.exec(url.pathname);
  if (tcxMatch && request.method === 'GET') {
    const res = await garminGet(
      link.tokens,
      `/download-service/export/tcx/activity/${tcxMatch[1]}`,
    );
    return new Response(res.body, {
      headers: { 'content-type': 'application/vnd.garmin.tcx+xml' },
    });
  }

  return errorResponse(404, 'not_found', 'No such endpoint.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      // Not ours — hand back to static assets exactly as before this Worker
      // existed. If the binding is somehow absent, say so rather than 500.
      return (
        env.ASSETS?.fetch(request) ??
        new Response('No ASSETS binding configured.', { status: 500 })
      );
    }

    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const res = await handleApi(request, env, url);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      const known = e instanceof GarminError;
      return json(
        {
          error: known ? e.code : 'internal',
          message: known ? e.message : 'Unexpected error talking to Garmin.',
        },
        known ? e.status : 500,
        cors,
      );
    }
  },
};
