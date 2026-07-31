# FAIN Coach

**Live app:** https://fainsilber.github.io/FAIN-Coach/ or https://fain-coach.fainsilber.workers.dev/ — installable PWA ("Add to Home Screen" on mobile). The two are separate deployments with separate data (see Deployment below) — pick one and stick with it, or use backup export/import to move between them.

A local-first AI running coach. Upload `.tcx` files from any GPS watch (Garmin, Coros, Suunto), record how the run felt, and get structured coaching plus multi-week training plans powered by open-weights models via [OpenRouter](https://openrouter.ai) — bring your own API key.

**Local-first & private:** all parsing and telemetry stay in your browser (IndexedDB). Only compact run summaries — never raw GPS traces — are sent to the LLM.

## Features

- **TCX upload** — drag-and-drop or file picker, parsed entirely in-browser. Handles missing metrics gracefully and normalizes single-leg cadence. Trackpoints are discarded after lap aggregation, so a 5.5 MB file becomes a ~3 KB record.
- **Bulk import** — drop a whole folder of `.tcx` files at once and review them before anything is saved. Runs you already imported are recognised and skipped, an unreadable file is reported without derailing the rest, and the coach gets one summary message instead of one per run. [`tools/garmin-export/`](tools/garmin-export/) downloads your Garmin history into such a folder — it runs on your machine, and your Garmin password never leaves it.
- **One-click Garmin import** (where a Worker is deployed) — connect once with the helper, then pull any date range straight into the app, phone included. Your Garmin password never leaves your own machine: it mints tokens locally, and only those go to the server. Disconnecting revokes them. [Connect your account](docs/connect-garmin.md) (step-by-step, Windows/macOS/Linux) · [Worker setup](docs/garmin-worker-setup.md) (deploying it)
- **Manual entry** — no file? Log the run by hand. Only date, distance and time are required; anything you didn't measure is simply left out, and the coach is told the numbers are self-reported.
- **Run history & detail** — lap table plus per-lap charts for pace, heart rate, cadence, and power. Charts appear only for metrics your watch actually recorded.
- **Subjective input** — RPE 1–10, feel tags, and free-text notes, fused with the telemetry when coaching.
- **AI coach** — one global, plan-aware chat thread. Streaming replies in a fixed 3-part format: the big picture, a telemetry breakdown, and one concrete next step.
- **Training plans** — generate a multi-week plan from a goal race, then track it. Uploaded runs auto-match to planned workouts (you confirm), and adherence feeds back into the coaching.
- **Local profiles** (free tier, GitHub Pages) — several runners can share one device, each with isolated data and an optional PIN. Note this is data *separation*, not encryption.
- **Cloud sync** (Sync tier, [coach.fainsilber.co.il](https://coach.fainsilber.co.il/)) — sign in with email + a one-time code and your runs, plans, and chat history follow you across devices. Verified to reconcile correctly even when two devices edit while both offline. Your OpenRouter API key is never part of what syncs — it stays local to whichever device you typed it into.
- **Offline** — everything except LLM calls works without a network.
- **Units & week start** — metric or imperial, and a week that starts Sunday or Monday. Switching only changes what you see: runs are always stored in metres, so backups stay portable between users of either system.
- **English, Hebrew & Spanish (Mexico)** — full right-to-left interface in Hebrew, per profile, and the AI coach replies in your language. More languages are a single translation file away.
- **Backups** — versioned JSON export/import to move data between devices.
- **Version & diagnostics** — Settings shows exactly which build you're running (version, commit, build time), with an explicit prompt when an update is ready — no more guessing whether a refresh worked. A local, exportable diagnostics log helps troubleshoot problems; it never contains your API key, chat messages, or notes.
- **Shoe tracking** — register your shoes, assign runs to them, and see mileage accumulate toward a replacement threshold you set. The picker defaults to whichever pair you wore most recently; retire a pair instead of deleting it and its history stays intact. The coach mentions it once a pair is close to worn out.

## Development

```bash
npm install
npm run dev              # dev server at /
npm test                 # unit tests (Vitest)
npm run build:pages      # production build for GitHub Pages (/FAIN-Coach/)
npm run build:cloudflare # production build for a root domain (/)
npm run preview:pages    # serve that build as it is served in production
```

## Deployment

The app is built for one of two targets, selected by the `DEPLOY_TARGET` environment variable. It sets the base path, and the router basename, PWA scope, and precache manifest all follow from it:

| Target | Base path | SPA fallback |
|---|---|---|
| `cloudflare` | `/` (root domain) | native (Cloudflare Workers static-assets SPA mode) |
| `pages` | `/FAIN-Coach/` | `public/404.html` |

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which runs `build:pages` and publishes to GitHub Pages. A Cloudflare Worker (static assets, connected via Cloudflare's Git integration — build command `npm run build:cloudflare`) builds and deploys the same repo automatically.

**The two deployments share code but not data.** They are different origins, so IndexedDB — profiles, runs, plans, chat history — is entirely separate between them. Use **Settings → Export backup** and **Import** to move data across.

## Using it on more than one device

Data is per-device by design — there is no server and no sync. Each device starts empty; use **Settings → Export backup** on one and **Import** on the other to move runs, plans, and chat across. The OpenRouter API key is stored per device, so it must be entered in Settings on each one.

## Roadmap

- **Design refresh** — planned; direction not yet defined.
- **Import from Garmin, Smashrun and Strava** (build order, reordered 2026-07-30) — connect the platform you already sync to instead of exporting files by hand. Garmin needs no hosted backend at all; Smashrun and Strava do. [Spec](docs/dev-plan.md)
- **Paid tiers** — see [docs/monetization.md](docs/monetization.md) and dev-plan §12. Cloudflare hosting and the **Sync** tier (accounts, multi-device sync, cloud backup, still bring-your-own key) are both done and live at [coach.fainsilber.co.il](https://coach.fainsilber.co.il/). Remaining: a **managed AI key** so there's no setup required, then the billing that turns it into a paid **Pro** tier.

In the meantime, a bulk export from Garmin, Strava, Smashrun, or almost anywhere else imports fine through the existing file upload — Garmin Connect's own "Export to TCX" is the most direct route. (We looked at [tapiriik](https://github.com/cpfair/tapiriik) as a bridge between platforms; its Garmin support is broken as of 2026-07-30 and the project has been unmaintained since 2023, so don't count on it.)

Longer-term items live in [docs/dev-plan.md §16](docs/dev-plan.md), notably a GPX parser for native Apple Watch exports.

## Docs

- [Product Requirements (PRD v1.7)](docs/PRD.md)
- [Development Plan v3.6](docs/dev-plan.md) — locked decisions, schema, sprint outcomes, open risks
- [Connect your Garmin account](docs/connect-garmin.md) — step-by-step, Windows/macOS/Linux, no assumed background
