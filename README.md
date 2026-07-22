# FAIN Coach

**Live app:** https://fainsilber.github.io/FAIN-Coach/ (installable PWA — "Add to Home Screen" on mobile)

A local-first AI running coach PWA. Upload `.tcx` files from any GPS watch (Garmin, Coros, Apple Watch, Suunto), record how the run felt, and get structured coaching feedback and multi-week training plans powered by open-weights models via [OpenRouter](https://openrouter.ai) — bring your own API key.

**Local-first & private:** all parsing and telemetry stay in your browser (IndexedDB). Only compact run summaries (never raw GPS data) are sent to the LLM.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds with the `/FAIN-Coach/` base path and publishes to GitHub Pages. Data is per-device (local profiles, IndexedDB); each device starts fresh — use Settings → Export/Import to move data between devices.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
- [Development Plan v1.1](docs/dev-plan.md) — locked stack decisions, schema, sprint breakdown
