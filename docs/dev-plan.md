# OpenRun Coach — Development Plan (v1.2)

Supersedes the PRD roadmap. Incorporates decisions made 2026-07-21; v1.2
(2026-07-22) adds local profiles and the account-migration path (§7).

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

### Sprint 1 — Foundation & Parsing Engine
- Vite + React + TS scaffold, Tailwind, shadcn/ui, routing shell.
- Dexie schema v1 (all 6 tables) + typed DB module.
- TCX parser: DOMParser, namespace handling (`ns3:TPX`/`ns3:LX`), optional-metric defensiveness, cadence ×2 normalization (<120), lap aggregation, trackpoint discard.
- Vitest suite: fixture TCX files (Garmin, Coros, missing-HR, missing-cadence, corrupt XML).
- Upload UI: drag-and-drop + file picker → parse → save → post-run form (RPE, feel tags, notes).
- **Exit criteria**: 10MB TCX parses + persists < 50ms; all fixtures green.

### Sprint 2 — History, Dashboard & Data Portability
- Run history list (date, distance, pace, RPE badge).
- Run detail: lap table + lap-level charts (pace/HR/cadence per lap).
- JSON export/import (full DB dump, versioned envelope).
- Settings page: API key entry (stored locally, masked), model pickers.
- **Exit criteria**: full offline browse of history; export→wipe→import round-trips losslessly.

### Sprint 3 — Coach Chat & Prompt Pipeline
- `LlmClient` + OpenRouter implementation with streaming (SSE).
- `summarizeRun` + token-budget guard + unit tests.
- Global chat UI: streaming responses, run summary auto-injected after upload, 3-step layout system prompt.
- Error handling: invalid key, rate limits, offline state ("chat needs network" banner).
- **Exit criteria**: upload → confirm → coached response referencing only present metrics, < 1k tokens sent.

### Sprint 4 — Training Plans & Matching
- Plan creation wizard (goal race, date, current weekly volume, days/week).
- `buildPlanRequest` → reasoning-tier call → parse structured plan JSON → persist `PlannedWorkout` rows.
- Calendar/week view of the plan; workout status tracking.
- Auto-match + confirmation dialog on upload ("Looks like Tuesday's tempo — correct?"), manual re-link.
- Adherence summary fed into coach context.
- Reset actions: archive-plan-and-restart; full wipe (with confirm + export prompt).
- **Exit criteria**: end-to-end: create plan → upload run → auto-match confirm → coach references plan progress.

### Sprint 5 — PWA & Polish
- Service worker precache, offline app shell, install prompt.
- `navigator.storage.persist()` request + storage-usage indicator.
- Mobile layout audit (touch targets, chat on small screens).
- Cross-device TCX compatibility pass (Garmin/Coros/Apple/Suunto exports).
- **Exit criteria**: Lighthouse PWA installable; full offline function except LLM calls.

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

## 8. Risks / Open Questions

- **Coach context should include the upcoming week's actual planned workouts**
  (found in live testing 2026-07-22): with only goal + adherence in context,
  the coach invents plausible-but-wrong weekly schedules when asked "what are
  my key workouts this week?". Add the next ~7 days of `PlannedWorkout` rows
  to `buildCoachContext` (fits the 1k budget: ~5 one-liners). → Sprint 5.
- **DeepSeek R1 plan generation is slow** (~6 min, ~37k reasoning chars for a
  13-week plan) but valid on the first attempt. Mitigated with streamed
  progress phases and a 90s idle timeout; consider a faster default
  reasoning model or `deepseek-r1-distill` variants.

- **Plan JSON reliability**: reasoning models may return malformed plan JSON → strict schema validation + one automatic retry with error feedback; blocking issue for Sprint 4.
- **Apple Watch exports**: Apple exports GPX natively, TCX only via third-party apps — may need a GPX parser later (P2, design parser interface to allow it).
- **Token estimation**: no tokenizer in-browser for arbitrary models → use chars/4 heuristic with safety margin.
- **Chat history growth**: cap context to last N messages + rolling summary once thread exceeds budget (implement in Sprint 3 if time, else Sprint 5).
