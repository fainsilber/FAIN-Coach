# FAIN Coach

Local-first AI running coach PWA. Users upload `.tcx` files from any GPS watch, add subjective feedback (RPE, feel tags, notes), and chat with an AI coach via OpenRouter. All telemetry stays in the browser (IndexedDB) — only compact macro summaries are ever sent to the LLM.

**Read first:** [docs/PRD.md](docs/PRD.md) (requirements) and [docs/dev-plan.md](docs/dev-plan.md) (v1.1 — supersedes the PRD's roadmap and schema where they conflict).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm test` — Vitest, single run (`npm run test:watch` for watch mode)
- `npm run typecheck` — typecheck only

## Stack (locked decisions — do not swap without discussion)

Vite + React 18 + TypeScript (SPA, static hosting) · Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `src/index.css`) + shadcn/ui (`npx shadcn@latest add <component>` — `components.json` is configured) · Dexie.js + dexie-react-hooks · Recharts (lap-level charts only) · vite-plugin-pwa · Vitest (jsdom).

## Layout

- `src/db/` — Dexie schema (`db.ts`) and data contracts (`types.ts`). 5 tables: runs, trainingPlans, plannedWorkouts, chatMessages, settings. Laps are embedded in `RunRecord`, not a table.
- `src/parser/` — TCX parser (`tcx.ts`) + tests; put fixture TCX files in `src/parser/fixtures/`.
- `src/llm/` — `LlmClient` transport interface + OpenRouter implementation. Never call fetch for LLMs outside this layer.
- `src/prompts/` — pure prompt-pipeline functions (`summarizeRun`, `buildCoachContext`, `buildPlanRequest`). Mandatory unit-test target.
- `src/pages/` — one file per route; `src/App.tsx` holds the router shell.

## Hard rules (from the PRD/dev plan)

- **No trackpoint storage.** The parser aggregates to laps and discards the time series.
- **Optional metrics stay optional.** HR/cadence/power absent from a file → `undefined`, never 0, and never mentioned in prompts (enforced by only listing present metrics in summaries).
- Cadence < 120 in TCX is single-leg → ×2 to get SPM.
- Post-run chat context ≤ 1,000 tokens (chars/4 heuristic); plan generation ~3-4k.
- One global chat thread — no per-run threads.
- Coach responses follow the 3-step layout: Big Picture / Telemetry Breakdown / Next Step.
- API key is BYO, stored in IndexedDB `settings`, never sent anywhere except OpenRouter.

## Status

Scaffold complete (2026-07-22). Next: Sprint 1 — implement `parseTcx` + fixtures, upload UI, post-run form. Sprint plan and exit criteria are in [docs/dev-plan.md](docs/dev-plan.md) §5.
