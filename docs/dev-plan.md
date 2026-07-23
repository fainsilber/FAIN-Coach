# FAIN Coach — Development Plan (v1.3)

Supersedes the PRD roadmap. Decisions from 2026-07-21; v1.2 added local
profiles and the account-migration path; **v1.3 (2026-07-22)** records
sprints 1–5 as shipped, the GitHub Pages deployment, the revised model
tiering, and specifies **Sprint 6 — Localization & Units** (§9).

**Status:** MVP complete and deployed — https://fainsilber.github.io/FAIN-Coach/

**Next up:** Sprint 6 — Units & Week Start (§8), then Sprint 7 — Multi-language
with Hebrew/RTL (§9). Both specified, neither started.

---

## 1. Locked Decisions

| Topic | Decision |
|---|---|
| Framework | Vite + React 18 + TypeScript (SPA, static hosting) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Storage | Dexie.js + `dexie-react-hooks` |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts — **lap-level only**, trackpoints discarded after aggregation |
| Testing | Vitest (parser + summarizer are the mandatory test targets) |
| API key | BYO OpenRouter key stored in IndexedDB (MVP); swappable transport layer for future proxy backend (undecided) |
| Chat | **One global coach thread**, plan-aware. No per-run threads |
| MVP scope | Post-run coaching + multi-week plan generation & tracking |
| Reset | Two actions: (a) archive plan + start new, (b) full wipe (runs, plans, chat) |
| Run↔plan matching | Auto-match by date/type, then confirm with user ("Was this your planned tempo run?") |
| Subjective input | RPE 1–10 + feel tags (legs, sleep, soreness) + free-text notes |
| Multi-user (v1.2) | Local device profiles: one Dexie DB per profile, reload-on-switch, optional hashed PIN. No server auth in MVP; Dexie Cloud is the upgrade path (§7) |
| Hosting (v1.3) | GitHub Pages, static, deployed by Actions on push to `main`. Project subpath `/FAIN-Coach/` — Vite `base`, router `basename`, PWA scope, and a `404.html` SPA fallback must stay in agreement |
| Model defaults (v1.3) | Chat **and** plans default to Llama 3.3 70B (instruct). The PRD's "reasoning tier" for plans was tested and rejected on latency; R1/QwQ remain user-selectable |
| Language & units (v1.3) | English + Hebrew (RTL) at launch, extensible; metric default with imperial option. Per profile. Storage stays SI — conversion at the display boundary only |
| Week start (v1.3) | Defaults to **Sunday** (deliberately not ISO 8601), switchable to Monday in Settings. Per profile, independent of language |

## 2. Deviations from PRD v1.0

1. **`chatHistory` removed from `RunRecord`** — global thread lives in its own table.
2. **No trackpoint storage** — charts are lap-based; parser computes aggregates and drops the time series. NFR "telemetry charts" reinterpreted as lap charts.
3. **1,000-token budget applies to post-run chat only.** Plan generation (reasoning tier) gets a larger, structured context budget (~3–4k tokens: goal, weeks remaining, recent load summary, adherence stats).
4. **New tables**: `TrainingPlan`, `PlannedWorkout`, `ChatMessage`, `Settings`.

## 3. Data Schema (Dexie v1)

