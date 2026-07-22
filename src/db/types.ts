// Data contracts from the dev plan (v1.1), section 3 — Dexie v1 schema.

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
  id?: number;
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
  plannedWorkoutId?: number; // link after user confirmation
  matchStatus: MatchStatus;
}

export interface TrainingPlan {
  id?: number;
  createdAt: string;
  status: 'active' | 'archived';
  goal: string; // e.g. "Sub-50 10k on 2026-10-04"
  weeks: number;
  generationContext: string; // what was sent to the LLM (auditability)
}

export type WorkoutType = 'easy' | 'tempo' | 'intervals' | 'long' | 'rest' | 'race';

export interface PlannedWorkout {
  id?: number;
  planId: number; // indexed
  date: string; // indexed
  type: WorkoutType;
  description: string;
  targetDistanceMeters?: number;
  targetDurationSeconds?: number;
  status: 'pending' | 'completed' | 'missed' | 'skipped';
}

export interface ChatMessage {
  id?: number;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  planId?: number; // which plan era it belongs to
}

export interface Settings {
  key: string; // 'openrouterApiKey' | 'fastModel' | 'reasoningModel'
  value: string;
}
