# FAIN Coach

Local-first AI running coach PWA. Users upload `.tcx` files from any GPS watch, add subjective feedback (RPE, feel tags, notes), and chat with an AI coach via OpenRouter. All telemetry stays in the browser (IndexedDB) — only compact macro summaries are ever sent to the LLM.

**Live:** https://fainsilber.github.io/FAIN-Coach/ (auto-deploys on push to `main`)

**Read first:** [docs/PRD.md](docs/PRD.md) (requirements) and [docs/dev-plan.md](docs/dev-plan.md) (v1.6 — authoritative for schema, sprints, and decisions; supersedes the PRD wherever they conflict).

## Commands

- `npm run dev` — Vite dev server (serves at `/`, not the deploy subpath)
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run preview` — serve the built app at `/FAIN-Coach/`, matching production
- `npm test` — Vitest, single run (`npm run test:watch` for watch mode)

## Stack (locked decisions — do not swap without discussion)

Vite + React 18 + TypeScript (SPA, static hosting) · Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `src/index.css`) + shadcn/ui (`npx shadcn@latest add <component>`) · Dexie.js + dexie-react-hooks · Recharts (lap-level charts only) · vite-plugin-pwa · Vitest (jsdom, fake-indexeddb).

## Layout

- `src/db/` — Dexie schema (`db.ts`), contracts (`types.ts`), settings helpers (`settings.ts`, incl. `getPreferences()`). 5 tables: runs, trainingPlans, plannedWorkouts, chatMessages, settings. Laps are embedded in `RunRecord`, not a table. **One database per profile** — the `db` singleton binds to the active profile at module load, so switching profiles reloads the app.
- `src/lib/profiles.ts` — local profile registry (localStorage), salted-PIN hashing, legacy-DB adoption. Data *separation*, not security (PRD §4.4).
- `src/lib/backup.ts` — versioned JSON export/import over all tables; import replaces the DB, preserving ids and cross-table links.
- `src/lib/matching.ts` — run↔plan auto-match (±1 day, distance tie-break) and adherence stats.
- `src/lib/saveRun.ts` — **the single write path for a completed run**, shared by TCX upload and manual entry: persist, complete a matched workout, inject the coach message. Add a new entry point here rather than duplicating the sequence.
- `src/lib/manualRun.ts` — pure validation/conversion for manual entry (form strings → `NewRun`), so the rules are testable without the form.
- `src/lib/units.ts`, `src/lib/week.ts`, `src/lib/usePreferences.ts` — unit conversion boundary and week math; see the dedicated section below.
- `src/i18n/` — translation catalogs and provider; see the dedicated section below.
- `src/parser/tcx.ts` — defensive TCX parser + fixtures in `src/parser/fixtures/`.
- `src/llm/` — `LlmClient` transport interface, `openrouter.ts` (SSE streaming, retry, error mapping), `models.ts` (curated model catalog). **Never call fetch for LLMs outside this layer.**
- `src/prompts/` — pure prompt-pipeline functions (`summarizeRun`, `buildCoachContext`, `buildPlanRequest`, `coachSystemPrompt`) and `planResponse.ts` (strict JSON validation + one retry). All take `unit`/`language` parameters rather than reading context. Mandatory unit-test target.
- `src/pages/` — one file per route; `src/App.tsx` holds the router shell and profile gate.

## Hard rules (from the PRD/dev plan)

- **No trackpoint storage.** The parser aggregates to laps and discards the time series.
- **Optional metrics stay optional.** HR/cadence/power absent from a file *or left blank in manual entry* → the key is omitted, never 0, and never mentioned in prompts (enforced by only listing present metrics in summaries, not by trusting the model).
- **Runs record their `source`.** `'manual'` runs are self-reported, and `summarizeRun` says so — an estimated heart rate shouldn't be treated as telemetry. Absent `source` means `'tcx'` (pre-Sprint-8 records).
- Cadence < 120 in TCX is single-leg → ×2 to get SPM.
- Post-run chat context ≤ 1,000 tokens (chars/4 heuristic); plan generation ~4k.
- One global chat thread — no per-run threads.
- Coach responses follow the 3-step layout: Big Picture / Telemetry Breakdown / Next Step.
- API key is BYO, stored in IndexedDB `settings`, never sent anywhere except OpenRouter.
- **Prompt rules must be literal.** Weaker instruct models follow instructions exactly: "taper before the race" produced an empty race week, and "derive a pace from the goal" put easy runs at race pace. State constraints explicitly — ambiguity here is a safety issue, not a style one.
- **LLM retries**: the connection phase retries automatically; never retry after tokens have streamed (duplicates output) and never on 4xx.

## Deployment gotcha

Served from the `/FAIN-Coach/` subpath, so Vite `base`, the router `basename` (`import.meta.env.BASE_URL`), the PWA `scope`/`start_url`, and `public/404.html` must stay in agreement. `vite preview` runs as `command === 'serve'`, hence the `command === 'build' || isPreview` check in `vite.config.ts` — without it, preview serves at `/` while assets reference `/FAIN-Coach/`.

## Units & week start (built — Sprint 6)

- `src/lib/units.ts` is the **only** place metres become km/miles. Store SI always; convert at the display or prompt boundary. Never convert bpm/spm/watts.
- `src/lib/week.ts` owns all week math. **Week starts Sunday by default** (deliberately not ISO 8601 — don't "fix" it). Never hard-code a week offset.
- Components read preferences via `usePreferences()`; pure functions (prompts) take `UnitSystem` as a parameter so they stay testable.
- `PlanGoalInput.currentWeeklyKm` is canonical km — the wizard converts from miles on entry, and `buildPlanRequest` always states the unit so a bare "16" can't be misread.
- Plan JSON `targetDistanceMeters` is always metres, whatever units the prose uses; the prompt says so explicitly.

## Language & RTL (built — Sprint 7)

- `src/i18n/` owns it: `en.ts` is the source of truth for keys; every other catalog is `Record<MessageKey, string>` so a missing translation is a **compile error**. Adding a language = one catalog file + one `LANGUAGES` entry.
- **No user-visible string hard-coded in a component** — always `t('key')` via `useT()`/`useI18n()`. Pure functions (prompts) take a `PromptLanguage` parameter instead of using React context.
- **Logical** Tailwind utilities only (`ms-*`/`ps-*`/`text-start`, never `ml-*`/`pl-*`/`text-left`). Numeric compound lines get `dir="ltr"`; inline values inside text get `<bdi>`; chat bubbles and workout descriptions use `dir="auto"`; charts and the lap table stay `dir="ltr"`.
- Coach prompts localize the demanded OUTPUT and 3-step headings, but instructions stay English; plan JSON keys and `type` enum values stay English — only `description` is localized.
- Language is per profile (`settings.language`) with a device-level `localStorage` fallback (`fain-coach.language`) so the profile gate is localized before any profile is active.

## Status

Sprints 1–8 complete, local profiles added, deployed to GitHub Pages. 131 tests passing. English + Hebrew (RTL), metric/imperial, configurable week start, and manual run entry all shipped.

**Next:** Sprint 9 — design refresh ([dev-plan §11](docs/dev-plan.md)) is a deliberate placeholder; **do not invent a design direction**, it will be supplied. Ongoing risks in [§12](docs/dev-plan.md) — Hebrew LLM output quality is the main untested item.