```typescript
interface RunRecord {
  id?: number;
  date: string;                    // ISO, indexed
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;             // normalized SPM
  avgPower?: number;
  laps: LapSplit[];
  rpe?: number;                    // 1-10
  feelTags?: string[];             // 'legs-heavy' | 'slept-poorly' | 'sore' | ...
  userNotes?: string;
  plannedWorkoutId?: number;       // link after confirmation
  matchStatus: 'unmatched' | 'suggested' | 'confirmed' | 'unplanned';
}

interface LapSplit {
  lapIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
}

interface TrainingPlan {
  id?: number;
  createdAt: string;
  status: 'active' | 'archived';
  goal: string;                    // e.g. "Sub-50 10k on 2026-10-04"
  weeks: number;
  generationContext: string;       // what was sent to the LLM (auditability)
}

interface PlannedWorkout {
  id?: number;
  planId: number;                  // indexed
  date: string;                    // indexed
  type: 'easy' | 'tempo' | 'intervals' | 'long' | 'rest' | 'race';
  description: string;
  targetDistanceMeters?: number;
  targetDurationSeconds?: number;
  status: 'pending' | 'completed' | 'missed' | 'skipped';
}

interface ChatMessage {
  id?: number;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  planId?: number;                 // which plan era it belongs to
}

interface Settings {
  key: string;                     // 'openrouterApiKey' | 'fastModel' | 'reasoningModel'
  value: string;
}
```

## 4. Architecture Notes

- **LLM transport abstraction**: single `LlmClient` interface (`chat(messages, model, stream)`). MVP implementation: direct `fetch` to OpenRouter with local key. Future proxy = second implementation, zero UI changes.
- **Prompt pipeline** (pure functions, unit-testable):
  - `summarizeRun(run): string` — macro summary, no trackpoints, ≤ ~600 tokens.
  - `buildCoachContext(plan, recentRuns, adherence): string` — plan-aware system context.
  - `buildPlanRequest(goalInput, history): string` — reasoning-tier prompt.
- **System prompt contract** enforces the 3-step layout (Big Picture / Telemetry Breakdown / Next Step) and "never mention absent metrics" — enforced by listing *only present metrics* in the summary, not by trusting the model.
- **Auto-match algorithm**: nearest `PlannedWorkout` within ±1 day of run date, tie-break by type similarity (distance/duration proximity). Always confirmed by user before linking.

## 5. Sprints

**All of Sprints 1–5 are complete** (2026-07-22). Outcomes and deviations are
noted per sprint below; the test suite stands at **78 passing**.

### Sprint 1 — Foundation & Parsing Engine ✅
- Vite + React + TS scaffold, Tailwind, shadcn/ui, routing shell.
- Dexie schema v1 (all 6 tables) + typed DB module.
- TCX parser: DOMParser, namespace handling (`ns3:TPX`/`ns3:LX`), optional-metric defensiveness, cadence ×2 normalization (<120), lap aggregation, trackpoint discard.
- Vitest suite: fixture TCX files (Garmin, Coros, missing-HR, missing-cadence, corrupt XML).
- Upload UI: drag-and-drop + file picker → parse → save → post-run form (RPE, feel tags, notes).
- **Exit criteria**: 10MB TCX parses + persists < 50ms; all fixtures green.
- **Outcome**: met. Primary fixture is a real 5.5 MB Garmin half-marathon export
  (22 laps, 7,441 trackpoints) → ~3 KB stored record. Parser resolves extension
  elements by *localName*, so non-Garmin namespace prefixes work; lap distance
  and max-HR fall back to trackpoint aggregation when a lap omits them.

### Sprint 2 — History, Dashboard & Data Portability ✅
- Run history list (date, distance, pace, RPE badge).
- Run detail: lap table + lap-level charts (pace/HR/cadence per lap).
- JSON export/import (full DB dump, versioned envelope).
- Settings page: API key entry (stored locally, masked), model pickers.
- **Exit criteria**: full offline browse of history; export→wipe→import round-trips losslessly.
- **Outcome**: met, verified live (export → wipe → re-import through the real
  file input, ids and cross-table links preserved). Charts are lap-level bars
  with a single series per metric, rendered only for metrics present in the run.

### Sprint 3 — Coach Chat & Prompt Pipeline ✅
- `LlmClient` + OpenRouter implementation with streaming (SSE).
- `summarizeRun` + token-budget guard + unit tests.
- Global chat UI: streaming responses, run summary auto-injected after upload, 3-step layout system prompt.
- Error handling: invalid key, rate limits, offline state ("chat needs network" banner).
- **Exit criteria**: upload → confirm → coached response referencing only present metrics, < 1k tokens sent.
- **Outcome**: met — a real post-run exchange sent ~169 tokens; a plan-aware one
  ~488. Client also surfaces reasoning-model "thinking" tokens and aborts on an
  idle stream (240 s for plans, 90 s for chat).

