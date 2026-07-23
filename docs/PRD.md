# Product Requirements Document (PRD)

## AI Running Coach PWA ("OpenRun Coach")

**Document Version:** 1.2 (2026-07-22: §4.4 Local Profiles, §4.5 Localization & Units, §3 architecture corrected to as-built)

**Target Release:** MVP shipped — live at https://fainsilber.github.io/FAIN-Coach/

**Architecture:** Local-First Progressive Web App (PWA)

---

## 1. Executive Summary & Vision

**OpenRun Coach** is a local-first Progressive Web App designed for endurance runners who want actionable, personalized coaching feedback without being locked into proprietary walled gardens. Users upload standard telemetry files (`.tcx`) from any GPS watch, record their subjective feeling, and engage in a conversational coaching dialogue powered by open-weights AI models via the OpenRouter API.

### Key Differentiators

* **Local-First & Private:** All parsing and time-series telemetry remain strictly in the browser's IndexedDB.
* **Model Agnostic:** Seamless integration with OpenRouter (Meta Llama 3.3, Qwen 2.5, DeepSeek R1).
* **Subjective + Objective Fusion:** Merges telemetry metrics (HR, Pace, Cadence, Power) with user-reported effort and recovery notes.
* **Multi-Runner on One Device:** Local profiles keep each runner's data in its own isolated database on shared devices.

---

## 2. Target Persona & User Goals

* **Primary Persona:** Data-conscious runner (5k to marathon) using GPS wearables (Garmin, Coros, Apple Watch, Suunto).
* **Primary Needs:**
* Understand *what to do next* based on recent run performance.
* Avoid raw file context bloat / high API costs when chatting with LLMs.
* Own their running data without mandatory cloud lock-in.



---

## 3. System Architecture & Tech Stack

As-built (corrected in v1.2 — the original "reasoning tier" assumption did not
survive testing; see §3.1):

```
┌─────────────────────────────────────────────────────────────────┐
│                     Progressive Web App (PWA)                   │
│   - Framework: Vite + React 18 + TypeScript (SPA)               │
│   - Storage: Dexie.js (IndexedDB), one database per profile     │
│   - XML Parser: Native Browser DOMParser                        │
│   - Hosting: GitHub Pages (static, HTTPS, /FAIN-Coach/ base)    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Processing Pipeline                    │
│   1. Defensive TCX XML Extraction & Normalization               │
│   2. Single-leg Cadence Conversion (x2 for SPM)                 │
│   3. Lap aggregation; trackpoints discarded                     │
│   4. Macro Summary Formatter (present metrics only)             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              OpenRouter (direct fetch, BYO key)                 │
│   - Chat:  Llama 3.3 70B (default) / Qwen 2.5 72B / DeepSeek V3 │
│   - Plans: Llama 3.3 70B (default); DeepSeek R1 / QwQ optional  │
└─────────────────────────────────────────────────────────────────┘

```

### 3.1 Model tiering — assumption revised

v1.0 specified a slow "reasoning tier" for plan generation. A/B testing on
identical inputs (2026-07-22) showed that once the prompt states taper and
per-workout-type pace rules explicitly, an **instruct** model produces an
equally sound plan — in fact a better taper — in ~67s versus DeepSeek R1's
~267s. Because minutes-long generations are the failure mode on mobile
connections, latency decides it. Plan generation now defaults to an instruct
model; reasoning models remain user-selectable for richer prose.

---

## 4. Functional Requirements

### 4.1 Data Ingestion & TCX Parsing

* **FR-1.1:** The app **must** support client-side file upload and drag-and-drop for `.tcx` XML files.
* **FR-1.2:** The XML parser **must** execute entirely inside the browser using native `DOMParser` with full namespace support (`ns3:TPX`, `ns3:LX`).
* **FR-1.3:** The parser **must** handle missing metrics gracefully, treating Heart Rate, Cadence, Elevation, and Power as optional fields.
* **FR-1.4:** Cadence values `< 120 SPM` **must** be normalized (multiplied by 2) to standard steps-per-minute (SPM).

