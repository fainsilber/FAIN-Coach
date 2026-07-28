# Dexie Cloud — setup steps (Sprint 11)

Everything here is **yours to do** — it needs a Dexie Cloud account, and the
CLI writes a secret file that must never reach the repo. The app code is
already in place and does nothing until step 4 gives it a database URL.

**Time:** ~10 minutes. **Cost:** free tier is enough to start (confirm current
limits at <https://dexie.org/cloud/pricing> before relying on it — pricing is
one of the "verify" items in [monetization.md](monetization.md) §8).

Until you finish this, the app is exactly as it was: fully local, no accounts,
no network. Nothing breaks if you never do it.

---

## 1. Create the database

From the repo root:

```bash
npx dexie-cloud create
```

It will:
1. Prompt for your **email address**.
2. Email you a **one-time password** — paste it at the next prompt.
3. Create the database and print its URL, which looks like
   `https://z1a2b3c4d.dexie.cloud`.

It also writes two files into the repo root:

| File | Contains | Safe to commit? |
|---|---|---|
| `dexie-cloud.json` | your database URL | No — it's environment, not source |
| `dexie-cloud.key` | **client ID + secret** | **Never.** This is a credential. |

## 2. Confirm both files are gitignored

Already added to `.gitignore` in this repo, but verify before your next commit —
committing `dexie-cloud.key` would leak a credential that grants access to your
database:

```bash
git status --porcelain --ignored | grep dexie-cloud
```

You want to see both files listed as ignored (`!!`). If either shows as
untracked (`??`), **stop** and fix `.gitignore` before committing anything.

## 3. Whitelist the app origins

This is the step that is easy to miss and produces a confusing failure — the
app loads fine but every sync request is rejected. Dexie Cloud only accepts
requests from origins you explicitly allow.

FAIN Coach runs on three origins, so whitelist all three:

```bash
npx dexie-cloud whitelist http://localhost:5173
```
```bash
npx dexie-cloud whitelist https://fainsilber.github.io
```
```bash
npx dexie-cloud whitelist https://fain-coach.fainsilber.workers.dev
```

Check what's registered at any time with `npx dexie-cloud whitelist` (no
arguments). Origins must match `location.origin` exactly — scheme and port
included, no trailing slash and no path. `https://fainsilber.github.io/FAIN-Coach/`
is **not** a valid origin; the origin is just `https://fainsilber.github.io`.

## 4. Point the app at the database

The URL from step 1 goes in as a build-time variable. It is **not** a secret —
it only identifies which database to talk to; the `.key` file is what actually
grants access, and that never leaves your machine.

**Local development:**

```bash
VITE_DEXIE_CLOUD_URL=https://YOUR-ID.dexie.cloud npm run dev
```

**Cloudflare** — dashboard → your Worker → Settings → Variables & Secrets → add
a plain (non-secret) variable:

```
VITE_DEXIE_CLOUD_URL = https://YOUR-ID.dexie.cloud
```

**GitHub Pages** — add it to the build step in
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

```yaml
      - run: npm run build:pages
        env:
          VITE_DEXIE_CLOUD_URL: https://YOUR-ID.dexie.cloud
```

> **Deliberate:** with the variable unset, the build ships **no** cloud code at
> all — `dexie-cloud-addon` is aliased out entirely, saving ~240 kB. So you can
> enable cloud on one deployment and leave the other purely local if you want
> to trial it. See `vite.config.ts` and `src/db/dexieCloudStub.ts`.

## 5. Verify it took

Load the app and check the browser console:

- **No cloud** (variable unset): no Dexie Cloud requests at all in the Network
  tab. Correct for a local-only build.
- **Cloud active**: requests to `YOUR-ID.dexie.cloud`. A **403** here almost
  always means step 3 was missed or the origin doesn't match exactly.
- A console error starting `[FAIN Coach] VITE_DEXIE_CLOUD_URL is not…` means
  the URL is malformed; the app falls back to local rather than half-working.

---

## Useful commands

| Command | What it does |
|---|---|
| `npx dexie-cloud whitelist` | List allowed origins |
| `npx dexie-cloud whitelist <origin> --delete` | Remove an origin |
| `npx dexie-cloud export backup.zip` | Full database export |
| `npx dexie-cloud import backup.zip` | Import (additive — never deletes) |

Docs: <https://dexie.org/cloud/docs/cli> · <https://dexie.org/cloud/docs/db.cloud.configure()>

---

## What the app already does with this

Once the URL is set, on the code side:

- **Synced:** runs, training plans, planned workouts, chat messages, shoes.
- **Never synced:** `settings` and `logs`, passed to the addon as
  `unsyncedTables`. `settings` holds your **OpenRouter API key** — syncing it
  would push a credential through the sync service to every device on the
  account. The whole table is excluded rather than just the key row, because a
  row-level exclusion is one refactor away from leaking. `logs` is the
  diagnostics log, already excluded from backups for the same reason.
- **A separate database.** The cloud database is `<profile>-cloud`, distinct
  from the local one — signing in never migrates or overwrites local data, and
  a local profile and a cloud account can coexist on one device.
- **The id remap.** Local rows use auto-increment *numbers*; Dexie Cloud needs
  globally unique *strings* (two devices can't both hand out "id 5"). Moving
  data across therefore rewrites every primary key **and** every foreign key
  pointing at one, in a single pass — `remapBackupForCloud()` in
  `src/lib/cloudMigration.ts`, covered by 17 unit tests.

## Still to do after this (not blocked on you)

The pieces below need a live database to build against, which is why they're
not done yet:

- **Sign-in UI.** `customLoginGui: true` is set, so the app must render its own
  email-OTP dialog against `db.cloud.userInteraction`. Not written yet.
- **Triggering the migration.** `remapBackupForCloud()` is built and tested but
  nothing calls it yet — first sign-in should offer to bring local data across.
- **Two-device verification.** Sprint 11's exit criteria (dev-plan §12.2): log a
  run on one device, see it on another; offline edits reconcile.

Tell me once the database exists and I'll build those against it.