### Sprint 4 — Training Plans & Matching ✅
- Plan creation wizard (goal race, date, current weekly volume, days/week).
- `buildPlanRequest` → reasoning-tier call → parse structured plan JSON → persist `PlannedWorkout` rows.
- Calendar/week view of the plan; workout status tracking.
- Auto-match + confirmation dialog on upload ("Looks like Tuesday's tempo — correct?"), manual re-link.
- Adherence summary fed into coach context.
- Reset actions: archive-plan-and-restart; full wipe (with confirm + export prompt).
- **Exit criteria**: end-to-end: create plan → upload run → auto-match confirm → coach references plan progress.
- **Outcome**: met end-to-end. Note the sprint text says "reasoning-tier call" —
  superseded, see §1 and PRD §3.1.

### Sprint 5 — PWA & Polish ✅
- Service worker precache, offline app shell, install prompt.
- `navigator.storage.persist()` request + storage-usage indicator.
- Mobile layout audit (touch targets, chat on small screens).
- Cross-device TCX compatibility pass (Garmin/Coros/Apple/Suunto exports).
- **Exit criteria**: Lighthouse PWA installable; full offline function except LLM calls.
- **Outcome**: met. Service worker active with the app shell precached;
  installable manifest; storage usage/persistence indicator in Settings.
  Recharts code-split into the run-detail route (main bundle 741 KB → 356 KB).
  Coach context also gained the upcoming week's actual planned workouts, which
  stopped the model inventing a weekly schedule when asked "what's next?".
- **Not done**: cross-device TCX compatibility pass beyond Garmin. Apple Watch
  exports GPX natively (see §10); Coros/Suunto covered only by a synthetic
  fixture, not a real export.

## 5a. Deployment (2026-07-22)

Static hosting on **GitHub Pages**, built and published by
`.github/workflows/deploy.yml` on every push to `main`.

- The repo had to be made **public** — GitHub's free plan does not serve Pages
  from private repos. (Netlify/Cloudflare Pages would have avoided this; both
  build from private repos on their free tiers and serve at a root domain.)
- **Subpath coupling**: the site is served from `/FAIN-Coach/`, so Vite `base`,
  React Router `basename` (from `import.meta.env.BASE_URL`), the PWA
  `scope`/`start_url`, and `public/404.html` must all agree. Changing host
  (e.g. to Cloudflare at a root domain) means reverting `base` to `/`.
- **Gotcha for local testing**: `vite preview` runs with Vite's
  `command === 'serve'`, so the config keys the subpath off
  `command === 'build' || isPreview`. Without that, preview serves at `/` while
  the built assets reference `/FAIN-Coach/`, producing confusing 404s.

## 6. Profiles & Multi-User (implemented 2026-07-22)

Requirement added after Sprint 2: multiple runners per device, each seeing only
their own data (PRD §4.4).

**Design (chosen to keep the Dexie Cloud path cheap):**

- **One database per profile** (`FainCoachDB-<profileId>`), *not* a `userId`
  column on every table. Queries and schema stay untouched; isolation is by
  database. The pre-profile database (`FainCoachDB`) is adopted as the
  "Default" profile on first launch so existing data survives.
- **Profile registry in `localStorage`** (`fain-coach.profiles` +
  `fain-coach.activeProfileId`): id, name, dbName, createdAt, optional
  salted-SHA-256 PIN hash. PIN is a deterrent, not encryption — stated in the
  UI and PRD.
- **Reload-on-switch:** the `db` singleton binds to the active profile's
  database at module load; entering/leaving a profile reloads the app. No
  component changes; same shape as a future "switch account".
