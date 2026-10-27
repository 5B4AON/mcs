/**
 * Morse Code Studio
 */

/** Settings tab that hosts a goal's target card. */
export type GoalTab = 'inputs' | 'outputs' | 'other';

/** Goals that also have a guided setup wizard. */
export type WizardGoalId = 'send' | 'type' | 'practice' | 'midi' | 'relay' | 'hardware' | 'decode' | 'teach';

/** Where a goal lands: an existing settings card, with the guidance shown while it is open. */
export interface GoalLanding {
  /** Tab that hosts the card */
  tab: GoalTab;
  /** DOM id of the existing card (`settings-card-<name>-card`) */
  cardId?: string;
}

/** Target of a navigation request emitted to the settings modal. */
export interface GoalTarget {
  tab: GoalTab;
  cardId?: string;
}

export type GoalIcon = 'keyboard' | 'speaker' | 'headphones' | 'midi' | 'globe' | 'radio' | 'waveform' | 'graduationCap';

/** One entry of the shared goal list used by the navigator and the setup wizard. */
export interface SetupGoal {
  /** Plain-language label, reused verbatim by the wizard */
  label: string;
  /** Key into `LANDINGS` */
  landing: string;
  /** Icon id drawn by the navigator */
  icon: GoalIcon;
  /** Present when a guided wizard exists for this goal */
  wizard?: WizardGoalId;
}

export const LANDINGS: Record<string, GoalLanding> = {
  'keyboard-keyer': {
    tab: 'inputs', cardId: 'settings-card-keyboard-keyer-card',
  },
  'mouse-keyer': {
    tab: 'inputs', cardId: 'settings-card-mouse-keyer-card',
  },
  'touch-keyer': {
    tab: 'inputs', cardId: 'settings-card-touch-keyer-card',
  },
  'mic': {
    tab: 'inputs', cardId: 'settings-card-mic-card',
  },
  'encoder': {
    tab: 'inputs', cardId: 'settings-card-encoder-card',
  },
  'practice': {
    tab: 'other', cardId: 'settings-card-practice-card',
  },
  'midi-input': {
    tab: 'inputs', cardId: 'settings-card-midi-input-card',
  },
  'serial-input': {
    tab: 'inputs', cardId: 'settings-card-serial-input-card',
  },
  'rtdb-input': {
    tab: 'inputs', cardId: 'settings-card-rtdb-input-card',
  },
  'rtdb-output': {
    tab: 'outputs', cardId: 'settings-card-rtdb-output-card',
  },
  'midi-output': {
    tab: 'outputs', cardId: 'settings-card-midi-output-card',
  },
  'opto-output': {
    tab: 'outputs', cardId: 'settings-card-audio-output-card',
  },
  'serial-output': {
    tab: 'outputs', cardId: 'settings-card-serial-output-card',
  },
  'winkeyer-output': {
    tab: 'outputs', cardId: 'settings-card-winkeyer-card',
  },
  'cw-detector': {
    tab: 'inputs', cardId: 'settings-card-cw-detector-card',
  },
  'teach': {
    tab: 'inputs',
  },
};

export const MAIN_GOALS: SetupGoal[] = [
  { label: 'Practice sending Morse with keyboard, mouse or touch', landing: 'keyboard-keyer', icon: 'keyboard', wizard: 'send' },
  { label: 'Type text and hear it as Morse', landing: 'encoder', icon: 'speaker', wizard: 'type' },
  { label: 'Practice receiving (copy practice)', landing: 'practice', icon: 'headphones', wizard: 'practice' },
  { label: 'Teach or demonstrate Morse', landing: 'teach', icon: 'graduationCap', wizard: 'teach' },
  { label: 'Talk to other people over the internet', landing: 'rtdb-input', icon: 'globe', wizard: 'relay' },
];

export const MORE_GOALS: SetupGoal[] = [
  { label: 'Use my paddle or key through MIDI', landing: 'midi-input', icon: 'midi', wizard: 'midi' },
  { label: 'Connect a radio or other hardware', landing: 'midi-output', icon: 'radio', wizard: 'hardware' },
  { label: 'Decode Morse from sound', landing: 'cw-detector', icon: 'waveform', wizard: 'decode' },
];

/** Convert a shared landing into a target for the settings modal. */
export function goalTargetForLanding(id: string): GoalTarget {
  const landing = LANDINGS[id];
  if (!landing) throw new Error(`Unknown settings landing: ${id}`);
  return landing.cardId ? { tab: landing.tab, cardId: landing.cardId } : { tab: landing.tab };
}
