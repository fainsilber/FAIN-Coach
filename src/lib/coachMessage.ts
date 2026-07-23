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