- Backups (export/import) operate on the active profile only.

## 7. Future: Real Accounts via Dexie Cloud (deferred)

Decision 2026-07-22: local profiles are sufficient for now. When real
authentication, server-enforced isolation, or multi-device sync is needed,
migrate to **Dexie Cloud** (~2–4 days):

1. Add `dexie-cloud-addon`; mark synced tables; wire login (email OTP). The
   profile picker becomes the account screen.
2. **Id remap** (main cost): local auto-increment number ids → globally unique
   string ids; rewrite `run.plannedWorkoutId`, `plannedWorkout.planId`,
   `chatMessage.planId` during a one-time per-profile import (reuses the
   backup/import machinery).
3. Keep the OpenRouter API key in an **unsynced, device-local** table — the
   key must not roam through the sync service.
4. Test offline conflict scenarios (two devices, archive vs upload).

## 8. Sprint 6 — Units & Week Start (specified, not started)

Implements the preference half of PRD §4.5 — **measurement units**
(FR-5.7 – 5.10) and **week start** (FR-5.12 – 5.14). Language and RTL are
Sprint 7 (§9).

**Why this splits cleanly from language:** neither depends on any i18n
infrastructure. Both are per-profile preferences that change formatting and
week math, so this sprint ships user-visible value without touching a single
string catalog. Doing it first also means the i18n sprint has a stable
formatting layer to translate around, rather than both moving at once.

### 8.1 Settings & schema

No new tables. Two rows in the existing `settings` store, so they ride along in
backup export/import for free:

```typescript
// Settings.key additions (Sprint 6)
'unitSystem'  // 'metric' | 'imperial'        (default 'metric')
'weekStart'   // 'sunday' | 'monday'          (default 'sunday')
// 'language' arrives in Sprint 7
```

`weekStart` is deliberately **independent of language** (FR-5.14) — running the
UI in English while keeping a Sunday week is a legitimate combination. That
independence is also what lets this sprint land before any language work
exists.

UI: a new **Preferences** group on the Settings page, alongside the existing
AI/Data/Storage groups.

### 8.2 Units

- Canonical storage stays SI (FR-5.8). Add `src/lib/units.ts` with a single
  conversion boundary; `src/lib/format.ts` becomes unit-aware
  (`formatDistance`, `formatPace`, `formatElevation`).
- Conversions: 1 mi = 1609.344 m; 1 ft = 0.3048 m. Pace inverts with distance
  (min/km ↔ min/mile) — a frequent source of bugs, so unit-test the round trip.
- Do **not** convert bpm / spm / watts (FR-5.9).
- Entry points needing unit awareness: plan wizard weekly volume, chart axis
  labels and tooltips, lap table headers, stat grids, run history rows.

### 8.3 Week start (FR-5.12 – 5.14)

**Default changes to Sunday**, with a Settings control to switch to Monday.

- Current code hard-codes Monday: `isoWeekLabel()` in `PlanPage.tsx` computes
  `(d.getUTCDay() + 6) % 7` days back to reach Monday. For a Sunday start that
  becomes simply `d.getUTCDay()`. Generalize to an offset derived from the
  preference rather than branching at each call site.
- **Rename the helper.** "ISO week" specifically *means* Monday-start
  (ISO 8601); once it is configurable the name is a lie. Something like
  `startOfWeek(date, weekStart)` / `weekLabel(...)` in a shared module — the
  plan view should not own week math that other features need.
- **Apply everywhere a week is derived** (FR-5.13), not just the plan calendar:
  week grouping in the plan view, any weekly volume aggregation, and the
  "coming week" window that `buildCoachContext` sends to the model. If these
  disagree, adherence and coaching will quietly reference different weeks.
- Because it changes how existing plans are grouped visually, verify a plan
  generated before the switch still renders sensibly after it — grouping is
  derived at render time, so no migration is needed, but the week boundaries
  in an existing plan will shift by a day.
