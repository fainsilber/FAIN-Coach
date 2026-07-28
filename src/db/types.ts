// Data contracts from the dev plan (v1.1), section 3 — Dexie v1 schema.

/**
 * Primary/foreign key type (Sprint 11, dev plan §12.2).
 *
 * The local database uses Dexie auto-increment NUMBERS. A cloud account uses
 * Dexie Cloud's globally unique STRINGS (`@id`), because per-device
 * auto-increment cannot survive two devices syncing into one account.
 *
 * Both are live at once — the free tier stays local, so this is a real union
 * rather than a migration waypoint. Application code should treat ids as
 * opaque and never do arithmetic on them; the one place the distinction
 * matters is turning a `<select>`'s string value back into an id, which is
 * centralized in `parseEntityId()` (src/db/db.ts).
 */
export type EntityId = number | string;

export interface LapSplit {
  lapIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
}

export type MatchStatus = 'unmatched' | 'suggested' | 'confirmed' | 'unplanned';

export const FEEL_TAGS = [
  'fresh',
  'strong',
  'tired',
  'legs-heavy',
  'sore',
  'slept-poorly',
] as const;

export type FeelTag = (typeof FEEL_TAGS)[number];

export interface RunRecord {
  id?: EntityId;
  date: string; // ISO, indexed
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number; // normalized SPM
  avgPower?: number;
  laps: LapSplit[];
  rpe?: number; // 1-10
  feelTags?: string[]; // 'legs-heavy' | 'slept-poorly' | 'sore' | ...
  userNotes?: string;
  plannedWorkoutId?: EntityId; // link after user confirmation
  matchStatus: MatchStatus;
  /**
   * How the run got here. Absent on every record created before Sprint 8, so
   * treat `undefined` as 'tcx'. Optional and unindexed — Dexie schemas declare
   * indexes, not fields, so this needed no version bump or migration.
   * Manually entered metrics are self-reported, which the coach summary flags.
   */
  source?: 'tcx' | 'manual';
  /** Which pair of shoes this run was in. Absent = not recorded (FR-7.2) —
   * always valid, never blocks saving. */
  shoeId?: EntityId;
}

export interface TrainingPlan {
  id?: EntityId;
  createdAt: string;
  status: 'active' | 'archived';
  goal: string; // e.g. "Sub-50 10k on 2026-10-04"
  weeks: number;
  generationContext: string; // what was sent to the LLM (auditability)
}

export type WorkoutType = 'easy' | 'tempo' | 'intervals' | 'long' | 'rest' | 'race';

export interface PlannedWorkout {
  id?: EntityId;
  planId: EntityId; // indexed
  date: string; // indexed
  type: WorkoutType;
  description: string;
  targetDistanceMeters?: number;
  targetDurationSeconds?: number;
  status: 'pending' | 'completed' | 'missed' | 'skipped';
}

export interface ChatMessage {
  id?: EntityId;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  planId?: EntityId; // which plan era it belongs to
}

export interface Settings {
  key: string; // 'openrouterApiKey' | 'fastModel' | 'reasoningModel'
  value: string;
}

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Diagnostics entry (PRD §4.8). Records events and metadata for
 * troubleshooting — NEVER user content. `detail` is redacted and truncated
 * by the writer (src/lib/log.ts), not by callers. Deliberately excluded from
 * backup export/import (FR-8.10) — see backup.ts.
 */
export interface LogEntry {
  id?: EntityId;
  at: string; // ISO, indexed
  level: LogLevel;
  event: string; // stable code, e.g. 'tcx.parse.failed'
  detail?: string;
}

/** Default replacement threshold: ~800 km / ~500 mi, a common shoe lifespan. */
export const DEFAULT_RETIREMENT_METERS = 800_000;

/**
 * A pair of running shoes (PRD §4.7). Mileage is never stored here — it is
 * always derived from assigned runs plus `initialDistanceMeters`, so deleting
 * or re-assigning a run can never leave a stale total (FR-7.4). See
 * src/lib/shoes.ts.
 */
export interface Shoe {
  id?: EntityId;
  name: string;
  brand?: string;
  purchasedAt?: string; // ISO date, optional
  /** Starting mileage for a shoe that was already part-worn when added. */
  initialDistanceMeters: number;
  /** Editable per pair — lifespan varies by model and runner (FR-7.5). */
  retirementDistanceMeters: number;
  /** Retired pairs are excluded from new-run assignment but keep their
   * history (FR-7.7). Not indexed — booleans are not a valid IndexedDB key
   * type, so this is filtered client-side; the shoe count is always small. */
  retired: boolean;
}
