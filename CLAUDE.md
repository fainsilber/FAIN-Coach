# FAIN Coach

Local-first AI running coach PWA. Users upload `.tcx` files from any GPS watch, add subjective feedback (RPE, feel tags, notes), and chat with an AI coach via OpenRouter. All telemetry stays in the browser (IndexedDB) — only compact macro summaries are ever sent to the LLM.

**Live:** https://fainsilber.github.io/FAIN-Coach/ and https://fain-coach.fainsilber.workers.dev/ (both auto-deploy on push to `main` — see Deployment below)

**Read first:** [docs/PRD.md](docs/PRD.md) (requirements) and [docs/dev-plan.md](docs/dev-plan.md) (v3.2 — authoritative for schema, sprints, and decisions; supersedes the PRD wherever they conflict).

## Commands

- `npm run dev` — Vite dev server (serves at `/`, not the deploy subpath)
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run build:cloudflare` / `npm run build:pages` — build for a specific deploy target (see Deployment below)
- `npm run preview:cloudflare` / `npm run preview:pages` — serve the built app at that target's base
- `npm test` — Vitest, single run (`npm run test:watch` for watch mode)

## Stack (locked decisions — do not swap without discussion)

Vite + React 18 + TypeScript (SPA, static hosting) · Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `src/index.css`) + shadcn/ui (`npx shadcn@latest add <component>`) · Dexie.js + dexie-react-hooks · Recharts (lap-level charts only) · vite-plugin-pwa · Vitest (jsdom, fake-indexeddb).

## Layout

- `src/db/` — Dexie schema (`db.ts`), contracts (`types.ts`), settings helpers (`settings.ts`, incl. `getPreferences()`). 7 tables: runs, trainingPlans, plannedWorkouts, chatMessages, settings, logs, shoes. Laps are embedded in `RunRecord`, not a table. **One database per profile** — the `db` singleton binds to the active profile at module load, so switching profiles reloads the app.
- `src/lib/profiles.ts` — local profile registry (localStorage), salted-PIN hashing, legacy-DB adoption. Data *separation*, not security (PRD §4.4).
- `src/lib/backup.ts` — versioned JSON export/import over all tables (except `logs`, deliberately); import replaces the DB, preserving ids and cross-table links. Accepts both the current schema version and v1 (pre-Sprint-13, no `shoes` key).
- `src/lib/matching.ts` — run↔plan auto-match (±1 day, distance tie-break) and adherence stats.
- `src/lib/saveRun.ts` — **the single write path for a completed run**, shared by TCX upload and manual entry: persist, complete a matched workout, inject the coach message. Add a new entry point here rather than duplicating the sequence. `saveRunsBatch` is the bulk-import sibling — atomic, and posts **one** summary coach message instead of one per run (logging stays outside the transaction; `logs` isn't in scope and writing to it inside would abort it).
- `src/lib/providerImport.ts` — pure batch-import rules: `externalIdFromFilename` (reads the id back out of `garmin-<activityId>.tcx`), `parseImportCandidate` (a bad file becomes an error row, never throws), `markDuplicates` (existing rows *and* repeats within one batch).
- `src/lib/manualRun.ts` — pure validation/conversion for manual entry (form strings → `NewRun`), so the rules are testable without the form.
- `src/lib/shoes.ts` — pure shoe-mileage functions (`shoeStatus`, `shoeMileage`, `mostRecentShoeId`) over a shoe + run list; mileage is always derived, never stored. `src/pages/ShoesPage.tsx` is the management UI (off Settings, not the bottom nav).
- `src/lib/log.ts` — bounded (~500 entry) diagnostics log; `logEvent()` enforces redaction, swallows its own errors, never throws.
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
- Coach responses use the 3-step layout (Big Picture / Telemetry Breakdown / Next Step) **only when reviewing a shared run**. General questions and comments ("my knee hurts") get a natural conversational reply — don't force the structure. Injury/pain comments: advise caution, suggest professional help, never diagnose.
- API key is BYO, stored in IndexedDB `settings`, never sent anywhere except OpenRouter.
- **Prompt rules must be literal.** Weaker instruct models follow instructions exactly: "taper before the race" produced an empty race week, and "derive a pace from the goal" put easy runs at race pace. State constraints explicitly — ambiguity here is a safety issue, not a style one.
- **LLM retries**: the connection phase retries automatically; never retry after tokens have streamed (duplicates output) and never on 4xx.
- **Ids are `EntityId = number | string`, and you must never `Number()` one.** The local tier uses Dexie auto-increment numbers; a cloud account uses Dexie Cloud `@id` strings (Sprint 11). Turning a `<select>` value or route param back into an id goes through `parseEntityId()` in `src/db/db.ts` — the *only* place that distinction belongs. `Number()` on a cloud id gives `NaN`, and `.get(NaN)` returns undefined with no error: a lookup that fails silently.
- **Booleans are not a valid IndexedDB index.** Dexie/IndexedDB can't index a boolean field reliably — filter it client-side instead (e.g. `shoes.retired`). Don't repeat this mistake in a future schema change.
- **Provider dedupe is `[source+externalId]`, deliberately NOT unique.** Uniqueness is enforced in application code (`markDuplicates`) so a re-import reports "already imported" instead of throwing mid-batch, and so two devices importing the same activity offline can't produce a sync-time `ConstraintError`. Rows with no `externalId` are absent from a compound index entirely — verified, which is why existing runs needed no migration.
- **Every AI-dependent action must be gated on a live `hasKey` check, not just error handling after the fact.** ChatPage and PlanPage both `useLiveQuery` the API key's presence and disable the actual submit control (Send / Generate) while it's `!== true`, with a persistent banner linking to Settings explaining why — never let the user fill out a form or type a message only to discover on submit that there's no key. This applies to any future AI-dependent feature too, including Sprint 12's managed-key `ProxyClient` path once BYO isn't the only option.

## Deployment — two targets, one codebase

Both GitHub Pages and Cloudflare are live (dev-plan §12.1). CI builds each target separately. `DEPLOY_TARGET` in `vite.config.ts` is the **only** switch, and it now decides the identity model too — `CLOUD_URL_BY_TARGET` gives Cloudflare a Dexie Cloud database (sign-in required) and leaves GitHub Pages purely local (local profiles, addon not bundled):

| Target | Base | SPA fallback | Build |
|---|---|---|---|
| `cloudflare` (default) | `/` | native — see below | `npm run build:cloudflare` |
| `pages` | `/FAIN-Coach/` | `public/404.html` | `npm run build:pages` |

- **Never hard-code the subpath.** The router `basename` (`import.meta.env.BASE_URL`), PWA `scope`/`start_url`, and precache manifest all derive from `base`. An unknown `DEPLOY_TARGET` throws — a wrong base builds fine and then 404s on every asset, so failing loudly is deliberate.
- Target-only files in `public/` are stripped from the other target's build (`404.html` is Pages-only — its `pathSegmentsToKeep=1` is wrong at a root domain). The strip runs before SW generation, so a precache manifest never references a file that isn't shipped. If you add a target-specific file, add it to `TARGET_ONLY_FILES`.
- **Don't add a `public/_redirects` file for Cloudflare.** Cloudflare's current import flow provisions a Worker with static assets (`wrangler deploy`, an auto-generated `wrangler.jsonc` with `assets.not_found_handling: "single-page-application"`), which already does SPA fallback natively. An earlier version of this repo shipped a classic-Pages-style `_redirects` catch-all and it broke the deploy outright — Cloudflare's validator detects a redirect loop against that platform's own `.html`/`/index` normalization.
- The dev server always serves at `/` regardless of target; `vite preview` matches the build, hence the `isDevServer` check.
- **The two deployments share code, never data** — different origins mean separate IndexedDB. Don't assume a user's profiles/runs exist on both.

## Units & week start (built — Sprint 6)

- `src/lib/units.ts` is the **only** place metres become km/miles. Store SI always; convert at the display or prompt boundary. Never convert bpm/spm/watts.
- `src/lib/week.ts` owns all week math. **Week starts Sunday by default** (deliberately not ISO 8601 — don't "fix" it). Never hard-code a week offset.
- Components read preferences via `usePreferences()`; pure functions (prompts) take `UnitSystem` as a parameter so they stay testable.
- `PlanGoalInput.currentWeeklyKm` is canonical km — the wizard converts from miles on entry, and `buildPlanRequest` always states the unit so a bare "16" can't be misread.
- Plan JSON `targetDistanceMeters` is always metres, whatever units the prose uses; the prompt says so explicitly.

## Language & RTL (built — Sprint 7; three languages as of 2026-07-28)

- `src/i18n/` owns it: `en.ts` is the source of truth for keys; every other catalog is `Record<MessageKey, string>` so a missing translation is a **compile error**. Adding a language = one catalog file + one `LANGUAGES` entry — proven by Spanish (Mexico, `es-MX`), added with zero changes to any feature component.
- Three catalogs today: `en.ts`, `he.ts`, `es-MX.ts`. Unit abbreviations (bpm, spm, W) stay in Latin form in every catalog, even RTL — they're units, not translated words.
- **No user-visible string hard-coded in a component** — always `t('key')` via `useT()`/`useI18n()`. Pure functions (prompts) take a `PromptLanguage` parameter instead of using React context.
- **Logical** Tailwind utilities only (`ms-*`/`ps-*`/`text-start`, never `ml-*`/`pl-*`/`text-left`). Numeric compound lines get `dir="ltr"`; inline values inside text get `<bdi>`; chat bubbles and workout descriptions use `dir="auto"`; charts and the lap table stay `dir="ltr"`.
- Coach prompts localize the demanded OUTPUT and 3-step headings, but instructions stay English; plan JSON keys and `type` enum values stay English — only `description` is localized. `coachSystemPrompt`'s headings/language-rule live in `Record<PromptLanguage, …>` lookup tables in `prompts.ts` — TypeScript enforces every language is present in both, so adding one that's missing a heading is a compile error, not a silent English fallback.
- Language is per profile (`settings.language`) with a device-level `localStorage` fallback (`fain-coach.language`) so the profile gate is localized before any profile is active.
- `detectLanguage()` maps browser language *prefixes* to catalogs, not exact tags — `es-ES`/`es-419`/bare `es` all resolve to `es-MX` since it's the only Spanish variant so far, mirroring the existing `he`/`iw` (legacy Hebrew tag) special-case. Revisit this mapping if a second Spanish catalog is ever added.

## Status

Sprints 1–8, 10, 13, and 14 complete, local profiles added, deployed to both GitHub Pages and Cloudflare. Version 1.6.0, 167 tests passing. English + Hebrew (RTL) + Spanish (Mexico), metric/imperial, configurable week start, manual run entry, shoe tracking, version/diagnostics, and up-front API-key gating on both AI features all shipped.

**Shipped, Sprint 10 — Cloudflare hosting.** See the Deployment section above for the mechanics. First deploy attempt failed on a `public/_redirects` file that conflicted with Cloudflare's own SPA handling — removed, not re-added; don't reintroduce one without re-reading the note above. Verified via curl (build identity, base path, SW, deep link, `/404.html` fallthrough) since browser tooling wasn't available at verification time — Hebrew/RTL and PWA installability were not independently re-checked on Cloudflare specifically, only inferred from the shared codebase already verified on Pages.

**Shipped, Sprint 14 — version + diagnostics.** Version display (`src/lib/appInfo.ts`, injected in `vite.config.ts` via `define` from `package.json` + `git rev-parse --short HEAD`) and a bounded diagnostics log (`src/lib/log.ts`, Dexie `logs` table, v2) are live in Settings. `registerType` was switched from `'autoUpdate'` to `'prompt'` (with `injectRegister: false`) — that's the actual fix; autoUpdate never fires `onNeedRefresh`, it just reloads silently. **If you touch the logger, redaction is mandatory** — `logEvent()` enforces it, never bypass it by writing to `db.logs` directly. Never log the API key, chat content, or run notes (PRD FR-8.8) — metadata and event codes only. `saveRunAndPromptCoach` in `src/lib/saveRun.ts` is the single place `run.saved`/`run.save.failed` get logged for both entry paths.

**Shipped, Sprint 13 — shoe tracking.** `src/lib/shoes.ts` (pure `shoeStatus`/`shoeMileage`/`mostRecentShoeId`) plus `src/pages/ShoesPage.tsx` (reachable from Settings, not the bottom nav — it's already full at five). Mileage is always derived from `initialDistanceMeters + Σ(runs assigned to that shoe)`, never stored — reassigning or deleting a run can't leave a stale total. The shoe picker (shared `PostRunForm`, used by both upload and manual entry) defaults to the most recently worn *active* pair and always offers "not recorded"; retired pairs vanish from the picker but stay visible on their historical runs and on the Shoes screen. Warn at ≥90%, over at ≥100% of `retirementDistanceMeters` — advisory only, never blocks saving. `shoes: '++id'` takes Dexie v3 (no index on `retired` — see the boolean-index hard rule above). `BACKUP_SCHEMA_VERSION` bumped to 2; `parseBackup` still accepts v1 files (no `shoes` key → treated as empty). The coach gets one line in its context when the active pair is at warn/over (FR-7.10) — verified end-to-end by intercepting the OpenRouter `fetch` call and confirming the alert text was present in the system prompt.

**Shipped, 2026-07-28 — Spanish (Mexico), a third language.** See the Language & RTL section above for the mechanics; this is the record of what shipping it actually cost. Requested directly, outside the sprint backlog. Two files touched to add the language itself (`src/i18n/es-MX.ts`, `src/i18n/index.tsx`), plus `prompts.ts`'s coach-prompt lookup tables — genuinely zero changes anywhere else, confirming the FR-5.1 architecture claim. Verified end-to-end: every page renders correctly in Spanish, the API-key gate works identically, and the coach's actual system prompt (checked via fetch interception) demands `ENTIRELY in Spanish` with the correct localized headings. `i18n.test.ts` was generalized while doing this — completeness/placeholder-parity checks now loop over a catalog map instead of hard-coding Hebrew, so a fourth language gets the same test coverage for free.

**Next — three independent-ish tracks:**
- **Sprint 9** — design refresh ([dev-plan §11](docs/dev-plan.md)) is a deliberate placeholder; **do not invent a design direction**, it will be supplied.
- **Sprint 11 is done.** All exit criteria verified live on two real devices, 2026-07-30 ([dev-plan §12.2](docs/dev-plan.md)): sign-in, local→cloud migration, cross-device sync, and — the thorough version — both devices offline *simultaneously*, each logging a different run, both merging cleanly with no loss or duplicates on reconnect. The Sync tier's core promise is proven, not assumed.
- **Sprint 12** (§12.3) — managed AI proxy + transport. **Buildable now**: Worker `/ai` (session auth, token cap, OpenRouter proxy with SSE), plus `ProxyClient implements LlmClient` so the transport swaps with zero component changes. Needs only `OPENROUTER_API_KEY` as a Worker secret. Gated by just two monetization.md §8 items (rates + cap), *not* the whole checklist. Whether this is the repo's first Worker request handler or the second depends on build order — see the Sprint 15–17 note below.
- **Sprint 12b** (§12.4) — pricing investigation + billing + gating. **Blocked**: payment provider undecided. When built, the entitlement check must sit behind one narrow swappable interface, the way `LlmClient` did for AI transport — a provider's webhook shape must not leak into the app.
- **Sprints 15–17** — provider import, reordered 2026-07-30: **Garmin, then Smashrun, then Strava** ([dev-plan §15](docs/dev-plan.md)) — Strava's Standard tier now costs $11.99/mo (as of 2026-06-30) and caps at Single Player Mode by default, while Garmin's unofficial route (`python-garminconnect`) just proved itself by surviving a real TLS-fingerprinting breakage. **Garmin needs no Cloudflare Worker and no Sprint 12 at all** — it runs through a separate Python-capable service, not the Worker; only Sprint 11 (accounts) is a real prerequisite. Smashrun/Strava need *a* Worker, but not necessarily Sprint 12's specific one — Sprint 16 (Smashrun) could stand one up itself, ahead of Sprint 12. Provider tokens/passwords **must never** touch browser storage or sync (PRD FR-9.7). The **tapiriik spike** (§15.4) is done and it is **disqualified twice over** — measured 2026-07-30, not inferred: (a) it never downloads a TCX at all (`DownloadActivity` fetches JSON and reconstructs), and (b) its login omits the `_csrf` field Garmin's form now requires. Don't build on it and don't recommend it for Garmin. The **full local Docker install was deliberately skipped and is still owed** (§15.4) — nothing recorded is a claim about the running app, only its source. Sprint 15's primary design is now **fetch Garmin's original TCX** via `download_activity(id, dl_fmt=TCX)` and reuse `parseTcx` unchanged, so parsing stays in one place — **verified end-to-end on a real account 2026-07-30**: distance, duration, laps, HR, power and start time all matched Garmin's own summary exactly, with zero parser changes. Two things to carry into the build: Garmin's TCX stores **single-leg** cadence in namespaced `ns3:` extensions (FR-1.4's doubling is load-bearing, not theoretical), and **login gets 429-rate-limited** — the library's multi-strategy fallback is what got through, so treat 429 as a normal recoverable state (FR-9.8) and throttle bulk backfill. **Never commit a real Garmin TCX as a test fixture** — they contain the runner's home-area GPS trace.

Ongoing risks in [§16](docs/dev-plan.md) — deferred items (GPX parser, chat-history summary); Hebrew output is confirmed working.