### 4.2 Local Storage & Persistence

* **FR-2.1:** Extracted run records **must** be persisted in IndexedDB via `Dexie.js`.
* **FR-2.2:** The app **must** request explicit Persistent Storage (`navigator.storage.persist()`) to prevent browser eviction.
* **FR-2.3:** The app **must** support a JSON backup Export/Import feature for manual device transfer.

### 4.3 AI Coaching & Prompt Orchestration

* **FR-3.1:** The app **must** allow users to input their own OpenRouter API key or choose from available models.
* **FR-3.2:** Prompts sent to OpenRouter **must** be pre-processed macro summaries (strictly omitting raw per-second trackpoint noise) to keep context windows under 1,000 tokens.
* **FR-3.3:** The AI Coach system prompt **must** strictly enforce a 3-step response layout:
1. *The Big Picture* (Workout intention summary)
2. *Telemetry Breakdown* (Specific bullet points from present metrics only)
3. *Next Step* (Actionable recommendation for the next run)


* **FR-3.4:** The AI **must never** invent or comment on missing metrics (e.g., power or cadence if omitted from the TCX file).

### 4.4 Local Profiles & Multi-User (added v1.1)

* **FR-4.1:** The app **must** support multiple local profiles on one device. Each profile owns its own isolated IndexedDB database; no feature may read or write another profile's data.
* **FR-4.2:** On launch without an active profile, the app **must** show a profile picker (select, create, delete). All runs, plans, chat history, settings, and backups are scoped to the active profile.
* **FR-4.3:** A profile **may** set an optional PIN, stored only as a salted SHA-256 hash. The PIN gates the UI against casual access on a shared device.
* **FR-4.4 (explicit scope limitation):** Local profiles provide data *separation*, not *security*. Data is not encrypted at rest; anyone with device and browser access can read any profile's IndexedDB via developer tools. Server-side accounts with enforced isolation (and multi-device sync) are out of scope for MVP; the designated upgrade path is Dexie Cloud (see dev plan §7).

### 4.5 Localization & Measurement Units (added v1.2)

> **Delivery is split across two sprints** (dev plan §8 and §9): units and week
> start ship first as self-contained preferences (FR-5.7 – 5.14), then language
> and RTL (FR-5.1 – 5.6). The requirements below are grouped by topic, not by
> sprint.

**Language**

* **FR-5.1:** The app **must** let the user choose the interface language. Launch languages: **English** and **Hebrew**. The architecture must accept further languages without code changes to feature components.
* **FR-5.2:** The app **must** fully support right-to-left (RTL) layout for Hebrew — `dir="rtl"`, mirrored layout, and correct alignment throughout, including navigation, forms, chat bubbles, tables, and the plan calendar.
* **FR-5.3:** Numeric values (pace, distance, heart rate, dates, times) **must** render correctly inside RTL text. Bidirectional isolation is required so that strings such as `5:48 /km` are not visually reordered.
* **FR-5.4:** Dates, times, numbers, and plural forms **must** be formatted per the active locale (e.g. Hebrew weekday names).
* **FR-5.5:** Language selection **must** default to the browser's preferred language when it is a supported one, otherwise English. The user's explicit choice always overrides detection.
* **FR-5.6 (AI coach):** Coach and plan responses **must** be produced in the user's selected language. The system prompt carries the target language, and the enforced 3-step response layout (FR-3.3) must use localized section headings.

**Measurement units**

