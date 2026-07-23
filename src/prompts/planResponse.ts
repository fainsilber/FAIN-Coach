import type { PlannedWorkout, RunRecord, WorkoutType } from '@/db/types';
import type { LlmClient } from '@/llm/LlmClient';
import type { UnitSystem } from '@/lib/units';
import {
  buildPlanRequest,
  type PlanGoalInput,
  type PromptLanguage,
} from './prompts';

// Reasoning models sometimes wrap JSON in prose or fences, or return a
// malformed plan — strict validation plus ONE automatic retry with error
// feedback (dev plan risk #1).

export type PlannedWorkoutDraft = Omit<PlannedWorkout, 'id' | 'planId' | 'status'>;

export class PlanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanParseError';
  }
}

const WORKOUT_TYPES: ReadonlySet<string> = new Set([
  'easy',
  'tempo',
  'intervals',
  'long',
  'rest',
  'race',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new PlanParseError('No JSON object found in the response.');
  }
  return cleaned.slice(start, end + 1);
}

function optionalPositiveInt(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new PlanParseError(`${path} must be a positive number.`);
  }
  return Math.round(n);
}

export function parsePlanResponse(text: string): PlannedWorkoutDraft[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch (e) {
    if (e instanceof PlanParseError) throw e;
    throw new PlanParseError('Response is not valid JSON.');
  }
  const workouts = (data as { workouts?: unknown }).workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) {
    throw new PlanParseError('"workouts" must be a non-empty array.');
  }
  const drafts = workouts.map((raw, i): PlannedWorkoutDraft => {
    const w = raw as Record<string, unknown>;
    const path = `workouts[${i}]`;
    if (typeof w.date !== 'string' || !DATE_RE.test(w.date)) {
      throw new PlanParseError(`${path}.date must be "YYYY-MM-DD".`);
    }
    if (Number.isNaN(Date.parse(w.date))) {
      throw new PlanParseError(`${path}.date is not a real date.`);
    }
    if (typeof w.type !== 'string' || !WORKOUT_TYPES.has(w.type)) {
      throw new PlanParseError(
        `${path}.type must be one of easy|tempo|intervals|long|rest|race.`,
      );
    }
    if (typeof w.description !== 'string' || !w.description.trim()) {
      throw new PlanParseError(`${path}.description must be a non-empty string.`);
    }
    return {
      date: w.date,
      type: w.type as WorkoutType,
      description: w.description.trim(),
      targetDistanceMeters: optionalPositiveInt(
        w.targetDistanceMeters,
        `${path}.targetDistanceMeters`,
      ),
      targetDurationSeconds: optionalPositiveInt(
        w.targetDurationSeconds,
        `${path}.targetDurationSeconds`,
      ),
    };
  });
  return drafts.sort((a, b) => a.date.localeCompare(b.date));
}

export interface GeneratedPlan {
  workouts: PlannedWorkoutDraft[];
  /** Exact prompt that produced the accepted response (auditability). */
  generationContext: string;
}

export interface PlanProgress {
  phase: 'reasoning' | 'writing' | 'retrying';
  chars: number;
}

/**
 * Reasoning models can go quiet between chunks, and mobile networks stall —
 * so plan generation gets a much longer silence budget than chat. This is an
 * *idle* timeout: continuous streaming never trips it, however long it runs.
 */
const PLAN_IDLE_TIMEOUT_MS = 240_000;

/** Ask the reasoning model for a plan; on a malformed response, retry once
 * with the validation error appended. */
export async function requestPlanWorkouts(
  client: LlmClient,
  model: string,
  goalInput: PlanGoalInput,
  history: RunRecord[],
  today: Date = new Date(),
  onProgress?: (progress: PlanProgress) => void,
  unit: UnitSystem = 'metric',
  language: PromptLanguage = 'en',
): Promise<GeneratedPlan> {
  let chars = 0;
  const callbacks = (retrying: boolean) => ({
    onToken: (t: string) => {
      chars += t.length;
      onProgress?.({ phase: retrying ? 'retrying' : 'writing', chars });
    },
    onReasoning: (t: string) => {
      chars += t.length;
      onProgress?.({ phase: retrying ? 'retrying' : 'reasoning', chars });
    },
  });

  const prompt = buildPlanRequest(goalInput, history, today, unit, language);
  const firstCb = callbacks(false);
  const first = await client.chat(
    [{ role: 'user', content: prompt }],
    model,
    firstCb.onToken,
    { onReasoning: firstCb.onReasoning, idleTimeoutMs: PLAN_IDLE_TIMEOUT_MS },
  );
  try {
    return { workouts: parsePlanResponse(first), generationContext: prompt };
  } catch (e) {
    const error = e instanceof PlanParseError ? e.message : String(e);
    onProgress?.({ phase: 'retrying', chars });
    const retryPrompt = `${prompt}\n\nYour previous response could not be used: ${error}\nRespond again with ONLY the valid JSON object described above.`;
    const retryCb = callbacks(true);
    const second = await client.chat(
      [{ role: 'user', content: retryPrompt }],
      model,
      retryCb.onToken,
      { onReasoning: retryCb.onReasoning, idleTimeoutMs: PLAN_IDLE_TIMEOUT_MS },
    );
    return { workouts: parsePlanResponse(second), generationContext: retryPrompt };
  }
}
