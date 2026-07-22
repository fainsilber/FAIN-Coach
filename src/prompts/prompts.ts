// Prompt pipeline (dev plan §4). All pure functions — the mandatory unit-test
// targets alongside the parser.
//
// Token budgets: post-run chat ≤ 1,000 tokens total (summary ≤ ~600); plan
// generation gets ~3-4k. No in-browser tokenizer → chars/4 heuristic + margin.

import type { RunRecord, TrainingPlan } from '@/db/types';

/** chars/4 heuristic with safety margin (dev plan §6). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Sprint 3 — macro summary of one run. No trackpoints. Lists ONLY metrics
 * present in the record; absent metrics must not appear at all (this is how
 * "never mention absent metrics" is enforced — not by trusting the model).
 */
export function summarizeRun(_run: RunRecord): string {
  throw new Error('Not implemented — Sprint 3');
}

export interface AdherenceStats {
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
}

/** Sprint 3/4 — plan-aware system context for the global coach thread. */
export function buildCoachContext(
  _plan: TrainingPlan | undefined,
  _recentRuns: RunRecord[],
  _adherence: AdherenceStats | undefined,
): string {
  throw new Error('Not implemented — Sprint 3');
}

export interface PlanGoalInput {
  goal: string;
  raceDate: string;
  currentWeeklyKm: number;
  daysPerWeek: number;
}

/** Sprint 4 — reasoning-tier prompt requesting a structured plan (strict JSON). */
export function buildPlanRequest(
  _goalInput: PlanGoalInput,
  _history: RunRecord[],
): string {
  throw new Error('Not implemented — Sprint 4');
}

/**
 * System prompt contract (FR-3.3): responses must follow the 3-step layout.
 * 1. The Big Picture  2. Telemetry Breakdown  3. Next Step
 */
export const COACH_SYSTEM_PROMPT = `You are FAIN Coach, an experienced running coach.
Structure every response in exactly three sections:
1. **The Big Picture** — what this workout accomplished.
2. **Telemetry Breakdown** — bullet points about the metrics provided. Discuss ONLY metrics that appear in the summary; never mention, estimate, or comment on metrics that are absent.
3. **Next Step** — one actionable recommendation for the next run.`;
