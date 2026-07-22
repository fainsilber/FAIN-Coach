# Product Requirements Document (PRD)

## AI Running Coach PWA ("OpenRun Coach")

**Document Version:** 1.0

**Target Release:** MVP

**Architecture:** Local-First Progressive Web App (PWA)

---

## 1. Executive Summary & Vision

**OpenRun Coach** is a local-first Progressive Web App designed for endurance runners who want actionable, personalized coaching feedback without being locked into proprietary walled gardens. Users upload standard telemetry files (`.tcx`) from any GPS watch, record their subjective feeling, and engage in a conversational coaching dialogue powered by open-weights AI models via the OpenRouter API.

### Key Differentiators

* **Local-First & Private:** All parsing and time-series telemetry remain strictly in the browser's IndexedDB.
* **Model Agnostic:** Seamless integration with OpenRouter (Meta Llama 3.3, Qwen 2.5, DeepSeek R1).
* **Subjective + Objective Fusion:** Merges telemetry metrics (HR, Pace, Cadence, Power) with user-reported effort and recovery notes.

---

## 2. Target Persona & User Goals

* **Primary Persona:** Data-conscious runner (5k to marathon) using GPS wearables (Garmin, Coros, Apple Watch, Suunto).
* **Primary Needs:**
* Understand *what to do next* based on recent run performance.
* Avoid raw file context bloat / high API costs when chatting with LLMs.
* Own their running data without mandatory cloud lock-in.



---

## 3. System Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     Progressive Web App (PWA)                   │
│   - Framework: React / Vite or Next.js (SSG/PWA)                │
│   - State & Local Storage: Dexie.js (IndexedDB)                 │
│   - XML Parser: Native Browser DOMParser                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Processing Pipeline                    │
│   1. Defensive TCX XML Extraction & Normalization               │
│   2. Single-leg Cadence Conversion (x2 for SPM)                 │
│   3. Dynamic Metric Summary Formatter (Token Optimizer)          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OpenRouter API Proxy                      │
│   - Fast Tier: Llama 3.3 70B / Qwen 2.5 72B (Post-Run Chat)       │
│   - Reasoning Tier: DeepSeek R1 / Mistral Large (Training Plans) │
└─────────────────────────────────────────────────────────────────┘

```

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

---

## 5. Non-Functional Requirements

* **Performance:** TCX parsing and database insertion must execute in `< 50ms` for standard run files (< 10MB).
* **Offline Functionality:** Complete web app functionality (past run history, telemetry charts, TCX parsing) must work offline. Only OpenRouter LLM requests require an active network connection.
* **Cross-Platform:** Responsive web layout optimized for mobile screens (Android PWA home-screen installable) and desktop browsers.

---

## 6. Data Schema & Contracts

### 6.1 Dexie IndexedDB Schema (`RunningCoachDB`)

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

1. **Core Storage & Parsing Engine:** Sprint 1.
Build local PWA shell with Vite/React. Implement Dexie.js database schema and the defensive native TCX parser with cadence normalization.


2. **Dashboard & History UI:** Sprint 2.
Develop run history list, lap breakdown views, metric charts (Pace/HR/Cadence), and local JSON export/import utilities.


3. **OpenRouter Integration & Prompt Pipeline:** Sprint 3.
Implement OpenRouter API client, prompt summarizer, user settings for API keys/model selection, and streaming chat interface.


4. **PWA Optimization & Polish:** Sprint 4.
Add Service Workers for offline caching, trigger Persistent Storage API prompts, optimize mobile UI touch targets, and audit cross-browser TCX compatibility.


---