* **FR-5.7:** The app **must** support **metric** and **imperial** unit systems. **Metric is the default.**
* **FR-5.8:** Unit selection affects display only. All data **must** remain stored canonically in SI units (metres, seconds) exactly as parsed; conversion happens solely at the presentation and prompt-formatting boundary. Imported backups therefore remain portable between users of different unit systems.
* **FR-5.9:** Unit-dependent values are distance (km / miles), pace (min/km / min/mile), and elevation (m / ft). Heart rate (bpm), cadence (spm), and power (W) are unit-system independent and must not be converted.
* **FR-5.10:** Data *entry* must respect the selected system (e.g. the plan wizard's weekly-volume field is km under metric and miles under imperial), and prompts sent to the LLM must express distances in the user's system so coaching replies use the same units.
* **FR-5.11:** Language and unit preferences are **per profile**, stored alongside other settings and therefore included in backup export/import.

**Week start**

* **FR-5.12:** The first day of the week **must default to Sunday**, and **must** be user-configurable (Sunday or Monday). This is a deliberate departure from ISO 8601, which defines the week as Monday-start.
* **FR-5.13:** The week-start preference **must** apply consistently everywhere weeks are derived — the training-plan week grouping, any weekly volume totals, and any week references sent to the AI coach — so that a "week" means the same thing across the whole app.
* **FR-5.14:** The preference is **per profile** (like language and units) and is independent of the selected language: a user may run the interface in English while keeping a Sunday week, or vice versa.

---

## 5. Non-Functional Requirements

* **Performance:** TCX parsing and database insertion must execute in `< 50ms` for standard run files (< 10MB). *Measured: a 5.5 MB / 22-lap / 7,441-trackpoint Garmin export parses and persists well inside budget in a real browser; the resulting record is ~3 KB because trackpoints are discarded.*
* **Offline Functionality:** Complete web app functionality (past run history, telemetry charts, TCX parsing) must work offline. Only OpenRouter LLM requests require an active network connection.
* **Cross-Platform:** Responsive web layout optimized for mobile screens (Android PWA home-screen installable) and desktop browsers.
* **Network resilience:** Transient connection failures to OpenRouter must be retried automatically on the connection phase only — never after streaming has begun, and never for authentication or rate-limit errors.
* **Localization:** The layout must not break in RTL, and no user-visible string may be hard-coded in a component once §4.5 is implemented.

---

## 6. Data Schema & Contracts

> **Note (v1.2):** the authoritative, as-built schema lives in
> [dev-plan.md §3](dev-plan.md). It differs from the sketch below: `chatHistory`
> was removed from `RunRecord` in favour of a global `ChatMessage` table, RPE /
> feel tags / plan-matching fields were added, and the database is named
> `FainCoachDB-<profileId>` (one per local profile). The sketch is retained for
> historical context.

### 6.1 Dexie IndexedDB Schema (original v1.0 sketch — superseded)

```typescript
export interface LapSplit {
  lapIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
}

export interface RunRecord {
  id?: number;                  // Auto-incremented primary key
  date: string;                 // ISO Date String (Indexed)
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;          // Normalized SPM
  avgPower?: number;            // Watts
  laps: LapSplit[];
  userNotes?: string;           // Subjective feedback
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

```

---

## 7. Development Roadmap

Superseded by [dev-plan.md §5](dev-plan.md), which is the authoritative sprint
breakdown. Status as of 2026-07-22:

| Sprint | Scope | Status |
|---|---|---|
| 1 | Storage, TCX parsing engine, upload & post-run form | ✅ Complete |
| 2 | History, run detail with lap charts, JSON export/import, settings | ✅ Complete |
| 3 | OpenRouter streaming client, prompt pipeline, global coach chat | ✅ Complete |
| 4 | Training plans, run↔plan auto-matching, plan-aware coaching | ✅ Complete |
| 5 | PWA polish, offline shell, storage indicator, mobile audit | ✅ Complete |
| — | Local profiles (§4.4) | ✅ Complete |
| — | Deployment to GitHub Pages | ✅ Live |
| 6 | Units & week start (§4.5, FR-5.7–5.14) | ✅ Complete |
| 7 | Multi-language: English + Hebrew RTL (§4.5, FR-5.1–5.6) | ✅ Complete |

---