# FAIN Coach — Development Plan (v2.2)

Supersedes the PRD roadmap. Decisions from 2026-07-21; v1.2 added local
profiles and the account-migration path; v1.3 (2026-07-22) recorded sprints
1–5 as shipped, the GitHub Pages deployment, and the revised model tiering;
v1.4 recorded Sprints 6–7 as shipped; v1.5 added Sprint 8 and the Sprint 9
placeholder; v1.6 recorded Sprint 8 as shipped; v1.7 specified Sprints 10–12
(the paid hosted tier, §12, economics in [monetization.md](monetization.md));
v1.8 specified Sprint 13 (shoe tracking); v1.9 specified Sprint 14
(diagnostics); v2.0 specified Sprints 15–17 (provider import, plus a tapiriik
evaluation); v2.1 (2026-07-26) recorded **Sprint 14 — Version Visibility &
Diagnostics** as shipped; **v2.2 (2026-07-26)** records **Sprint 13 — Shoe
Tracking** as shipped.

**Status:** Sprints 1–8, 13, and 14 complete and deployed —
https://fainsilber.github.io/FAIN-Coach/. 162 tests passing.

**Next up.** One standalone track, then two dependent chains:

| | Sprint(s) | Notes |
|---|---|---|
| Standalone | **9** (§11) design refresh | Awaiting a design direction |
| **Chain** | **10 → 11 → 12** (§12) paid hosted tier | Build in order |
| **Chain** | **15 → 16 → (17)** (§15) Strava, then Garmin, optionally Smashrun | **Requires 10–12 first** — a frontend-only PWA cannot do these integrations. Run the tapiriik spike (§15.4) *before* 16 |

Ongoing risks are in §16 — none blocking.

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

- **LLM transport abstraction**: single `LlmClient` interface (`chat(messages, model, onToken?, options?)`). MVP implementation (`OpenRouterClient`): direct `fetch` to OpenRouter with a local key, SSE streaming, connection-phase retry, idle-timeout abort. Future proxy = second implementation, zero UI changes.
- **Prompt pipeline** (pure functions, unit-testable, all take `unit: UnitSystem` and `language: PromptLanguage` parameters — see §8/§9):
  - `summarizeRun(run, unit)` — macro summary, no trackpoints, ≤ ~600 tokens.
  - `buildCoachContext(plan, recentRuns, adherence, upcomingWorkouts, unit, language)` — plan-aware system context; upcoming workouts are a rolling next-7-days window, not a calendar week (see §8 deviation note).
  - `buildPlanRequest(goalInput, history, today, unit, language)` — plan-generation prompt. "Reasoning-tier" language is retired (§3.1 in the PRD) — the default model is an instruct model; nothing about the prompt requires reasoning specifically.
- **System prompt contract** (`coachSystemPrompt(language)`) enforces the 3-step layout (Big Picture / Telemetry Breakdown / Next Step, localized headings in Hebrew) and "never mention absent metrics" — enforced by listing *only present metrics* in the summary, not by trusting the model.
- **Auto-match algorithm**: nearest `PlannedWorkout` within ±1 day of run date, tie-break by type similarity (distance/duration proximity). Always confirmed by user before linking.

## 5. Sprints

**All of Sprints 1–5 are complete** (2026-07-22; Sprints 6–7 followed on
2026-07-23, see §8–§9). Outcomes and deviations are noted per sprint below.

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
  exports GPX natively (see §16); Coros/Suunto covered only by a synthetic
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

## 8. Sprint 6 — Units & Week Start ✅ (implemented 2026-07-23)

**Outcome**: met. Verified in-browser — switching to imperial turned 21.29 km
into 13.23 mi, 5:48/km into 9:21/mi, lap 1000 m into 0.62 mi, and the chart
axis into min/mi, while HR/cadence/power were untouched and
`totalDistanceMeters` stayed exactly 21290.1. Week grouping splits Sat 25 Jul
from Sun 26 Jul under Sunday weeks and keeps them together under Monday weeks,
reacting live to a Settings save without a reload.

**Deviation from spec**: §8.3 said the coach's "coming week" window must use
`weekStart`. It is instead a rolling **next 7 days**, and the prompt now says
so explicitly rather than saying "the coming week". A calendar week would tell
a runner asking on Saturday about one remaining day; a rolling window is the
right answer to "what's next". Calendar weeks remain authoritative wherever the
UI says "week" (plan grouping, weekly volume).

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

## 9. Sprint 7 — Multi-language (English + Hebrew, RTL) ✅ (implemented 2026-07-23)

Implements the language half of PRD §4.5 (FR-5.1 – 5.6, FR-5.11).