- Note this makes the default non-ISO. That is intentional and user-driven;
  record it so nobody "fixes" it back to Monday later.

### 8.4 LLM implications (units only)

- `summarizeRun` must emit distances in the user's units, and
  `buildCoachContext` / `buildPlanRequest` must state the unit system, so
  replies come back in the same units (FR-5.10).
- The plan wizard's weekly-volume field is km under metric and miles under
  imperial; `buildPlanRequest` must send the value **with its unit** so the
  model doesn't misread 16 miles as 16 km.
- Plan JSON keeps `targetDistanceMeters` in metres regardless of display units
  — the schema is canonical, the UI converts.

### 8.5 Exit criteria

- Switching to imperial changes every displayed distance, pace, and elevation,
  and **zero** stored values change (verify by export-diffing before and after).
- Heart rate, cadence, and power are untouched by the unit switch.
- Pace conversion round-trips in unit tests (min/km ↔ min/mile).
- Week grouping defaults to Sunday, switches to Monday from Settings, and the
  plan view, weekly totals, and the coach's "coming week" window all agree on
  the same boundaries.
- Prompts carry the user's unit system and coaching replies use it.

## 9. Sprint 7 — Multi-language (English + Hebrew, RTL)

Implements the language half of PRD §4.5 (FR-5.1 – 5.6, FR-5.11). Depends on
Sprint 6 only in that the formatting layer should be settled first.

### 9.1 Language setting & the profile-gate problem

```typescript
'language'    // 'en' | 'he'   (default: detected, else 'en')
```

**Chicken-and-egg:** the profile picker renders *before* any profile is active,
so it cannot read profile settings. Language therefore needs a device-level
fallback in `localStorage` (`fain-coach.language`), seeded from
`navigator.languages` on first run and rewritten whenever a profile's language
changes. Profile setting wins once a profile is entered. (Units and week start
have no such problem — nothing before the gate displays a distance.)

### 9.2 i18n mechanism

