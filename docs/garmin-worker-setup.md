# Garmin import Worker — setup (Sprint 15 stage B)

> **Status: code is written and tested; the deployment step is yours.** The
> Worker, the app UI, and the helper's `--link` mode all ship in the repo. What
> is missing is a KV namespace and a `wrangler.jsonc`, both of which need your
> Cloudflare account.
>
> **Nothing is broken until you do this.** With no `wrangler.jsonc` in the repo,
> Cloudflare keeps auto-generating its static-assets-only config and the app
> deploys exactly as it does today. The app hides the Garmin panel when the
> build has no Worker URL, so users never see a half-working feature.

## What this buys

Stage A (shipped in v1.9.0) needs you to run a script and drag files in. With
the Worker, that becomes: run the helper **once** to connect, then import any
date range from inside the app — including from your phone.

## What it does not do

**Your Garmin password never reaches the Worker.** Only tokens your own machine
minted. That is the whole reason for the split: Garmin's *login* needs Python +
curl_cffi (CAPTCHA, MFA, TLS impersonation, 429 retries) and cannot run on a
Worker, while everything after it — listing, downloading, refreshing — is a
plain bearer-token HTTPS call that a Worker does fine. Measured 2026-07-31.

---

## 1. Create the KV namespace

From the repo root:

```bash
npx wrangler kv namespace create GARMIN_LINKS
```

It prints an `id`. That id is an **identifier, not a secret** — the same
reasoning as the Dexie Cloud URL already committed in `vite.config.ts`. Access
needs your Cloudflare credentials, not knowledge of the id.

## 2. Create `wrangler.jsonc`

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

Paste the id from step 1 over `PASTE_THE_KV_NAMESPACE_ID_HERE`.

`wrangler.jsonc` is currently **gitignored**, because Cloudflare's Git
integration deploys whatever config it finds — a committed config naming a
namespace that doesn't exist would fail every deploy. Once yours is real and
deploys cleanly, remove the `wrangler.jsonc` line from `.gitignore` and commit
it, so the Worker deploys from CI like everything else.

> This repo has been bitten before by a config file that broke the Cloudflare
> deploy outright (the `public/_redirects` incident — see the long note in
> `vite.config.ts`). Deploy once manually before committing the config.

## 3. Deploy

```bash
npx wrangler deploy
```

Check that the app still serves normally — the Worker hands every non-`/api/`
request straight to the assets binding, so nothing about the app's own delivery
changes:

```bash
curl -sI https://coach.fainsilber.co.il/ | head -3
```

And that the API is alive (401 is the *correct* answer without a link code):

```bash
curl -s https://coach.fainsilber.co.il/api/garmin/activities?from=2026-01-01&to=2026-01-31
```

## 4. Connect your Garmin account

```bash
python tools/garmin-export/garmin_export.py --link https://coach.fainsilber.co.il
```

It signs in locally (password via `getpass`, never sent anywhere), hands the
Worker only the resulting tokens, and prints a **link code**. Paste that into
FAIN Coach → **Upload** → *Import from Garmin*.

Treat the link code like a password: anyone holding it can read your Garmin
activities through the Worker. **Disconnect** in the app revokes it on the
Worker, not just locally.

For anyone else connecting their own account — a family member, a friend —
send them [docs/connect-garmin.md](connect-garmin.md) instead of this file. It
walks the same step with no assumed background, covers Windows/macOS/Linux,
and the `--profile` flag for sharing one computer.

---

## How it fits together

| Piece | Where it runs | Holds |
|---|---|---|
| `tools/garmin-export/` | your machine | your password (momentarily), then tokens |
| Worker `/api/garmin/*` | Cloudflare | Garmin tokens, in KV under a **hash** of the link code |
| The app | your browser | only the link code, in the **unsynced** `settings` table |

The Garmin tokens never reach the browser, and the link code never reaches
sync or a backup — it gets the same treatment as the OpenRouter API key
(FR-9.7).

## Local development

```bash
npx wrangler dev --port 8787 --local
```
```bash
npm run dev:garmin
```

`dev:garmin` points the app at `http://127.0.0.1:8787`. `wrangler dev --local`
uses an in-memory KV, so nothing touches your Cloudflare account. You can mint
a test link without a Garmin account at all:

```bash
curl -s -X POST http://127.0.0.1:8787/api/garmin/link -H 'Content-Type: application/json' -d '{"tokens":{"di_token":"fake.token.here","di_refresh_token":"r","di_client_id":"GARMIN_ANDROID"}}'
```

Fetching then reaches the real Garmin, is rejected, and the app shows its
reconnect message — which is exactly how the error path was verified.

## When it breaks

Garmin changes this API without notice; that is the standing risk of the
unofficial route (PRD FR-9.9). Expected failure states, all recoverable:

| The app says | Meaning |
|---|---|
| *Garmin rejected the stored session* | Tokens expired or were revoked. Re-run `--link`. |
| *Garmin is rate limiting this account* | Real and measured — wait a few minutes (FR-9.8). |
| *…has no GARMIN_LINKS KV namespace bound* | Step 1/2 not done, or the binding name differs. |