**Outcome**: met. Verified in-browser at 375 px: switching to Hebrew flips
`<html dir="rtl" lang="he">`, the nav mirrors (History at the right edge),
every audited page renders Hebrew, numeric compounds ("21.29 km · 2:03:38 ·
5:48 /km") stay in LTR order via `dir="ltr"`/`<bdi>`, the lap table keeps LTR
column flow with Hebrew headers, and no horizontal scroll appears. The profile
gate itself renders Hebrew after a full reload via the device-level fallback.
Adding a language = one catalog file + one entry in `LANGUAGES`.
**Live-confirmed (2026-07-23)**: Hebrew plan generation produces a correct,
fully-Hebrew plan with the user's real key. Chat coaching uses the same
localized prompt path.

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

## 10. Sprint 8 — Manual Run Entry ✅ (implemented 2026-07-23)

Implements PRD §4.6 (FR-6.1 – 6.8). For runs with no `.tcx` — a failed watch
sync, a treadmill session, a run logged from memory.

**Outcome**: met. Verified in-browser — a run entered with only date, distance
and time stores the four optional metrics as **absent keys, not zeros**; the
date anchors to `2026-07-20T12:00:00.000Z`; 5 miles entered under imperial
stores as exactly 8046.72 m; auto-match linked the run and flipped the planned
workout to `completed`, identical to the upload path; and run detail renders
with **zero tables and zero orphan headers** when there are no laps. The TCX
path was re-verified after the refactor (22 laps, `source: 'tcx'`).

**Beyond spec** (worth noting, both fell out of the shared-path work):
- `saveRunAndPromptCoach` now owns the whole write path for *both* entry
  methods, so the run-save, workout-completion and coach-injection sequence
  cannot drift between them.
- The coach message wrapper ("I just finished a run…") had been hard-coded
  English since Sprint 3 — it is a visible chat bubble, so it is now localized
  along with the new strings.

**Scope call**: run-level totals only, **no lap entry**. A lap repeater is a
lot of form for a rare need, and manual runs simply have no lap breakdown —
which the app already handles, because charts render per present metric. If
someone wants splits they have a watch file. Revisit only if asked.

### 10.1 Schema

```typescript
interface RunRecord {
  // …existing fields…
  source?: 'tcx' | 'manual';   // absent = 'tcx' (all pre-Sprint-8 records)
}
```

Optional and **not indexed**, so this needs **no Dexie version bump and no
migration** — Dexie's schema declares indexes, not fields. Existing records
read as `undefined` and are treated as `'tcx'`.

An empty `laps: []` would *technically* discriminate manual runs (the parser
throws if a TCX has no laps), but that is an implicit coupling; an explicit
field is honest and enables FR-6.7.

### 10.2 Form design

New route `/upload/manual`, reached from a secondary action under the Upload
dropzone ("or enter a run manually"). A separate route rather than a third
state inside `UploadPage`, which already juggles idle/review — and it makes
the screen deep-linkable.

- **Mandatory**: date, distance, duration.
- **Optional**: avg HR, max HR, avg cadence, avg power — plus RPE, feel tags
  and notes, which come free by **reusing `PostRunForm`**.
- **Duration**: three numeric inputs (h / m / s), not a single "minutes" box
  and not a parsed text field. Unambiguous, and mobile shows numeric keypads.
- **Distance** is entered in the user's units and converted with `toMeters()`
  on save (FR-5.5/6.5). This is exactly the trap from Sprint 6's plan wizard —
  a bare number whose meaning changes with a setting.
- **Pace is never an input** (FR-6.5); it is derived, and showing a live
  computed pace as the user types is good feedback that the numbers are sane.
- **Date** stored as ISO. With no time-of-day given, anchor to **noon UTC**
  (`YYYY-MM-DDT12:00:00.000Z`) — the same trick `week.ts` uses to stop a date
  shifting across a timezone boundary.

### 10.3 Validation

Reject nonsense, but don't be precious about it:

- distance > 0; duration > 0; date not in the future.
- If present: HR 30–250, cadence 0–300 spm, power 0–2000 W, RPE 1–10.
- **Cross-field**: max HR must be ≥ avg HR when both are given. The one check
  that catches a real transposition mistake.
- Empty optional field → the key is **omitted entirely**, never `0`
  (FR-6.4). Same guarantee the parser makes; worth an explicit test.

### 10.4 Reuse & integration

Manual runs must be indistinguishable downstream (FR-6.6):

- **Extract the match-confirm UI** out of `UploadPage` into a shared component
  so both entry paths use one implementation of "Looks like your planned
  tempo — was it?". Auto-match runs through the same `findMatchCandidate`.
- Same post-save flow: inject the run summary into the coach thread and
  navigate to chat.
- **`summarizeRun` marks self-reported data** (FR-6.7) — e.g. a
  "(manually entered)" note — so the coach weights an estimated heart rate
  appropriately. Consistent with the app's refusal to invent metrics.
- **Run detail must hide the lap table when `laps` is empty.** Today it would
  render a header row over an empty body. Charts already no-op correctly.
- All new strings go in both catalogs; a missing Hebrew entry fails the build.

### 10.5 Exit criteria

- A run with only date + distance + duration saves and appears in history.
- Omitted optional metrics are absent from the stored record (verify by
  export) and are never mentioned by the coach.
- Distance entered under imperial stores the correct metres — check by
  switching units and confirming the displayed value round-trips.
- Auto-match, coach injection, and backup export/import behave exactly as
  they do for an uploaded run.
- Run detail renders cleanly with no laps: no empty table, no broken charts.
- Type-check fails if a Hebrew string is missing.

## 11. Sprint 9 — Design Refresh (placeholder — intentionally unspecified)

Requested 2026-07-23. **Direction deliberately left open**: the design will be
provided when we get to it, rather than guessed at now.

Nothing here should be treated as a decision. Recording only what is already
true, so whoever picks this up starts informed:

- The UI is stock shadcn/ui "new-york" over Tailwind v4 with the neutral base
  palette; theme tokens live in `src/index.css` for both light and dark.
- Chart series colours are a separate, deliberately-chosen accessible palette
  (also in `src/index.css`) validated for colour-blind separation — those are
  not arbitrary and shouldn't be swapped casually.
- Any redesign inherits two hard constraints already met and easy to break:
  **RTL correctness** (logical properties only, bidi isolation on numerals —
  see §9.3) and **mobile ergonomics** (44px touch targets, 16px form inputs to
  stop iOS zoom, safe-area insets).

## 12. Sprints 10–12 — Paid Hosted Tier (a CONNECTED track, specified)

Requested 2026-07-23. Adds a paid "just works" tier — accounts + managed AI key
+ cloud backup + multi-device sync — alongside the unchanged free local tier.
Economics, pricing, and the abuse-cost analysis live in
[monetization.md](monetization.md).

**These three sprints are one deliverable split for shippability — do them in
order.** 10 unblocks 11 and 12 (they need a backend host and a root domain that
GitHub Pages can't give); 11 provides the accounts that 12's billing and
managed-key gating attach to. None of them is independently *useful* to a user
until 12 lands, but each is independently *shippable and testable*. Sprint 9
(design) is orthogonal and can happen any time.

**Architecture** (the payoff of two earlier decisions):
- The `LlmClient` interface (Sprint 3) means the paid transport is a new
  `ProxyClient` calling the Worker with a session token — **zero UI changes**.
- One database per profile (Sprint "Profiles") maps cleanly onto per-account
  Dexie Cloud databases.

```
Cloudflare Pages ── static frontend (root domain, no /FAIN-Coach/ base)
      ├─► Dexie Cloud ── email-OTP accounts + sync + cloud backup + isolation
      └─► Cloudflare Worker (the backend you own):
            /ai      → holds OpenRouter key; checks session + active sub;
                        enforces the per-user usage cap; proxies + streams
            /billing → checkout + webhook → marks subscription active/inactive
```

### 12.1 Sprint 10 — Move hosting to Cloudflare Pages

Low-risk, useful regardless, and unblocks 11–12.

**Revised 2026-07-27 (owner's call): keep BOTH deployments alive** rather than
retiring GitHub Pages. The base path therefore can't be a constant — the build
config branches on a `DEPLOY_TARGET` env var and CI produces two artifacts, each
with its own correct base/scope/manifest.

- `vite.config.ts` owns the switch: `DEPLOY_TARGET=cloudflare` → base `/`,
  `DEPLOY_TARGET=pages` → base `/FAIN-Coach/`. Everything downstream (router
  `basename` via `import.meta.env.BASE_URL`, PWA `scope`/`start_url`, precache
  manifest) derives from `base` — **never hard-code the subpath elsewhere.** An
  unrecognised value throws rather than silently defaulting, since a wrong base
  produces a build that looks fine and 404s on every asset.
- Per-target files in `public/` are stripped from the other target's build:
  `404.html` (the GitHub Pages SPA shim, whose `pathSegmentsToKeep=1` is wrong at
  a root domain) is Pages-only; `_redirects` (Cloudflare's native SPA fallback)
  is Cloudflare-only. The strip runs before the service worker is generated, so
  neither precache manifest ever references a file that isn't shipped.
- Scripts: `build:pages` / `build:cloudflare` (and matching `preview:*`), via
  `cross-env` so they work in PowerShell as well as bash.
- The repo can go **back to private** — Cloudflare builds private repos on the
  free tier (the reason it went public no longer applies).

> **The two deployments never share data.** They are different origins, so
> IndexedDB — profiles, runs, plans, chat — is separate per origin. They share
> code, not state. Crossing over means a manual backup export/import, or, once
> §12.2 lands, signing into the same account (opt-in, per account).

**Owner-configured, not in code** (Cloudflare project settings): build command
`npm run build:cloudflare`, output directory `dist`, Node 20. Credentials and
the Pages project itself are set up in the Cloudflare dashboard — nothing about
them is committed.

- **Exit**: both targets build clean with correct base/scope/manifest and no
  cross-contamination of target-only files; Pages deploy unaffected; Cloudflare
  live at a root URL with SW scope/deep-links/RTL re-verified.

**Status 2026-07-27**: build plumbing done and verified — Pages bundle registers
`/FAIN-Coach/sw.js` with `scope:"/FAIN-Coach/"`, Cloudflare bundle contains zero
occurrences of the subpath, each precache manifest matches what's on disk, a bad
`DEPLOY_TARGET` fails the build, 162 tests green, dev server unchanged at `/`.
**Remaining: the owner must create the Cloudflare Pages project** (account +
repo connection + DNS), which is the only step that can't be done from the repo.
The Cloudflare half of the exit criteria stays open until then.

### 12.2 Sprint 11 — Accounts + Sync + Cloud Backup (Dexie Cloud)

Delivers three of the four paid features; can ship **free at first** to prove
sync before any billing exists.

- Add `dexie-cloud-addon`; the profile picker becomes a login screen (email
  OTP). Local profiles remain for the free/offline tier.
- **Id remap** (the main cost, dev plan §7): local auto-increment ids → Dexie
  Cloud's global string ids; rewrite `run.plannedWorkoutId`,
  `plannedWorkout.planId`, `chatMessage.planId` during a one-time per-account
  import (reuses the backup/import machinery).
- **The API key must never sync** — free-tier BYO key stays device-local; paid
  users have no key locally at all (it lives only in the Worker). Mark
  `settings` (or just the key row) as an unsynced/local table.
- **Exit**: sign in on two devices, a run logged on one appears on the other;
  offline edits reconcile; the free local tier is untouched.

### 12.3 Sprint 12 — Managed AI Proxy + Billing + Gating

The tier people actually pay for.

- **Worker `/ai`**: authenticates the Dexie Cloud session, checks an active
  subscription, **enforces the per-user token cap** (monetization.md §3.2),
  forwards to OpenRouter with the server-held key, streams SSE back. Restrict to
  the **cheap managed model set** (§3.3) — premium models stay BYO-key only.
- **`ProxyClient implements LlmClient`**: the app picks transport by tier — BYO
  `OpenRouterClient` for free, `ProxyClient` for Pro. No component changes.
- **Billing**: subscription checkout + webhook marks the account active. Prefer
  a **Merchant of Record** (Lemon Squeezy/Paddle) over raw Stripe for tax
  reasons (monetization.md §6). **Credentials (OpenRouter key, billing keys,
  Dexie Cloud) are configured by the owner as Cloudflare secrets — never handled
  in code or committed.**
- **Gating + honesty**: show quota remaining; be explicit in-UI that Pro syncs
  through the cloud while Free stays fully local (monetization.md §7).
- **Exit**: a paid account chats/generates with no OpenRouter key of its own;
  the cap blocks a runaway; cancelling billing reverts the account to free.

### Pre-build checklist (from monetization.md §8)

Confirm before starting 12: current OpenRouter model rates, Dexie Cloud
pricing, tax approach (MoR vs Stripe), and the chosen usage cap. Pricing
recommendation: **$4/mo or $40/yr**, annual pushed to beat the Stripe fixed fee.

## 13. Sprint 13 — Shoe Tracking ✅ (implemented 2026-07-26)

Implements PRD §4.7 (FR-7.1 – 7.11). Register shoes, assign runs to them,
accumulate mileage, warn before the replacement threshold. **Independent of the
paid track (§12)** — build it whenever; no ordering constraint either way.

**Outcome**: met. Verified in-browser on a clean profile: created a shoe at
650/800km (81%, no badge), pushed a second to 94% (warn badge, "near limit")
and a third to 106% (over badge, "over limit"); manual-entry's shoe picker
correctly excluded the retired pair and defaulted to the most recently worn
active pair; re-linking a run on Run Detail moved 10km of mileage from one
pair to another with both totals updating live; retiring hid a pair from the
picker while keeping it visible (with its history) on the Shoes screen;
Hebrew rendered every new string correctly, including RTL badge/number
layout; and — captured by intercepting the `fetch` call to openrouter.ai —
the coach's system prompt included the exact line `the runner's "Warn Shoe"
running shoes are at 95% of their expected life — consider raising
replacement as a training-health point.` confirming FR-7.10 end-to-end. Full
suite: 162 tests passing (up from 145; +14 in `shoes.test.ts`, +3 in
`backup.test.ts` for v1-compat coverage, +1 in `prompts.test.ts` for the
alert line).

**Deviation from spec**: §13.1 originally called for `shoes: '++id, retired'`.
Booleans are not a valid IndexedDB key type, so indexing `retired` is invalid
— Dexie/browsers do not reliably support it as an index. The schema below is
corrected to drop that index; `retired` is filtered client-side everywhere it
matters (the shoe picker, the Shoes list, the coach's active-shoe lookup).
This is the same class of correction as Sprint 14's `registerType` fix (§14):
an assumption in the original spec that implementation revealed to be wrong,
fixed at the point of contact rather than left contradicting the shipped code.

### 13.1 Schema — this one DOES need a migration

Unlike Sprint 8's `source` field (unindexed, therefore free), **a new table and
a new index both require a Dexie version bump.** Declare v3 alongside v1/v2
(v2 was already taken by Sprint 14's `logs` table); Dexie runs the upgrade
automatically and existing data is untouched — there is nothing to backfill,
since every run simply has no shoe until assigned.

```typescript
this.version(1).stores({ /* …unchanged, keep it… */ });
this.version(2).stores({ logs: '++id, at' }); // Sprint 14
this.version(3).stores({
  runs: '++id, date, matchStatus, plannedWorkoutId, shoeId', // + shoeId index
  shoes: '++id', // no `retired` index — booleans are not a valid IDB key type
});

interface Shoe {
  id?: number;
  name: string;                    // "Pegasus 40 — blue"
  brand?: string;
  purchasedAt?: string;            // ISO date
  initialDistanceMeters: number;   // for shoes already part-worn when added; 0 default
  retirementDistanceMeters: number; // default 800_000 (≈800 km / 500 mi)
  retired: boolean;                // filtered client-side, not indexed (see deviation note above)
}

interface RunRecord {
  // …existing…
  shoeId?: number;                 // absent = no shoe recorded (valid)
}
```

`shoeId` is indexed because "all runs in these shoes" is the core query.
`retired` is a boolean and cannot be indexed; every consumer (picker, list,
coach lookup) filters it client-side after loading the (small) shoes table.

### 13.2 Mileage is derived, never stored (FR-7.4)

`shoeMileage(shoeId) = initialDistanceMeters + Σ(runs where shoeId).totalDistanceMeters`

A stored counter would drift the moment a run is deleted or re-assigned — this is
the same "one source of truth" reasoning that keeps pace derived from distance
and time (§10). Put it in `src/lib/shoes.ts` as pure functions over a run list so
the arithmetic is unit-testable without a database:

- `shoeMileage(shoe, runs)` → metres
- `shoeStatus(shoe, runs)` → `{ meters, remaining, percent, state: 'ok' | 'warn' | 'over' }`
  where `warn` is ≥90% and `over` is ≥100% (FR-7.6)

Advisory only — nothing in the save path may block on shoe state.

### 13.3 UI

- **New "Shoes" screen** (reachable from Settings rather than a sixth nav tab —
  the bottom bar is already full at five on a 375px screen). List each pair with
  mileage, a progress bar toward the threshold, and its state; add/edit/retire.
- **Assignment on save**: a shoe picker in the post-run form, used by **both**
  upload and manual entry (they already share `PostRunForm` and
  `saveRunAndPromptCoach`, so this lands in one place). **Default to the most
  recently used non-retired pair** — the common case is wearing the same shoes,
  and a default that's usually right beats an empty dropdown. Always includes an
  explicit "no shoes recorded" option (FR-7.2).
- **Run detail**: show the assigned pair, and allow changing it (the mileage
  recomputes automatically, which is the payoff of §13.2).
- **Retired pairs** are excluded from the picker but still shown on their old
  runs and on the Shoes screen (FR-7.7).
- **Deleting a pair**: prefer *retire* over delete. If deletion is offered, it
  must clear `shoeId` on affected runs rather than leaving them pointing at a
  missing row — never orphan a foreign key.
- Threshold entry and all distances are unit-aware and stored SI (FR-7.8) —
  reuse `toMeters()`/`formatDistance()`; the same trap as the plan wizard, where
  a bare number changes meaning with a setting.

### 13.4 Backup compatibility (FR-7.9)

Adding a table changes the envelope shape, so bump `BACKUP_SCHEMA_VERSION` to 2
**and keep importing v1 backups** — a v1 file simply has no `shoes` key, which
should be read as an empty list, not an error. Currently `parseBackup` rejects
any version ≠ 1; it needs to accept both. (A *new* backup imported into an
*older* build will still be refused, which is correct.)

### 13.5 Coach context (FR-7.10)

When the assigned pair is at `warn`/`over`, add one line to the coach context —
worn shoes are an injury-risk factor, so this is legitimate coaching input, not
trivia. One line only: the ≤1k-token chat budget is tight, and this must not
crowd out the run summary. Say nothing when no shoe is assigned (FR-3.4's
never-invent-a-metric rule applies here too).

### 13.6 Exit criteria — all met

- ✅ Register a pair, log runs against it, and its mileage equals the sum of
  those runs plus any starting mileage — verified live (650km start + a 10km
  run = 660km).
- ✅ Re-assigning a run to a different pair updates **both** totals with no
  stale values (verified: 660→650 and 750→760 in the same action); deleting
  reduces the total (unit-tested in `shoes.test.ts`).
- ✅ A pair crossing 90% warns and past 100% is clearly marked ("near limit" /
  "over limit"), and neither blocks saving a run.
- ✅ A retired pair disappears from the picker but keeps its history —
  verified both in the picker options and on the Shoes screen.
- ✅ Threshold entered under imperial stores the correct metres (covered by
  `units.ts` reuse; no new conversion path introduced).
- ✅ Export → wipe → import round-trips shoes *and* run assignments; a
  pre-Sprint-13 (v1) backup still imports — both covered by dedicated
  `backup.test.ts` cases.
- ✅ New strings in both catalogs; type-check fails if a Hebrew entry is
  missing (enforced by the existing `MessageKey`/`Record<MessageKey, string>`
  mechanism from §9.2).

## 14. Sprint 14 — Version Visibility & Diagnostics ✅ (implemented 2026-07-26)

Implements PRD §4.8 (FR-8.1 – 8.11). Two diagnostics problems in one sprint:
*"did my refresh actually update the app?"* and *"something broke on my phone
and I can't see why."* **Independent** of the other tracks.

**Outcome**: met. Verified in-browser — the About line showed
`v0.1.0 · a5b16b3 · built 2026-07-26 16:55`, and the embedded SHA was
byte-for-byte cross-checked against `git rev-parse --short HEAD` on the build
machine (matched). Forcing a corrupt-XML upload wrote a stable
`tcx.parse.failed` entry with the file size but not its content; Export
produced a readable file with the build identity as its header; Clear emptied
it; the live entry count updated without a reload. A follow-up backup-export
test confirmed no log content ever appears in a backup. Hebrew renders
correctly, including the SHA staying in Latin script inside an RTL sentence.

**Deviation from spec, and the actual root-cause fix**: §14.1 named
`registerType: 'autoUpdate'` as the culprit and an earlier draft of this
section assumed keeping it as a "silent fallback." That doesn't hold up:
`'autoUpdate'` makes Workbox reload the page **on its own** the moment a new
SW activates — it never calls `onNeedRefresh` at all, so there is no explicit
prompt to show. The real fix is switching to **`registerType: 'prompt'`**,
which is what makes `useRegisterSW`'s `needRefresh` fire instead of an
unannounced reload. Also required `injectRegister: false`, since the
auto-injected register script would otherwise register the SW a second time
alongside our explicit `useRegisterSW` call in `UpdateBanner`.

### 14.1 Why the update problem exists today

`vite.config.ts` sets `registerType: 'autoUpdate'`. Workbox fetches the new
service worker and activates it, **but the already-loaded page keeps running the
old JS until a reload** — and nothing tells the user either way. So a refresh
that *looks* like it did nothing may have updated, and one that *feels* updated
may not have. There is currently no build identity displayed anywhere, so the
question is unanswerable from inside the app. That is the whole bug.

### 14.2 Build identity (FR-8.1 – 8.2)

Inject at build time via Vite `define` — never hand-maintained:

```typescript
// vite.config.ts
define: {
  __APP_VERSION__: JSON.stringify(pkg.version),        // from package.json
  __GIT_SHA__: JSON.stringify(shortSha()),             // git rev-parse --short HEAD
  __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
}
```

- `shortSha()` must **not** break the build when git is unavailable (a clean
  tarball, some CI images) — fall back to `'unknown'` in a try/catch. In GitHub
  Actions the checkout provides git; `GITHUB_SHA` is also available.
- Declare the constants in `src/vite-env.d.ts` so TypeScript knows them.
- The **short SHA is the field that matters** — semver rarely changes per build,
  so it is the hash that tells two builds apart.
- Surface in Settings as a new **About** group: `v0.1.0 · a05753e ·
  built 2026-07-23 14:22`. Selectable text so it can be pasted into a bug report.

### 14.3 Update detection (FR-8.3 – 8.4)

Switch from silent auto-update to **explicit, visible** update using
`useRegisterSW` from `virtual:pwa-register/react`:

- `needRefresh` true → show a banner/button ("A new version is ready — reload").
- Calling `updateServiceWorker(true)` activates the waiting worker and reloads.
- **The proof loop**: after reload, the About line shows a different SHA. That is
  the answer to "did it actually update?", and it's why §14.2 must ship with this.
- Add a manual **"Check for updates"** action calling
  `registration.update()`, reporting either "update available" or "you're up to
  date" (FR-8.4) so a no-op is distinguishable from a failure.
- **`registerType` must actually change to `'prompt'`** (not stay
  `'autoUpdate'`) — see the outcome note above. `'autoUpdate'` never calls
  `onNeedRefresh`; it reloads unannounced, which is the exact silence this
  sprint exists to fix. Pair with `injectRegister: false` so the framework's
  auto-injected register script doesn't register the SW a second time
  alongside the explicit `useRegisterSW` call.

### 14.4 Diagnostics log (FR-8.5 – 8.11)

**Storage**: a bounded Dexie table, because a log that dies on reload is useless
for the crash that just happened (FR-8.6).

```typescript
// Dexie version bump — coordinate with Sprint 13 (§13.1), which also bumps.
// Sequential versions are fine; whichever lands second takes the next number.
this.version(N).stores({ logs: '++id, at' });

interface LogEntry {
  id?: number;
  at: string;                 // ISO
  level: 'info' | 'warn' | 'error';
  event: string;              // stable code, e.g. 'tcx.parse.failed'
  detail?: string;            // REDACTED metadata only — never user content
}
```

- **Bounded**: after each write, trim to the newest N (≈500 entries). Cheap, and
  it can never eat the storage quota the app warns about elsewhere.
- **What to log**: TCX parse failures (error message, file size — not contents),
  LLM failures (`LlmError.code`, model id, retry count), plan JSON validation
  failures, save/import failures, SW update events, unhandled errors and
  rejections. Successes worth one line each: run saved, plan generated (token
  count), update applied.
- **Redaction is mandatory and must be enforced in the writer** (FR-8.8), not
  left to each call site: strip anything matching an API-key shape (`sk-...`),
  and never pass chat content, run notes, or goal text. Log *metadata* — "chat
  request failed, code=rate-limit, model=llama-3.3-70b" — not the conversation.
  A redaction unit test is a required deliverable, not optional.
- **Never let the logger break the app** (FR-8.11): every write is fire-and-forget
  and swallows its own errors.
- **Export** (FR-8.7, 8.9): a plain-text/JSON download named
  `fain-coach-log-<date>.txt`, with the build identity from §14.2 as a header —
  a log without a version is much less useful. Offer the Web Share API on mobile
  where available (nicer than a download on a phone), falling back to download
  and copy-to-clipboard. Plus a **Clear log** action.
- **Not in backups** (FR-8.10): `exportBackup` must ignore the `logs` table, or a
  backup becomes a privacy liability and an import replays stale noise.

> **No auto-upload, by design.** There is no backend today, so "send" means the
> user exports and sends it deliberately. Once Sprint 12's Worker exists, an
> opt-in "upload diagnostics" endpoint becomes possible — but it stays opt-in
> and must show the payload first (FR-8.9).

### 14.5 Exit criteria — all met

- ✅ Settings shows version, short SHA, and build time — verified the embedded
  SHA matches `git rev-parse --short HEAD` exactly; two different builds will
  show different SHAs because the SHA is captured per-build, not hand-set.
- ⚠️ Update-prompt-then-reload was verified mechanically (registerType/hook
  wiring, build succeeds, no console errors) but **not end-to-end against two
  live deployed builds** in this pass — that needs two real Pages deploys to
  observe. "Check for updates" correctly reported `unsupported` in dev (no SW
  registered outside a production build), which is itself the correct,
  distinguishable-from-current behaviour FR-8.4 asks for.
- ✅ Forcing a failure (corrupt TCX) wrote `tcx.parse.failed` with the file size
  but not its content — a stable, useful event code.
- ✅ The log survives a reload (Dexie-backed), stays bounded (tested to 520
  writes → capped at 500, newest retained), and a redaction test proves an
  API-key-shaped string never reaches storage; a live/test check confirms
  `exportBackup()` never contains log entries.
- ✅ Export produces a readable file with the build identity in its header;
  clearing empties it — both verified live, including via Hebrew.
- ✅ A data backup contains no log entries (see above).
- ✅ New strings in both catalogs, type-checked.

**Follow-up, not blocking**: verify the reload-then-SHA-changes loop against
two consecutive real Cloudflare/GitHub Pages deployments once one is made —
straightforward to check next time two commits ship back to back, just not
something a single implementation pass can observe.

## 15. Sprints 15–16 — Provider Import (specified; DEPEND on §12)

Implements PRD §4.9 (FR-9.1 – 9.10). One provider per sprint, as they share
almost nothing: different auth, different API shape, very different risk.

> **Hard dependency: these require the backend from Sprints 10–12.** This is a
> frontend-only PWA today, and neither provider can be integrated from the
> browser alone (reasons below). They are *not* independent tracks like 13/14.

### 15.0 Shared design

- **A provider adapter contract, not a second parser.** `parseTcx` already
  returns `ParsedRun`; each provider gets an adapter producing the same shape
  from JSON instead of XML. Feature code, coaching, and matching stay untouched —
  the same reasoning that keeps a future GPX parser cheap (§16 risk note).
- **Dedupe (FR-9.3)** needs schema: extend `RunRecord.source` beyond
  `'tcx' | 'manual'` to include `'strava' | 'garmin'`, and add
  `externalId?: string` with a **compound unique index** on `[source+externalId]`
  so a re-import cannot duplicate. Another Dexie version bump — coordinate with
  §13/§14.
- **Tokens live server-side only (FR-9.7).** Nothing provider-secret touches
  IndexedDB or sync. The app holds only a "provider connected" flag.
- **Import is explicit (FR-9.4)**: pick a date range, preview the list, choose
  what to pull. No silent full-history sync.

### 15.1 Sprint 15 — Strava (do this one first)

The clean path: **official, free API**, no password handling, and — because
Garmin Connect can auto-forward activities to Strava — it covers many Garmin
users transitively (FR-9.10).

- **Why it still needs the Worker**: OAuth token exchange requires the client
  secret, which cannot ship in frontend code, and Strava's token endpoint is not
  browser-CORS-friendly. Worker routes: `/strava/connect`, `/strava/callback`
  (stores the refresh token against the account), `/strava/activities`.
- **Data mapping**: build the run from the activity summary plus the laps
  endpoint. Note Strava's public API does **not** expose the original FIT/TCX
  file, so there is no file to parse — the adapter maps JSON → lap aggregates.
  Metrics absent from Strava (often power, sometimes cadence) must stay
  **absent**, never zero — the existing FR-3.4/FR-6.4 guarantee.
- **Rate limits** *(verify current figures)*: roughly 100 requests / 15 min and
  1,000 / day for a default app — so batch, and surface a clear "try again
  shortly" state rather than failing opaquely (FR-9.8).
- **Exit**: connect an account, preview a date range, import runs that appear
  identically to uploaded ones; re-running the import adds nothing; disconnect
  revokes and stops imports while keeping imported runs.

### 15.2 Sprint 16 — Garmin Connect (unofficial route; read the caveats)

Garmin's official API is a **paid, approval-gated programme**, which is why the
practical route is an unofficial client (the `garminconnect` / `garth` Python
libraries). That works consistently in practice, but it carries three costs that
must be accepted deliberately, not discovered later:

1. **It needs the user's Garmin email and password.** There is no OAuth. That is
   a materially different security posture from Strava, and it sits awkwardly
   with this app's privacy positioning. Mitigations: credentials are used
   server-side only to establish a session, **never stored in the browser or in
   sync**, ideally exchanged for a session token and the password discarded
   immediately. Disclose prominently before the user types anything (FR-9.9).
2. **It is unofficial**: it can break without notice when Garmin changes their
   SSO flow, and it may conflict with Garmin's terms of service. Ship it marked
   as unofficial/best-effort.
3. **It cannot run on Cloudflare Workers.** Workers are JS/WASM; that Python
   dependency tree isn't viable there. This sprint therefore adds a **second,
   Python-capable service** (Fly.io / Railway / Cloud Run) — a real infrastructure
   and cost addition beyond §12, and the main reason Strava should come first.
   *(A JS reimplementation of garth would avoid the extra service but is less
   maintained — evaluate before committing.)*

- **Data mapping**: Garmin activity + splits JSON → the same `ParsedRun` shape.
  Garmin can also serve the original TCX/FIT, so an alternative is to fetch the
  TCX and reuse the **existing parser unchanged** — likely the least-code path,
  worth preferring if the download endpoint is reachable.
- **Exit**: same as Strava, plus: the disclosure appears before any credential
  entry, no credential or long-lived secret is ever written to browser storage,
  and a Garmin-side auth failure is reported as a recoverable state.

### 15.3 Sprint 17 — Smashrun (optional, low risk)

Smashrun has an **official OAuth2 REST API** *(verify current terms and whether
personal-use access is still free)*, so it is the same shape of work as Strava
and slots behind the same adapter contract — but for a much smaller user base.

- Same Worker-side OAuth pattern as §15.1; no new infrastructure.
- **Priority: low.** Do it only if there is actual user demand — the adapter
  contract means it stays cheap to add later, which is the point of §15.0.

### 15.4 Aggregators (tapiriik et al.) — an implementation strategy, not a provider

**[tapiriik](https://github.com/cpfair/tapiriik)** is an open-source Python
service that syncs workouts *between* fitness platforms (Garmin, Strava,
Smashrun, Dropbox and others). It is worth evaluating because it already solves
the multi-provider problem this whole section describes — but it is not a fourth
provider sprint. There are two distinct ways to use it, with very different costs:

**Option A — recommend it to users (zero engineering).**
Point users at tapiriik (hosted or self-hosted) to sync Garmin → Strava, then
import from Strava via §15.1. Costs nothing, ships as a documentation line, and
sidesteps Garmin credentials entirely. **Strictly better than building §15.2 for
users willing to set it up.**

**Option B — self-host it as the backend for §15.2 (replaces work).**
If a Python service is being stood up for Garmin anyway (§15.2 point 3), running
tapiriik's provider layer there could deliver **Garmin + Smashrun + others at
once** instead of one adapter per sprint. Potentially collapses Sprints 16–17.

**Before committing to Option B, verify — do not assume:**
1. **Maintenance status.** The project has seen little recent activity; Garmin has
   changed its SSO/MFA flow repeatedly and has broken many unofficial clients.
   **Confirm its Garmin module still works today** before designing around it.
2. **Licence.** Check the current licence and whether it permits this use
   (particularly if it ever becomes part of a paid tier).
3. It still needs Garmin credentials, so **FR-9.9's disclosure applies
   unchanged** — an aggregator does not make the credential question go away, it
   relocates it.

**Recommendation:** adopt **Option A immediately** as documentation (it is free
and helps users today), and treat Option B as a **spike to run before Sprint 16**
— if tapiriik's Garmin support is alive, it likely beats hand-rolling; if it is
stale, depending on a dormant project for core functionality is the wrong trade
and §15.2 proceeds as specced.

### 15.5 Non-integration alternatives worth mentioning to users

Cheapest of all, and worth documenting in-app regardless of what gets built:

- Garmin Connect can **auto-export to Strava** — making §15.1 sufficient for many
  people with no work on our side.
- **tapiriik** as above (Option A).
- Both Garmin and Strava support **bulk export**, which already works through the
  existing file upload for one-off historical imports.
- Phone-side sync utilities (RunGap, SyncMyTracks, HealthFit and similar) can
  bridge platforms without any server involvement.

## 16. Risks / Open Questions

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
- ~~Hebrew LLM quality~~ — **confirmed working 2026-07-23**: Hebrew plan
  generation produced a correct fully-Hebrew plan with the user's real key.
  A per-language default model is no longer a prerequisite; revisit only if a
  specific model disappoints on Hebrew chat.
- **Node 20 deprecation warning** in the Pages workflow: `actions/checkout@v4`
  and friends target Node 20 and are force-run on Node 24. Cosmetic today,
  will need action-version bumps eventually.
