# FAIN Coach

**Live app: https://fainsilber.github.io/FAIN-Coach/** — installable PWA ("Add to Home Screen" on mobile)

A local-first AI running coach. Upload `.tcx` files from any GPS watch (Garmin, Coros, Suunto), record how the run felt, and get structured coaching plus multi-week training plans powered by open-weights models via [OpenRouter](https://openrouter.ai) — bring your own API key.

**Local-first & private:** all parsing and telemetry stay in your browser (IndexedDB). Only compact run summaries — never raw GPS traces — are sent to the LLM.

## Features

- **TCX upload** — drag-and-drop or file picker, parsed entirely in-browser. Handles missing metrics gracefully and normalizes single-leg cadence. Trackpoints are discarded after lap aggregation, so a 5.5 MB file becomes a ~3 KB record.
- **Run history & detail** — lap table plus per-lap charts for pace, heart rate, cadence, and power. Charts appear only for metrics your watch actually recorded.
- **Subjective input** — RPE 1–10, feel tags, and free-text notes, fused with the telemetry when coaching.
- **AI coach** — one global, plan-aware chat thread. Streaming replies in a fixed 3-part format: the big picture, a telemetry breakdown, and one concrete next step.
- **Training plans** — generate a multi-week plan from a goal race, then track it. Uploaded runs auto-match to planned workouts (you confirm), and adherence feeds back into the coaching.
- **Local profiles** — several runners can share one device, each with isolated data and an optional PIN. Note this is data *separation*, not encryption.
- **Offline** — everything except LLM calls works without a network.
- **Units & week start** — metric or imperial, and a week that starts Sunday or Monday. Switching only changes what you see: runs are always stored in metres, so backups stay portable between users of either system.
- **Backups** — versioned JSON export/import to move data between devices.

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

- ✅ **Units & week start** — metric or imperial (metric is the default), and a configurable first day of the week, defaulting to Sunday.
- **Multi-language** — English and Hebrew with full right-to-left support. [Spec](docs/dev-plan.md)

## Docs

- [Product Requirements (PRD v1.2)](docs/PRD.md)
- [Development Plan v1.3](docs/dev-plan.md) — locked decisions, schema, sprint outcomes, open risks
