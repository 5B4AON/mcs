/**
 * Morse Code Studio
 */

import { AppSettings, findChannelConflicts } from '../../services/settings.service';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';

/** Steps of the guided setup. `review` and `done` are shared by every goal. */
export type WizardStepId = 'speed' | 'sidetone' | 'content' | 'timing' | 'feedback' | 'before' | 'tone' | 'review' | 'done';

/** Ordered steps for each wizard goal. */
export const WIZARD_STEPS: Record<WizardGoalId, WizardStepId[]> = {
  type: ['speed', 'timing', 'sidetone', 'review', 'done'],
  practice: ['content', 'timing', 'feedback', 'review', 'done'],
  decode: ['before', 'tone', 'review', 'done'],
};

/** Settings a wizard step may propose to change. */
export type DraftKey =
  | 'encoderWpm' | 'sidetoneEnabled' | 'sidetoneFrequency'
  | 'practiceContentMode' | 'practiceGroupCount' | 'practiceCharGroupSize'
  | 'practiceIncludeLetters' | 'practiceIncludeNumbers' | 'practiceIncludePunctuation'
  | 'practiceWordLengths' | 'practiceFeedbackMode' | 'practiceRounds'
  | 'farnsworthEnabled' | 'farnsworthInputMode' | 'farnsworthEffectiveWpm' | 'farnsworthMultiplier'
  | 'farnsworthWordsworth' | 'farnsworthAppliesTo'
  | 'cwInputSource' | 'cwInputFrequency' | 'cwInputBandwidth' | 'cwInputAutoThreshold';

/** Fields that are always part of a goal's proposal, not asked as a question. */
type ForcedKey = 'practiceEnabled' | 'practicePipeline';

export type DraftValues = Partial<Pick<AppSettings, DraftKey | ForcedKey>>;

/** Which settings each step asks about; Skip restores exactly these to their current values. */
export const STEP_FIELDS: Partial<Record<WizardStepId, DraftKey[]>> = {
  speed: ['encoderWpm'],
  sidetone: ['sidetoneEnabled', 'sidetoneFrequency'],
  content: [
    'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize',
    'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceWordLengths',
  ],
  timing: [
    'farnsworthEnabled', 'farnsworthInputMode', 'farnsworthEffectiveWpm', 'farnsworthMultiplier',
    'farnsworthWordsworth', 'farnsworthAppliesTo',
  ],
  feedback: ['practiceFeedbackMode', 'practiceRounds'],
  tone: ['cwInputSource', 'cwInputFrequency', 'cwInputBandwidth', 'cwInputAutoThreshold'],
};

/** Every setting a goal's wizard can touch, in review order. */
export const GOAL_FIELDS: Record<WizardGoalId, (DraftKey | ForcedKey)[]> = {
  type: [
    'encoderWpm', 'farnsworthEnabled', 'farnsworthInputMode', 'farnsworthEffectiveWpm', 'farnsworthMultiplier',
    'farnsworthWordsworth', 'farnsworthAppliesTo', 'sidetoneEnabled', 'sidetoneFrequency',
  ],
  practice: [
    'practiceEnabled', 'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize',
    'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceWordLengths',
    'farnsworthEnabled', 'farnsworthInputMode', 'farnsworthEffectiveWpm', 'farnsworthMultiplier',
    'farnsworthWordsworth', 'farnsworthAppliesTo',
    'practiceFeedbackMode', 'practiceRounds', 'practicePipeline',
  ],
  decode: ['cwInputSource', 'cwInputFrequency', 'cwInputBandwidth', 'cwInputAutoThreshold'],
};

/** Allowed ranges, matching the existing settings cards. */
export const LIMITS = {
  wpm: { min: 5, max: 50 },
  sidetoneHz: { min: 500, max: 800 },
  cwHz: { min: 200, max: 2000 },
  cwBandwidth: { min: 100, max: 500 },
  farnsworthWpm: { min: 5 },
  farnsworthMultiplier: { min: 1, max: 10 },
};

