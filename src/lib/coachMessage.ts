import type { PlannedWorkout } from '@/db/types';
import type { Translate } from '@/i18n';
import { summarizeRun } from '@/prompts/prompts';
import type { NewRun } from './saveRun';
import type { UnitSystem } from './units';

/**
 * The message posted to the coach thread after a run is saved. It is both a
 * prompt and a visible chat bubble, so the wording is localized while the
 * embedded summary stays in the structured format `summarizeRun` produces.
 */
export function buildCoachMessage({
  run,
  linkedWorkout,
  unitSystem,
  t,
}: {
  run: NewRun;
  linkedWorkout?: PlannedWorkout;
  unitSystem: UnitSystem;
  t: Translate;
}): string {
  const planNote = linkedWorkout
    ? `\n\n${t('coach.plannedNote', { description: linkedWorkout.description })}`
    : '';
  return [
    t('coach.runIntro'),
    '',
    summarizeRun({ ...run, matchStatus: 'unplanned' }, unitSystem),
    planNote,
    '',
    t('coach.runQuestion'),
  ].join('\n');
}

/**
 * The single message posted after a batch import, instead of one per run.
 *
 * Deliberately short: it announces the import and asks a question, but carries
 * no run summaries. The coach's own context builder already supplies recent
 * runs from the database, and inlining eighty summaries here would blow the
 * ~1,000-token post-run budget many times over.
 */
export function buildBatchImportMessage({
  count,
  rangeLabel,
  t,
}: {
  count: number;
  rangeLabel: string;
  t: Translate;
}): string {
  return [
    t('coach.batchIntro', { count, range: rangeLabel }),
    '',
    t('coach.batchQuestion'),
  ].join('\n');
}
