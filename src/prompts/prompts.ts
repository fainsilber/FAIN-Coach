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
import {
  distanceUnitLabel,
  paceUnitLabel,
  secondsPerDistanceUnit,
  toDisplayDistance,
  type UnitSystem,
} from '@/lib/units';

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

function fmtPace(
  meters: number,
  seconds: number,
  unit: UnitSystem,
): string | undefined {
  const perUnit = secondsPerDistanceUnit(meters, seconds, unit);
  if (perUnit === undefined) return undefined;
  const m = Math.floor(perUnit / 60);
  const s = Math.round(perUnit % 60);
  const label = paceUnitLabel(unit);
  return s === 60
    ? `${m + 1}:00${label}`
    : `${m}:${String(s).padStart(2, '0')}${label}`;
}

function fmtDistance(meters: number, unit: UnitSystem, digits = 2): string {
  return `${toDisplayDistance(meters, unit).toFixed(digits)}${distanceUnitLabel(unit)}`;
}

function lapLine(lap: LapSplit, unit: UnitSystem): string {
  const parts = [
    fmtDistance(lap.distanceMeters, unit),
    fmtPace(lap.distanceMeters, lap.durationSeconds, unit) ??
      fmtDuration(lap.durationSeconds),
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
export function summarizeRun(
  run: RunRecord,
  unit: UnitSystem = 'metric',
): string {
  const lines: string[] = [];
  // FR-6.7: an estimated heart rate deserves less confidence than a measured
  // one, so say which this is rather than letting the coach assume telemetry.
  const provenance =
    run.source === 'manual' ? ' (entered manually, values are self-reported)' : '';
  lines.push(`Run on ${run.date.slice(0, 10)}${provenance}:`);
  const pace = fmtPace(run.totalDistanceMeters, run.totalDurationSeconds, unit);
  lines.push(
    `- ${fmtDistance(run.totalDistanceMeters, unit)} in ${fmtDuration(run.totalDurationSeconds)}${pace ? ` (avg ${pace})` : ''}`,
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
    for (const lap of shown) lines.push(`  ${lapLine(lap, unit)}`);
  }
  return lines.join('\n');
}

/** Prompt-facing language type. Mirrors the UI languages but is kept as a
 * plain union so prompt functions have no dependency on React code. */
export type PromptLanguage = 'en' | 'he';

/**
 * System prompt contract (FR-3.3): responses must follow the 3-step layout.
 * FR-5.6: the response language follows the user's setting, with localized
 * section headings. The INSTRUCTIONS stay in English — models follow English
 * instructions most reliably — only the demanded output language changes.
 */
export function coachSystemPrompt(language: PromptLanguage = 'en'): string {
  const headings =
    language === 'he'
      ? {
          big: 'התמונה הגדולה',
          telemetry: 'ניתוח הנתונים',
          next: 'הצעד הבא',
        }
      : { big: 'The Big Picture', telemetry: 'Telemetry Breakdown', next: 'Next Step' };
  const languageRule =
    language === 'he'
      ? 'Respond ENTIRELY in Hebrew, using the exact Hebrew section headings below.'
      : '';
  return `You are FAIN Coach, an experienced running coach.
${languageRule}
Structure every response in exactly three sections:
1. **${headings.big}** — what this workout accomplished.
2. **${headings.telemetry}** — bullet points about the metrics provided. Discuss ONLY metrics that appear in the summary; never mention, estimate, or comment on metrics that are absent.
3. **${headings.next}** — one actionable recommendation for the next run.
Keep responses under 250 words. Be specific and concrete, never generic.`;
}

export interface AdherenceStats {
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
}

function runOneLiner(run: RunRecord, unit: UnitSystem): string {
  const pace = fmtPace(run.totalDistanceMeters, run.totalDurationSeconds, unit);
  const bits = [
    `${run.date.slice(0, 10)}: ${fmtDistance(run.totalDistanceMeters, unit, 1)}`,
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
  unit: UnitSystem = 'metric',
  language: PromptLanguage = 'en',
): string {
  const lines: string[] = [
    coachSystemPrompt(language),
    `Use ${unit === 'imperial' ? 'miles and min/mile' : 'kilometres and min/km'} for all distances and paces.`,
    '',
    'Context:',
  ];
  if (plan) {
    lines.push(`- Active training plan: ${plan.goal} (${plan.weeks} weeks).`);
    if (adherence) {
      lines.push(
        `- Plan adherence: ${adherence.completed} completed, ${adherence.missed} missed, ${adherence.skipped} skipped, ${adherence.pending} upcoming.`,
      );
    }
    if (upcomingWorkouts.length > 0) {
      lines.push(
        '- Planned workouts over the next 7 days (refer to THESE when discussing what is next, do not invent a schedule):',
      );
      for (const w of upcomingWorkouts.slice(0, 7)) {
        const target =
          w.targetDistanceMeters !== undefined
            ? ` (${fmtDistance(w.targetDistanceMeters, unit, 1)})`
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
      lines.push(`  ${runOneLiner(run, unit)}`);
    }
  }
  return lines.join('\n');
}

export interface PlanGoalInput {
  goal: string;
  raceDate: string; // YYYY-MM-DD
  /** Canonical kilometres. The wizard converts from miles on entry so this
   * field always means the same thing regardless of the user's units. */
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
  unit: UnitSystem = 'metric',
  language: PromptLanguage = 'en',
): string {
  const todayIso = today.toISOString().slice(0, 10);
  const weeks = weeksUntil(goalInput.raceDate, today);
  // Always state the unit explicitly — a bare "16" read as km when the runner
  // meant miles would build a plan at ~60% of the intended volume.
  const volumeMeters = goalInput.currentWeeklyKm * 1000;
  const lines = [
    'You are an experienced running coach. Create a personalized training plan.',
    '',
    `Today is ${todayIso}.`,
    `Goal: ${goalInput.goal}`,
    `Race date: ${goalInput.raceDate} (${weeks} week(s) away).`,
    `Current volume: about ${fmtDistance(volumeMeters, unit, 1)} per week across ${goalInput.daysPerWeek} run(s)/week.`,
    `Express every distance and pace in ${unit === 'imperial' ? 'miles and min/mile' : 'kilometres and min/km'}.`,
  ];
  if (history.length > 0) {
    lines.push('Recent runs (newest first):');
    for (const run of history.slice(0, 8))
      lines.push(`  ${runOneLiner(run, unit)}`);
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
    // The JSON schema is canonical SI even when prose uses miles; without this
    // the model happily writes a mile count into a field named "...Meters".
    '- targetDistanceMeters is ALWAYS in METRES, whatever units the descriptions use. targetDurationSeconds (seconds) optional.',
  );
  if (language === 'he') {
    // FR-5.6 + dev plan §9.4: prose localized, schema untouched. Translating
    // the type enum would break parsePlanResponse's validation.
    lines.push(
      '- Write every "description" in HEBREW. Keep all JSON keys and the "type" values in English exactly as specified above.',
    );
  }
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