const LABELS: Record<DraftKey | ForcedKey, string> = {
  encoderWpm: 'Typing speed (WPM)',
  sidetoneEnabled: 'Sidetone (sound on this device)',
  sidetoneFrequency: 'Sidetone pitch (Hz)',
  practiceEnabled: 'Copy practice',
  practiceContentMode: 'Practice content',
  practiceGroupCount: 'Items per sequence',
  practiceCharGroupSize: 'Characters per group',
  practiceIncludeLetters: 'Letters in the pool',
  practiceIncludeNumbers: 'Numbers in the pool',
  practiceIncludePunctuation: 'Punctuation in the pool',
  practiceWordLengths: 'Word lengths',
  farnsworthEnabled: 'Farnsworth timing (stretched gaps)',
  farnsworthInputMode: 'Gap setting',
  farnsworthEffectiveWpm: 'Effective speed (WPM)',
  farnsworthMultiplier: 'Gap multiplier',
  farnsworthWordsworth: 'Wordsworth (stretch only word gaps)',
  farnsworthAppliesTo: 'Farnsworth applies to',
  practiceFeedbackMode: 'Feedback',
  practiceRounds: 'Type-along rounds',
  practicePipeline: 'Where practice plays',
  cwInputSource: 'Detected signal is tagged as',
  cwInputFrequency: 'Tone frequency (Hz)',
  cwInputBandwidth: 'Tone bandwidth (Hz)',
  cwInputAutoThreshold: 'Automatic threshold',
};

const CONTENT_NAMES: Record<string, string> = {
  characters: 'Random characters', words: 'Random words', callsigns: 'Random callsigns',
};
const FEEDBACK_NAMES: Record<string, string> = {
  listen: 'Listen only', blur: 'Blurred (reveal button)', typealong: 'Type-along',
};

/** Plain-language rendering of a setting value for the review list. */
export function formatValue(key: DraftKey | ForcedKey, value: unknown): string {
  switch (key) {
    case 'practiceContentMode': return CONTENT_NAMES[String(value)] ?? String(value);
    case 'practiceFeedbackMode': return FEEDBACK_NAMES[String(value)] ?? String(value);
    case 'practicePipeline': return value === 'local' ? 'This device only (local audio and vibration)' : 'Full pipeline (all enabled outputs)';
    case 'cwInputSource': return value === 'tx' ? 'TX (transmitted)' : 'RX (received)';
    case 'practiceWordLengths': return (value as number[]).join(', ') + ' letters';
    case 'farnsworthInputMode': return value === 'multiplier' ? 'Gap multiplier' : 'Effective WPM';
    case 'farnsworthMultiplier': return `${Number(value).toFixed(2)}\u00d7`;
    case 'farnsworthAppliesTo': return value === 'both' ? 'Received and sent Morse' : value === 'tx' ? 'Sent (TX) Morse only' : 'Received (RX) Morse only';
    case 'farnsworthEnabled': case 'farnsworthWordsworth':
    case 'sidetoneEnabled': case 'practiceEnabled': return value ? 'On' : 'Off';
    case 'practiceIncludeLetters': case 'practiceIncludeNumbers': case 'practiceIncludePunctuation':
    case 'cwInputAutoThreshold': return value ? 'Yes' : 'No';
    default: return String(value);
  }
}

/** Starting draft: the goal's current values, so an untouched wizard proposes nothing. */
export function initialDraft(goal: WizardGoalId, base: AppSettings): DraftValues {
  const draft: Record<string, unknown> = {};
  for (const key of GOAL_FIELDS[goal]) {
    const value = base[key];
    draft[key] = Array.isArray(value) ? [...value] : value;
  }
  return draft as DraftValues;
}

/** What the goal will actually apply: the answers plus fixed, safe values. */
export function proposedValues(goal: WizardGoalId, draft: DraftValues): DraftValues {
  if (goal === 'practice') {
    return { ...draft, practiceEnabled: true, practicePipeline: 'local' };
  }
  return { ...draft };
}

/** One line of the review. */
export interface ReviewLine {
  key: DraftKey | ForcedKey;
  label: string;
  from: string;
  to: string;
}

/** Split a goal's fields into changed and unchanged lines for the review. */
export function buildReview(
  goal: WizardGoalId, base: AppSettings, draft: DraftValues,
): { changes: ReviewLine[]; unchanged: { label: string; value: string }[] } {
  const proposed = proposedValues(goal, draft);
  const changes: ReviewLine[] = [];
  const unchanged: { label: string; value: string }[] = [];
  for (const key of GOAL_FIELDS[goal]) {
    const from = base[key];
    const to = proposed[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ key, label: LABELS[key], from: formatValue(key, from), to: formatValue(key, to) });
    } else {
      unchanged.push({ label: LABELS[key], value: formatValue(key, from) });
    }
  }
  return { changes, unchanged };
}

