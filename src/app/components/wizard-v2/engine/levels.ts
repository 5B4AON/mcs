/**
 * Morse Code Studio
 */

import { StepQuestion, WizardLevel, WizardStep } from './flow-types';

/** Levels from least to most help-seeking: Novice sees the fewest, simplest steps. */
export const WIZARD_LEVELS: readonly WizardLevel[] = ['novice', 'intermediate', 'expert'];

/** Id of the question (and of the step) that asks for the level. */
export const LEVEL_QUESTION_ID = 'level';

/** Plain-language names of the levels, as shown in the wizard. */
export const WIZARD_LEVEL_LABELS: Record<WizardLevel, string> = {
  novice: 'Novice',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

/** Whether a value is a known level (a stored value may be missing or out of date). */
export function isWizardLevel(value: unknown): value is WizardLevel {
  return WIZARD_LEVELS.includes(value as WizardLevel);
}

/** True when a step with this lowest level is shown to a user of `level`. */
export function visibleAtLevel(stepLevel: WizardLevel | undefined, level: WizardLevel): boolean {
  return !stepLevel || WIZARD_LEVELS.indexOf(stepLevel) <= WIZARD_LEVELS.indexOf(level);
}

/** The level question: remembered between goals, so it never counts as a change of the setup. */
export const LEVEL_QUESTION: StepQuestion = {
  id: LEVEL_QUESTION_ID,
  label: 'Your level',
  kind: 'single',
  default: 'novice',
  preference: true,
  options: [
    { value: 'novice', label: 'Novice', hint: 'New to Morse or to this app. Fewest steps, with simple choices and safe defaults.' },
    { value: 'intermediate', label: 'Intermediate', hint: 'You handle routine tasks yourself. Adds the usual choices, such as speed and how things are checked.' },
    { value: 'expert', label: 'Expert', hint: 'You want every option, including the advanced ones.' },
  ],
};

/** First step of every goal that opts in with `levels`. */
export const LEVEL_STEP: WizardStep = {
  id: LEVEL_QUESTION_ID,
  title: 'How comfortable are you with Morse and this app?',
  intro: 'Your answer decides how many steps this guide asks. Steps that are skipped keep their current settings, and the review lists them.',
  questions: [LEVEL_QUESTION],
};