**Decision: a small in-house module, not a framework.** Rationale: ~100 strings,
an offline-first PWA where every KB is precached, and the browser already
provides the hard parts — `Intl.NumberFormat`, `Intl.DateTimeFormat`,
`Intl.PluralRules` (which handles Hebrew's singular/dual/plural correctly).
Revisit `react-i18next` if the catalog outgrows a few hundred keys or
translators need standard tooling.

- `src/i18n/en.ts`, `src/i18n/he.ts` — flat message catalogs.
- `en` is the source of truth; the `he` catalog is typed as
  `Record<keyof typeof en, string>` so a missing translation is a **compile
  error**, not a runtime blank.
- `useT()` hook returns a `t(key, params?)` with typed keys and `{name}`-style
  interpolation.
- Missing-key behaviour: fall back to English, never render a raw key.

### 9.3 RTL

- Set `dir` and `lang` on `<html>` when language changes (also update the PWA
  manifest `lang`/`dir`).
- **Audit every physical-direction utility** and replace with logical ones:
  `ml-auto` → `ms-auto` (chat bubbles), `text-left` → `text-start` (tables),
  `pl-*`/`pr-*` → `ps-*`/`pe-*`, and directional icons (`←` back links) must
  flip. Tailwind v4 supports the logical variants natively.
- **Bidi isolation (FR-5.3)**: numeric strings such as `5:48 /km`, `21.29 km`,
  and ISO dates get visually reordered when embedded in RTL text. Wrap them in
  `<bdi>` (or `unicode-bidi: isolate`). This is the single most likely source of
  "looks subtly wrong" bugs in Hebrew — treat as mandatory, not cosmetic.
- **Charts**: Recharts does not mirror automatically. Recommendation: keep the
  time axis left-to-right (time-series convention holds across locales) but move
  the Y axis to the right and mirror surrounding padding. Flag for a visual
  decision when implementing.
- Week start is a user preference, not an RTL concern — it ships in Sprint 6
  (§8.3) and needs no revisiting here.

### 9.4 LLM implications (language)

- `buildCoachContext` and `buildPlanRequest` must state the target language, so
  coaching arrives in it (FR-5.6). The unit half of this was already handled in
  Sprint 6 (§8.4).
- The enforced 3-step layout (FR-3.3) needs **localized headings** — the coach
  reply is presentational, but plan JSON is validated, so keep JSON **keys and
  enum values in English** (`"type": "tempo"`) and localize only the
  human-readable `description`. Translating enum values would break
  `parsePlanResponse`.
- **Risk — Hebrew output quality**: Hebrew is comparatively low-resource, and
  the current default (Llama 3.3 70B) is untested on it. A/B Hebrew output
  before defaulting Hebrew users to it; some commercial models are markedly
  stronger on Hebrew, which may justify a per-language default model.

### 9.5 Exit criteria

- Switching to Hebrew flips the whole UI to RTL with no clipped or
  mis-aligned layout at 375 px, and no reordered numerals or paces.
- Coach replies arrive in the selected language, using the 3-step layout with
  localized headings, while generated plan JSON still validates.
- Type-check fails if a Hebrew string is missing.
- Language survives a reload and applies to the profile picker itself.

## 10. Risks / Open Questions

- ~~Coach context should include the upcoming week's actual planned
  workouts~~ — **resolved in Sprint 5** (2026-07-22): `buildCoachContext`
  now lists the next 7 days of pending workouts with an explicit
  "do not invent a schedule" instruction; verified live.
- ~~DeepSeek R1 plan generation is slow~~ — **resolved 2026-07-22.** A/B tested
  R1 vs Llama 3.3 70B on identical inputs. The "reasoning tier" assumption from
  the PRD did not hold: once the prompt states taper and per-type pace rules
  explicitly, an instruct model produces an equally sound plan (better taper,
  correct paces) in 67s vs R1's 267s. **Default plan model is now Llama 3.3
  70B**; R1 remains selectable for richer workout descriptions.
  - Lesson recorded: weaker models read prompts *literally*. "Taper before the
    race" → scheduled nothing at all that week; "state a pace derived from the
    goal" → put every easy run at race pace. Prompt ambiguity is a safety
    issue, not just a quality one. Both rules are now explicit.
- **Remaining plan-quality nit**: Llama occasionally jumps weekly volume ~49%
  in one step, violating the stated ~10%/week rule. Candidate fix: state the
  cap as an explicit per-week ceiling rather than a percentage.
- **Transient OpenRouter connection failures** (~1 in 3 requests in live
  testing) now auto-retry up to 3 attempts with backoff — connection phase
  only, never once tokens have streamed, so output can't duplicate.

- ~~Plan JSON reliability~~ — **resolved in Sprint 4**: fence/prose-tolerant
  extraction, per-field validation, and one automatic retry with the validation
  error fed back. No malformed response has survived to the user in testing.
- **Apple Watch exports**: Apple exports GPX natively, TCX only via third-party apps — may need a GPX parser later (P2, design parser interface to allow it). Still open; `parseTcx` returns a `ParsedRun` so a `parseGpx` sibling can slot in behind the same contract.
- **Token estimation**: no tokenizer in-browser for arbitrary models → use chars/4 heuristic with safety margin. Still in use; measured sends (169–488 tokens) sit far enough under the 1k budget that precision hasn't mattered yet.
- **Chat history growth**: `capMessages` drops oldest-first to stay in budget. A rolling summary of dropped turns is **still not implemented** — long threads silently lose early context. P2.
- **Hebrew LLM quality** (new, Sprint 6): the default model is untested on Hebrew output; may need a per-language default. See §8.5.
- **Node 20 deprecation warning** in the Pages workflow: `actions/checkout@v4`
  and friends target Node 20 and are force-run on Node 24. Cosmetic today,
  will need action-version bumps eventually.