/** True when the user has moved any answer away from the current settings. */
export function hasAnswerChanges(goal: WizardGoalId, base: AppSettings, draft: DraftValues): boolean {
  const start = initialDraft(goal, base);
  return GOAL_FIELDS[goal].some(key => JSON.stringify(start[key]) !== JSON.stringify(draft[key]));
}

/** Validation problems for one step, in plain language; empty when the step is fine. */
export function validateStep(step: WizardStepId, draft: DraftValues, base: AppSettings): string[] {
  const problems: string[] = [];
  const inRange = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (step === 'speed' && !inRange(draft.encoderWpm, LIMITS.wpm.min, LIMITS.wpm.max)) {
    problems.push(`Enter a speed from ${LIMITS.wpm.min} to ${LIMITS.wpm.max} WPM.`);
  }
  if (step === 'sidetone' && draft.sidetoneEnabled &&
    !inRange(draft.sidetoneFrequency, LIMITS.sidetoneHz.min, LIMITS.sidetoneHz.max)) {
    problems.push(`Enter a pitch from ${LIMITS.sidetoneHz.min} to ${LIMITS.sidetoneHz.max} Hz.`);
  }
  if (step === 'content') {
    if (draft.practiceContentMode === 'characters' &&
      !draft.practiceIncludeLetters && !draft.practiceIncludeNumbers && !draft.practiceIncludePunctuation) {
      problems.push('Choose at least one kind of character.');
    }
    if (draft.practiceContentMode === 'words' && !(draft.practiceWordLengths?.length)) {
      problems.push('Choose at least one word length.');
    }
  }
  if (step === 'timing' && draft.farnsworthEnabled) {
    if (draft.farnsworthInputMode === 'multiplier') {
      if (!inRange(draft.farnsworthMultiplier, LIMITS.farnsworthMultiplier.min, LIMITS.farnsworthMultiplier.max)) {
        problems.push(`Enter a gap multiplier from ${LIMITS.farnsworthMultiplier.min} to ${LIMITS.farnsworthMultiplier.max}.`);
      }
    } else if (!inRange(draft.farnsworthEffectiveWpm, LIMITS.farnsworthWpm.min, base.encoderWpm)) {
      problems.push(`Enter an effective speed from ${LIMITS.farnsworthWpm.min} up to your character speed of ${base.encoderWpm} WPM.`);
    }
  }
  if (step === 'tone') {
    if (!inRange(draft.cwInputFrequency, LIMITS.cwHz.min, LIMITS.cwHz.max)) {
      problems.push(`Enter a tone frequency from ${LIMITS.cwHz.min} to ${LIMITS.cwHz.max} Hz.`);
    }
    if (!inRange(draft.cwInputBandwidth, LIMITS.cwBandwidth.min, LIMITS.cwBandwidth.max)) {
      problems.push(`Enter a bandwidth from ${LIMITS.cwBandwidth.min} to ${LIMITS.cwBandwidth.max} Hz.`);
    }
  }
  return problems;
}

/** Every step's problems; the review blocks Apply while any remain. */
export function validateDraft(goal: WizardGoalId, draft: DraftValues, base: AppSettings): string[] {
  return WIZARD_STEPS[goal].flatMap(step => validateStep(step, draft, base));
}

/** Channel conflicts the proposal would introduce (ones already present are not repeated). */
export function newChannelConflicts(base: AppSettings, patch: DraftValues): string[] {
  const before = new Set(findChannelConflicts(base) ?? []);
  return (findChannelConflicts({ ...base, ...patch }) ?? []).filter(message => !before.has(message));
}

/** Audio outputs that are on and could feed the microphone back into the detector. */
export function feedbackRiskOutputs(settings: AppSettings): string[] {
  const outputs: string[] = [];
  if (settings.sidetoneEnabled) outputs.push('Sidetone');
  if (settings.optoEnabled) outputs.push('Key Output (audio channel)');
  return outputs;
}
