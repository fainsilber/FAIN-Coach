// Prompt pipeline (dev plan §4). All pure functions — the mandatory unit-test
// targets alongside the parser.
//
// Token budgets: post-run chat ≤ 1,000 tokens total (summary ≤ ~600); plan
// generation gets ~3-4k. No in-browser tokenizer → chars/4 heuristic + margin.

import type { LapSplit, RunRecord, TrainingPlan } from '@/db/types';
import type { LlmMessage } from '@/llm/LlmClient';

/** chars/4 heuristic with safety margin (dev plan §6). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const CHAT_TOKEN_BUDGET = 1000;
export const RUN_SUMMARY_TOKEN_BUDGET = 600;
const MAX_LAP_LINES = 26;

function fmtDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function fmtPace(meters: number, seconds: number): string | undefined {
  if (meters <= 0 || seconds <= 0) return undefined;
  const secPerKm = seconds / (meters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00/km` : `${m}:${String(s).padStart(2, '0')}/km`;
}

function lapLine(lap: LapSplit): string {
  const parts = [
    `${(lap.distanceMeters / 1000).toFixed(2)}km`,
    fmtPace(lap.distanceMeters, lap.durationSeconds) ?? fmtDuration(lap.durationSeconds),
  ];
  if (lap.avgHeartRate !== undefined) parts.push(`${lap.avgHeartRate}bpm`);
  if (lap.avgCadence !== undefined) parts.push(`${lap.avgCadence}spm`);
  if (lap.avgPower !== undefined) parts.push(`${lap.avgPower}W`);
  return `${lap.lapIndex + 1}: ${parts.join(' ')}`;
}

/**
 * Macro summary of one run for the coach. No trackpoints. Lists ONLY metrics
 * present in the record; absent metrics must not appear at all — that is how
 * FR-3.4 ("never mention absent metrics") is enforced, not by trusting the
 * model.
 */
export function summarizeRun(run: RunRecord): string {
  const lines: string[] = [];
  lines.push(`Run on ${run.date.slice(0, 10)}:`);
  const pace = fmtPace(run.totalDistanceMeters, run.totalDurationSeconds);
  lines.push(
    `- ${(run.totalDistanceMeters / 1000).toFixed(2)} km in ${fmtDuration(run.totalDurationSeconds)}${pace ? ` (avg ${pace})` : ''}`,
  );
  if (run.avgHeartRate !== undefined || run.maxHeartRate !== undefined) {
    const hr = [
      run.avgHeartRate !== undefined ? `avg ${run.avgHeartRate}` : undefined,
      run.maxHeartRate !== undefined ? `max ${run.maxHeartRate}` : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`- Heart rate: ${hr} bpm`);
  }
  if (run.avgCadence !== undefined) {
    lines.push(`- Cadence: avg ${run.avgCadence} spm`);
  }
  if (run.avgPower !== undefined) {
    lines.push(`- Power: avg ${run.avgPower} W`);
  }
  if (run.rpe !== undefined) {
    lines.push(`- Effort (RPE): ${run.rpe}/10`);
  }
  if (run.feelTags && run.feelTags.length > 0) {
    lines.push(`- Felt: ${run.feelTags.join(', ')}`);
  }
  if (run.userNotes) {
    lines.push(`- Runner's notes: "${run.userNotes.slice(0, 280)}"`);
  }
  if (run.laps.length > 1) {
    const shown = run.laps.slice(0, MAX_LAP_LINES);
    lines.push(
      `- Lap splits${shown.length < run.laps.length ? ` (first ${shown.length} of ${run.laps.length})` : ''}:`,
    );
    for (const lap of shown) lines.push(`  ${lapLine(lap)}`);
  }
  return lines.join('\n');
}

/**
 * System prompt contract (FR-3.3): responses must follow the 3-step layout.
 */
export const COACH_SYSTEM_PROMPT = `You are FAIN Coach, an experienced running coach.
Structure every response in exactly three sections:
1. **The Big Picture** — what this workout accomplished.
2. **Telemetry Breakdown** — bullet points about the metrics provided. Discuss ONLY metrics that appear in the summary; never mention, estimate, or comment on metrics that are absent.
3. **Next Step** — one actionable recommendation for the next run.
Keep responses under 250 words. Be specific and concrete, never generic.`;

export interface AdherenceStats {
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
}

function runOneLiner(run: RunRecord): string {
  const pace = fmtPace(run.totalDistanceMeters, run.totalDurationSeconds);
  const bits = [
    `${run.date.slice(0, 10)}: ${(run.totalDistanceMeters / 1000).toFixed(1)}km`,
    pace,
    run.avgHeartRate !== undefined ? `${run.avgHeartRate}bpm` : undefined,
    run.rpe !== undefined ? `RPE ${run.rpe}` : undefined,
  ];
  return bits.filter(Boolean).join(' ');
}

/** Plan-aware system context for the single global coach thread. */
export function buildCoachContext(
  plan: TrainingPlan | undefined,
  recentRuns: RunRecord[],
  adherence: AdherenceStats | undefined,
): string {
  const lines: string[] = [COACH_SYSTEM_PROMPT, '', 'Context:'];
  if (plan) {
    lines.push(`- Active training plan: ${plan.goal} (${plan.weeks} weeks).`);
    if (adherence) {
      lines.push(
        `- Plan adherence: ${adherence.completed} completed, ${adherence.missed} missed, ${adherence.skipped} skipped, ${adherence.pending} upcoming.`,
      );
    }
  } else {
    lines.push('- No active training plan.');
  }
  if (recentRuns.length > 0) {
    lines.push('- Recent runs (newest first):');
    for (const run of recentRuns.slice(0, 3)) {
      lines.push(`  ${runOneLiner(run)}`);
    }
  }
  return lines.join('\n');
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
 * Token-budget guard: system prompt + newest history messages that fit the
 * budget. The newest message is always included, even if oversized.
 */
export function capMessages(
  system: string,
  history: LlmMessage[],
  budgetTokens: number = CHAT_TOKEN_BUDGET,
): LlmMessage[] {
  let used = estimateTokens(system);
  const tail: LlmMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content);
    if (tail.length > 0 && used + cost > budgetTokens) break;
    tail.unshift(history[i]);
    used += cost;
  }
  return [{ role: 'system', content: system }, ...tail];
}
