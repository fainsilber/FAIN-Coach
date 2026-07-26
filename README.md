# FAIN Coach

**Live app: https://fainsilber.github.io/FAIN-Coach/** — installable PWA ("Add to Home Screen" on mobile)

A local-first AI running coach. Upload `.tcx` files from any GPS watch (Garmin, Coros, Suunto), record how the run felt, and get structured coaching plus multi-week training plans powered by open-weights models via [OpenRouter](https://openrouter.ai) — bring your own API key.

**Local-first & private:** all parsing and telemetry stay in your browser (IndexedDB). Only compact run summaries — never raw GPS traces — are sent to the LLM.

## Features

- **TCX upload** — drag-and-drop or file picker, parsed entirely in-browser. Handles missing metrics gracefully and normalizes single-leg cadence. Trackpoints are discarded after lap aggregation, so a 5.5 MB file becomes a ~3 KB record.
- **Manual entry** — no file? Log the run by hand. Only date, distance and time are required; anything you didn't measure is simply left out, and the coach is told the numbers are self-reported.
- **Run history & detail** — lap table plus per-lap charts for pace, heart rate, cadence, and power. Charts appear only for metrics your watch actually recorded.
- **Subjective input** — RPE 1–10, feel tags, and free-text notes, fused with the telemetry when coaching.
- **AI coach** — one global, plan-aware chat thread. Streaming replies in a fixed 3-part format: the big picture, a telemetry breakdown, and one concrete next step.
- **Training plans** — generate a multi-week plan from a goal race, then track it. Uploaded runs auto-match to planned workouts (you confirm), and adherence feeds back into the coaching.
- **Local profiles** — several runners can share one device, each with isolated data and an optional PIN. Note this is data *separation*, not encryption.
- **Offline** — everything except LLM calls works without a network.
- **Units & week start** — metric or imperial, and a week that starts Sunday or Monday. Switching only changes what you see: runs are always stored in metres, so backups stay portable between users of either system.
- **English & Hebrew** — full right-to-left interface in Hebrew, per profile, and the AI coach replies in your language. More languages are a single translation file away.
- **Backups** — versioned JSON export/import to move data between devices.
- **Version & diagnostics** — Settings shows exactly which build you're running (version, commit, build time), with an explicit prompt when an update is ready — no more guessing whether a refresh worked. A local, exportable diagnostics log helps troubleshoot problems; it never contains your API key, chat messages, or notes.

## Development

```bash
npm install
npm run dev        # dev server at /
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build
npm run preview    # serve the build at /FAIN-Coach/, as in production
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds with the `/FAIN-Coach/` base path and publishes to GitHub Pages.

## Using it on more than one device

Data is per-device by design — there is no server and no sync. Each device starts empty; use **Settings → Export backup** on one and **Import** on the other to move runs, plans, and chat across. The OpenRouter API key is stored per device, so it must be entered in Settings on each one.

## Roadmap

- **Design refresh** — planned; direction not yet defined.
- **Shoe tracking** — register your shoes, see the mileage on each pair, and get a warning before they're worn out. [Spec](docs/dev-plan.md)
- **Import from Strava, Garmin and Smashrun** — connect the platform you already sync to instead of exporting files by hand. Needs the hosted backend first. [Spec](docs/dev-plan.md)
- A **paid hosted tier** (accounts, cloud sync, and a managed AI key so there's no setup) is planned — see [docs/monetization.md](docs/monetization.md) and dev-plan §12.

In the meantime, if your watch already syncs to Strava (Garmin can forward automatically, and tools like [tapiriik](https://github.com/cpfair/tapiriik) bridge other platforms), a bulk export from there imports fine through the existing file upload.

Longer-term items live in [docs/dev-plan.md §16](docs/dev-plan.md), notably a GPX parser for native Apple Watch exports.

## Docs

- [Product Requirements (PRD v1.6)](docs/PRD.md)
- [Development Plan v2.1](docs/dev-plan.md) — locked decisions, schema, sprint outcomes, open risks
