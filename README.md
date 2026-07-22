# FAIN Coach

A local-first AI running coach PWA. Upload `.tcx` files from any GPS watch (Garmin, Coros, Apple Watch, Suunto), record how the run felt, and get structured coaching feedback and multi-week training plans powered by open-weights models via [OpenRouter](https://openrouter.ai) — bring your own API key.

**Local-first & private:** all parsing and telemetry stay in your browser (IndexedDB). Only compact run summaries (never raw GPS data) are sent to the LLM.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build
```

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
- [Development Plan v1.1](docs/dev-plan.md) — locked stack decisions, schema, sprint breakdown
