// Prompt pipeline (dev plan §4). All pure functions — the mandatory unit-test
// targets alongside the parser.
//
// Token budgets: post-run chat ≤ 1,000 tokens total (summary ≤ ~600); plan
// generation gets ~3-4k. No in-browser tokenizer → chars/4 heuristic + margin.

import type {
  LapSplit,
  PlannedWorkout,
  RunRecord,
  TrainingPlan,
} from '@/db/types';
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
  upcomingWorkouts: PlannedWorkout[] = [],
): string {
  const lines: string[] = [COACH_SYSTEM_PROMPT, '', 'Context:'];
  if (plan) {
    lines.push(`- Active training plan: ${plan.goal} (${plan.weeks} weeks).`);
    if (adherence) {
      lines.push(
        `- Plan adherence: ${adherence.completed} completed, ${adherence.missed} missed, ${adherence.skipped} skipped, ${adherence.pending} upcoming.`,
      );
    }
    if (upcomingWorkouts.length > 0) {
      lines.push(
        '- Planned workouts for the coming week (refer to THESE when discussing what is next, do not invent a schedule):',
      );
      for (const w of upcomingWorkouts.slice(0, 7)) {
        const target =
          w.targetDistanceMeters !== undefined
            ? ` (${(w.targetDistanceMeters / 1000).toFixed(1)}km)`
            : '';
        lines.push(`  ${w.date} ${w.type}${target}: ${w.description.slice(0, 90)}`);
      }
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
  raceDate: string; // YYYY-MM-DD
  currentWeeklyKm: number;
  daysPerWeek: number;
}

export const PLAN_TOKEN_BUDGET = 4000;

export function weeksUntil(raceDate: string, today: Date): number {
  const ms = Date.parse(raceDate) - today.getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 3600 * 1000)));
}

/** Reasoning-tier prompt requesting a structured plan as strict JSON. */
export function buildPlanRequest(
  goalInput: PlanGoalInput,
  history: RunRecord[],
  today: Date = new Date(),
): string {
  const todayIso = today.toISOString().slice(0, 10);
  const weeks = weeksUntil(goalInput.raceDate, today);
  const lines = [
    'You are an experienced running coach. Create a personalized training plan.',
    '',
    `Today is ${todayIso}.`,
    `Goal: ${goalInput.goal}`,
    `Race date: ${goalInput.raceDate} (${weeks} week(s) away).`,
    `Current volume: about ${goalInput.currentWeeklyKm} km/week across ${goalInput.daysPerWeek} run(s)/week.`,
  ];
  if (history.length > 0) {
    lines.push('Recent runs (newest first):');
    for (const run of history.slice(0, 8)) lines.push(`  ${runOneLiner(run)}`);
  }
  lines.push(
    '',
    'Respond with ONLY a JSON object — no prose, no markdown fences — exactly this shape:',
    '{"workouts":[{"date":"YYYY-MM-DD","type":"easy|tempo|intervals|long|race","description":"...","targetDistanceMeters":8000,"targetDurationSeconds":3000}]}',
    '',
    'Rules:',
    `- Dates from ${todayIso} (exclusive) through ${goalInput.raceDate}, ${goalInput.daysPerWeek} workouts per week.`,
    '- Do NOT list rest days — only actual workouts.',
    '- Include the race itself as the final workout with type "race".',
    '- Progress weekly volume gradually (max ~10%/week), with an easier recovery week roughly every 4th week.',
    // Without these three, models "taper" by scheduling nothing at all in the
    // final week — detraining, not tapering.
    `- EVERY calendar week from ${todayIso} through race week must contain at least one workout. Never leave a week empty.`,
    '- Taper by REDUCING volume (roughly 40-50% below peak) in the final week — never by removing runs.',
    '- Race week must contain at least one short, easy run of 3-5 km in the days before the race, in addition to the race itself.',
    // "Derive a pace from the goal" alone makes weaker models put EVERY
    // workout at race pace, which is how runners get hurt. Spell out the
    // offset per workout type instead.
    '- description: one concrete sentence with a target pace in min/km that MATCHES THE WORKOUT TYPE, not the race goal:',
    '    easy/long = 60-90 sec per km SLOWER than goal race pace; tempo = 10-20 sec slower; intervals = at or slightly faster than goal pace; race = goal pace.',
    '  Never prescribe goal race pace for an easy or long run.',
    '- targetDistanceMeters required; targetDurationSeconds optional.',
  );
  return lines.join('\n');
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
