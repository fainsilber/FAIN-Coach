# FAIN Coach

Local-first AI running coach PWA. Users upload `.tcx` files from any GPS watch, add subjective feedback (RPE, feel tags, notes), and chat with an AI coach via OpenRouter. All telemetry stays in the browser (IndexedDB) — only compact macro summaries are ever sent to the LLM.

**Live:** https://fainsilber.github.io/FAIN-Coach/ (auto-deploys on push to `main`)

**Read first:** [docs/PRD.md](docs/PRD.md) (requirements) and [docs/dev-plan.md](docs/dev-plan.md) (v1.3 — authoritative for schema, sprints, and decisions; supersedes the PRD wherever they conflict).

## Commands

- `npm run dev` — Vite dev server (serves at `/`, not the deploy subpath)
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run preview` — serve the built app at `/FAIN-Coach/`, matching production
- `npm test` — Vitest, single run (`npm run test:watch` for watch mode)

## Stack (locked decisions — do not swap without discussion)

Vite + React 18 + TypeScript (SPA, static hosting) · Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `src/index.css`) + shadcn/ui (`npx shadcn@latest add <component>`) · Dexie.js + dexie-react-hooks · Recharts (lap-level charts only) · vite-plugin-pwa · Vitest (jsdom, fake-indexeddb).

## Layout

- `src/db/` — Dexie schema (`db.ts`), contracts (`types.ts`), settings helpers (`settings.ts`). 5 tables: runs, trainingPlans, plannedWorkouts, chatMessages, settings. Laps are embedded in `RunRecord`, not a table. **One database per profile** — the `db` singleton binds to the active profile at module load, so switching profiles reloads the app.
- `src/lib/profiles.ts` — local profile registry (localStorage), salted-PIN hashing, legacy-DB adoption. Data *separation*, not security (PRD §4.4).
- `src/lib/backup.ts` — versioned JSON export/import over all tables; import replaces the DB, preserving ids and cross-table links.
- `src/lib/matching.ts` — run↔plan auto-match (±1 day, distance tie-break) and adherence stats.
- `src/parser/tcx.ts` — defensive TCX parser + fixtures in `src/parser/fixtures/`.
- `src/llm/` — `LlmClient` transport interface, `openrouter.ts` (SSE streaming, retry, error mapping), `models.ts` (curated model catalog). **Never call fetch for LLMs outside this layer.**
- `src/prompts/` — pure prompt-pipeline functions (`summarizeRun`, `buildCoachContext`, `buildPlanRequest`) and `planResponse.ts` (strict JSON validation + one retry). Mandatory unit-test target.
- `src/pages/` — one file per route; `src/App.tsx` holds the router shell and profile gate.

## Hard rules (from the PRD/dev plan)

- **No trackpoint storage.** The parser aggregates to laps and discards the time series.
- **Optional metrics stay optional.** HR/cadence/power absent from a file → `undefined`, never 0, and never mentioned in prompts (enforced by only listing present metrics in summaries, not by trusting the model).
- Cadence < 120 in TCX is single-leg → ×2 to get SPM.
- Post-run chat context ≤ 1,000 tokens (chars/4 heuristic); plan generation ~4k.
- One global chat thread — no per-run threads.
- Coach responses follow the 3-step layout: Big Picture / Telemetry Breakdown / Next Step.
- API key is BYO, stored in IndexedDB `settings`, never sent anywhere except OpenRouter.
- **Prompt rules must be literal.** Weaker instruct models follow instructions exactly: "taper before the race" produced an empty race week, and "derive a pace from the goal" put easy runs at race pace. State constraints explicitly — ambiguity here is a safety issue, not a style one.
- **LLM retries**: the connection phase retries automatically; never retry after tokens have streamed (duplicates output) and never on 4xx.

## Deployment gotcha

Served from the `/FAIN-Coach/` subpath, so Vite `base`, the router `basename` (`import.meta.env.BASE_URL`), the PWA `scope`/`start_url`, and `public/404.html` must stay in agreement. `vite preview` runs as `command === 'serve'`, hence the `command === 'build' || isPreview` check in `vite.config.ts` — without it, preview serves at `/` while assets reference `/FAIN-Coach/`.

## Conventions for Sprints 6 & 7 (specified, not yet built)

**Sprint 6 — units & week start** ([dev-plan §8](docs/dev-plan.md)): store SI always and convert only at the display boundary, so backups stay portable between metric and imperial users; never convert bpm/spm/watts. **Week starts Sunday by default** (deliberately not ISO 8601) and is user-configurable — derive it from the setting in one shared helper, never hard-code, and make sure the plan view, weekly totals, and the coach's "coming week" window all use the same one.

**Sprint 7 — language & RTL** ([dev-plan §9](docs/dev-plan.md)): no user-visible string hard-coded in a component; **logical** Tailwind utilities only (`ms-*`/`ps-*`/`text-start`, never `ml-*`/`pl-*`/`text-left`); wrap numerals and paces in `<bdi>` so RTL doesn't reorder them; keep plan JSON keys and enum values in English and localize only `description`.

## Status

Sprints 1–5 complete, local profiles added, deployed to GitHub Pages (2026-07-22). 78 tests passing. Next: **Sprint 6 — units & week start** ([§8](docs/dev-plan.md)), then **Sprint 7 — English/Hebrew with RTL** ([§9](docs/dev-plan.md)). Open backlog in §10.
