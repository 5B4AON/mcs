/**
 * Morse Code Studio
 */

import { AppSettings, findChannelConflicts } from '../../services/settings.service';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';

export type TeachScenario = 'sending' | 'copying' | 'mobile';
export type TeachInputType = 'keyboard' | 'mouse' | 'touch' | 'midi' | 'serial';

export interface TeachParticipantDraft {
  role: 'teacher' | 'student' | 'additional';
  inputType: TeachInputType;
  name: string;
  color: string;
  keyCode: string;
  mode: 'straightKey' | 'paddle';
  dahKeyCode: string;
  midiDeviceId: string;
  midiChannel: number;
  midiNote: number;
  midiDahNote: number;
  serialPortIndex: number;
  serialPin: 'dsr' | 'cts' | 'dcd' | 'ri';
  serialDahPin: 'dsr' | 'cts' | 'dcd' | 'ri';
}

/** Steps of the guided setup. Review, preset and apply are shared by every goal. */
export type WizardStepId =
  | 'speed' | 'sidetone' | 'content' | 'timing' | 'feedback' | 'before' | 'tone'
  | 'teachScenarios' | 'teachParticipants' | 'teachInputs' | 'teachCopy'
  | 'teachMobile' | 'teachOutputs' | 'teachTiming' | 'teachDisplay' | 'teachExtras'
  | 'review' | 'preset' | 'apply' | 'done';

type WizardDraftKey = DraftKey | 'teachScenarios' | 'teachStudentCount' | 'teachParticipants'
  | 'teachRtdbChannelName' | 'teachRtdbChannelSecret' | 'teachRouteReconfigureConfirmed'
  | 'teachRtdbReconfigureConfirmed';

/** Ordered steps for each wizard goal. */
export const WIZARD_STEPS: Record<WizardGoalId, WizardStepId[]> = {
  type: ['speed', 'timing', 'sidetone', 'review', 'done'],
  practice: ['content', 'timing', 'feedback', 'review', 'done'],
  decode: ['before', 'tone', 'review', 'done'],
  teach: ['teachScenarios', 'teachParticipants', 'teachInputs', 'review', 'preset', 'apply', 'done'],
};

/** Settings a wizard step may propose to change. */
export type DraftKey =
  | 'encoderWpm' | 'sidetoneEnabled' | 'sidetoneFrequency'
  | 'practiceContentMode' | 'practiceGroupCount' | 'practiceCharGroupSize'
  | 'practiceIncludeLetters' | 'practiceIncludeNumbers' | 'practiceIncludePunctuation'
  | 'practiceWordLengths' | 'practiceFeedbackMode' | 'practiceRounds'
  | 'farnsworthEnabled' | 'farnsworthInputMode' | 'farnsworthEffectiveWpm' | 'farnsworthMultiplier'
  | 'farnsworthWordsworth' | 'farnsworthAppliesTo'
  | 'cwInputSource' | 'cwInputFrequency' | 'cwInputBandwidth' | 'cwInputAutoThreshold'
  | 'keyboardKeyerEnabled' | 'keyboardInputMappings'
  | 'mouseKeyerEnabled' | 'mouseKeyerSource' | 'mouseLeftAction' | 'mouseKeyerName' | 'mouseKeyerColor'
  | 'touchKeyerEnabled' | 'touchKeyerMode' | 'touchKeyerSource' | 'touchKeyerName' | 'touchKeyerColor'
  | 'midiInputMappings' | 'serialInputMappings'
  | 'practiceEnabled' | 'practicePipeline' | 'practiceSource'
  | 'sidetoneEnabled' | 'sidetoneFrequency'
  | 'rtdbInputChannelName' | 'rtdbOutputChannelName' | 'rtdbInputChannelSecret'
  | 'rtdbOutputChannelSecret' | 'rtdbInputName' | 'rtdbInputColor' | 'rtdbOutputName'
  | 'rtdbOutputColor' | 'rtdbOutputOverrideName' | 'rtdbOutputOverrideColor'
  | 'textBlurEnabled' | 'textBlurAppliesTo' | 'showProsigns' | 'prosignActionsEnabled'
  | 'prosignActions' | 'emojisEnabled' | 'emojiMappings';

/** Fields that are always part of a goal's proposal, not asked as a question. */
type ForcedKey = 'practiceEnabled' | 'practicePipeline';

export interface DraftValues extends Partial<Pick<AppSettings, DraftKey | ForcedKey>> {
  teachScenarios?: TeachScenario[];
  teachStudentCount?: number;
  teachParticipants?: TeachParticipantDraft[];
  teachRtdbChannelName?: string;
  teachRtdbChannelSecret?: string;
  teachRouteReconfigureConfirmed?: boolean;
  teachRtdbReconfigureConfirmed?: boolean;
}

/** Which settings each step asks about; Skip restores exactly these to their current values. */
export const STEP_FIELDS: Partial<Record<WizardStepId, WizardDraftKey[]>> = {
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
  teachCopy: [
    'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize',
    'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceWordLengths',
    'practiceFeedbackMode', 'practiceRounds',
  ],
  teachMobile: ['teachRtdbChannelName', 'teachRtdbChannelSecret', 'teachRtdbReconfigureConfirmed'],
  teachOutputs: ['sidetoneEnabled', 'sidetoneFrequency'],
  teachTiming: [
    'farnsworthEnabled', 'farnsworthInputMode', 'farnsworthEffectiveWpm', 'farnsworthMultiplier',
    'farnsworthWordsworth', 'farnsworthAppliesTo',
  ],
  teachDisplay: ['textBlurEnabled', 'textBlurAppliesTo', 'showProsigns', 'emojisEnabled', 'prosignActionsEnabled'],
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
  teach: [
    'keyboardKeyerEnabled', 'keyboardInputMappings',
    'mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseKeyerName', 'mouseKeyerColor',
    'touchKeyerEnabled', 'touchKeyerMode', 'touchKeyerSource', 'touchKeyerName', 'touchKeyerColor',
    'midiInputMappings', 'serialInputMappings',
    'practiceEnabled', 'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize',
    'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceWordLengths',
    'practiceFeedbackMode', 'practiceRounds', 'practicePipeline', 'practiceSource',
    'farnsworthEnabled', 'farnsworthInputMode', 'farnsworthEffectiveWpm', 'farnsworthMultiplier',
    'farnsworthWordsworth', 'farnsworthAppliesTo', 'sidetoneEnabled', 'sidetoneFrequency',
    'rtdbInputChannelName', 'rtdbOutputChannelName', 'rtdbInputChannelSecret',
    'rtdbOutputChannelSecret', 'rtdbInputName', 'rtdbInputColor', 'rtdbOutputName',
    'rtdbOutputColor', 'rtdbOutputOverrideName', 'rtdbOutputOverrideColor',
    'textBlurEnabled', 'textBlurAppliesTo', 'showProsigns', 'prosignActionsEnabled',
    'prosignActions', 'emojisEnabled', 'emojiMappings',
  ],
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

export const KEYBOARD_KEY_CODES = [
  'Space', 'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyN', 'KeyO', 'KeyP', 'KeyQ',
  'KeyR', 'KeyS', 'KeyT', 'KeyU', 'KeyV', 'KeyW', 'KeyX', 'KeyY', 'KeyZ',
];

const TEACH_COLORS = ['#88ccff', '#ffcc66', '#88ddaa', '#dd99ff', '#ff9999'];

/** Build one local teaching station with a distinct default identity and key. */
export function createTeachParticipant(
  role: TeachParticipantDraft['role'], index: number, base: AppSettings,
): TeachParticipantDraft {
  const occupiedKeys = new Set(base.keyboardInputMappings.flatMap(mapping =>
    mapping.mode === 'paddle' ? [mapping.keyCode, mapping.dahKeyCode] : [mapping.keyCode]));
  const candidateKeys = KEYBOARD_KEY_CODES.filter(code => !occupiedKeys.has(code));
  return {
    role,
    inputType: 'keyboard',
    name: role === 'teacher' ? 'Teacher' : role === 'additional' ? `Additional input ${index}` : `Student ${index}`,
    color: TEACH_COLORS[index % TEACH_COLORS.length],
    keyCode: candidateKeys[index] ?? '',
    mode: 'straightKey',
    dahKeyCode: '',
    midiDeviceId: '',
    midiChannel: 0,
    midiNote: 48 + index,
    midiDahNote: -1,
    serialPortIndex: -1,
    serialPin: 'dsr',
    serialDahPin: 'cts',
  };
}

const LABELS: Partial<Record<DraftKey | ForcedKey, string>> = {
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
  keyboardKeyerEnabled: 'Keyboard keying',
  keyboardInputMappings: 'Keyboard participant mappings',
  mouseKeyerEnabled: 'Mouse keying',
  mouseKeyerSource: 'Mouse key source',
  mouseLeftAction: 'Mouse key action',
  mouseKeyerName: 'Mouse participant name',
  mouseKeyerColor: 'Mouse participant color',
  touchKeyerEnabled: 'Touch keying',
  touchKeyerMode: 'Touch key mode',
  touchKeyerSource: 'Touch key source',
  touchKeyerName: 'Touch participant name',
  touchKeyerColor: 'Touch participant color',
  midiInputMappings: 'MIDI participant mappings',
  serialInputMappings: 'Serial participant mappings',
  practiceSource: 'Practice direction',
  rtdbInputChannelName: 'Shared RTDB channel',
  rtdbOutputChannelName: 'Shared RTDB channel',
  rtdbOutputName: 'Teacher display name',
  rtdbInputChannelSecret: 'Shared RTDB secret',
  rtdbOutputChannelSecret: 'Shared RTDB secret',
  rtdbInputName: 'RTDB receive name override',
  rtdbInputColor: 'RTDB receive color override',
  rtdbOutputColor: 'Teacher display color',
  rtdbOutputOverrideName: 'Override sender names',
  rtdbOutputOverrideColor: 'Override sender colors',
  textBlurEnabled: 'Blur conversation text',
  textBlurAppliesTo: 'Blur direction',
  showProsigns: 'Show prosign names',
  prosignActionsEnabled: 'Prosign actions',
  prosignActions: 'Prosign action choices',
  emojisEnabled: 'Show emoji replacements',
  emojiMappings: 'Emoji replacement mappings',
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
    case 'rtdbInputChannelSecret': case 'rtdbOutputChannelSecret':
      return value ? 'Set (hidden)' : 'Not set';
    case 'practiceContentMode': return CONTENT_NAMES[String(value)] ?? String(value);
    case 'practiceFeedbackMode': return FEEDBACK_NAMES[String(value)] ?? String(value);
    case 'practicePipeline': return value === 'local' ? 'This device only (local audio and vibration)' : 'Full pipeline (all enabled outputs)';
    case 'cwInputSource': return value === 'tx' ? 'TX (transmitted)' : 'RX (received)';
    case 'practiceWordLengths': return (value as number[]).join(', ') + ' letters';
    case 'farnsworthInputMode': return value === 'multiplier' ? 'Gap multiplier' : 'Effective WPM';
    case 'farnsworthMultiplier': return `${Number(value).toFixed(2)}\u00d7`;
    case 'farnsworthAppliesTo': return value === 'both' ? 'Received and sent Morse' : value === 'tx' ? 'Sent (TX) Morse only' : 'Received (RX) Morse only';
    case 'farnsworthEnabled': case 'farnsworthWordsworth':
    case 'sidetoneEnabled': case 'practiceEnabled': case 'keyboardKeyerEnabled':
    case 'mouseKeyerEnabled': case 'touchKeyerEnabled': case 'textBlurEnabled':
    case 'showProsigns': case 'prosignActionsEnabled': case 'emojisEnabled':
      return value ? 'On' : 'Off';
    case 'practiceIncludeLetters': case 'practiceIncludeNumbers': case 'practiceIncludePunctuation':
    case 'cwInputAutoThreshold': case 'rtdbOutputOverrideName': case 'rtdbOutputOverrideColor':
      return value ? 'Yes' : 'No';
    case 'keyboardInputMappings': {
      const mappings = value as AppSettings['keyboardInputMappings'];
      return mappings.map(mapping => `${mapping.name || 'Unnamed'} (${mapping.keyCode})`).join(', ') || 'None';
    }
    case 'midiInputMappings': {
      const mappings = value as AppSettings['midiInputMappings'];
      return mappings.map(mapping => `${mapping.name || 'Unnamed'} (${mapping.deviceId || 'any device'}, note ${mapping.value})`).join(', ') || 'None';
    }
    case 'serialInputMappings': {
      const mappings = value as AppSettings['serialInputMappings'];
      return mappings.map(mapping => `${mapping.name || 'Unnamed'} (${mapping.pin.toUpperCase()})`).join(', ') || 'None';
    }
    case 'prosignActions': {
      const actions = value as AppSettings['prosignActions'];
      return Object.entries(actions).filter(([, entry]) => entry.enabled)
        .map(([key, entry]) => `${key}: ${entry.action}`).join(', ') || 'None';
    }
    case 'emojiMappings': return `${(value as AppSettings['emojiMappings']).length} configured`;
    default: return String(value);
  }
}

/** Return the ordered wizard path for the selected teaching scenarios. */
export function wizardSteps(goal: WizardGoalId, draft: DraftValues): WizardStepId[] {
  if (goal !== 'teach') return WIZARD_STEPS[goal];
  const scenarios = draft.teachScenarios ?? [];
  return [
    'teachScenarios',
    'teachParticipants',
    ...(scenarios.includes('sending') ? ['teachInputs' as const] : []),
    ...(scenarios.includes('copying') ? ['teachCopy' as const] : []),
    ...(scenarios.includes('mobile') ? ['teachMobile' as const] : []),
    ...(scenarios.includes('sending') ? ['teachOutputs' as const] : []),
    'teachTiming',
    'teachDisplay',
    'teachExtras',
    'review',
    'preset',
    'apply',
    'done',
  ];
}

/** Starting draft: the goal's current values, so an untouched wizard proposes nothing. */
export function initialDraft(goal: WizardGoalId, base: AppSettings): DraftValues {
  const draft: Record<string, unknown> = {};
  for (const key of GOAL_FIELDS[goal]) {
    const value = base[key];
    draft[key] = Array.isArray(value) ? structuredClone(value) : value;
  }
  if (goal === 'teach') {
    draft['teachScenarios'] = [];
    draft['teachStudentCount'] = 1;
    draft['teachParticipants'] = [
      createTeachParticipant('teacher', 0, base),
      createTeachParticipant('student', 1, base),
    ];
    draft['teachRtdbChannelName'] = base.rtdbInputChannelName || base.rtdbOutputChannelName;
    draft['teachRtdbChannelSecret'] = base.rtdbInputChannelSecret || base.rtdbOutputChannelSecret;
    draft['teachRouteReconfigureConfirmed'] = false;
    draft['teachRtdbReconfigureConfirmed'] = false;
  }
  return draft as DraftValues;
}

/** What the goal will actually apply: the answers plus fixed, safe values. */
export function proposedValues(goal: WizardGoalId, draft: DraftValues, base: AppSettings): DraftValues {
  if (goal === 'practice') {
    return { ...draft, practiceEnabled: true, practicePipeline: 'local' };
  }
  if (goal === 'teach') {
    return { ...draft, ...buildTeachSettingsPatch(base, draft) };
  }
  return { ...draft };
}

/** Build the exact application patch for a reviewed teaching setup. */
export function buildTeachSettingsPatch(base: AppSettings, draft: DraftValues): Partial<AppSettings> {
  const scenarios = draft.teachScenarios ?? [];
  const participants = draft.teachParticipants ?? [];
  const patch: Partial<AppSettings> = {};

  if (scenarios.includes('sending')) {
    const keyboard = participants.filter(person => person.inputType === 'keyboard');
    const mouse = participants.filter(person => person.inputType === 'mouse');
    const touch = participants.filter(person => person.inputType === 'touch');
    const midi = participants.filter(person => person.inputType === 'midi');
    const serial = participants.filter(person => person.inputType === 'serial');

    if (keyboard.length) {
      patch.keyboardKeyerEnabled = true;
      patch.keyboardInputMappings = [
        ...base.keyboardInputMappings,
        ...keyboard.map(person => ({
          enabled: true,
          mode: person.mode,
          keyCode: person.keyCode,
          dahKeyCode: person.mode === 'paddle' ? person.dahKeyCode : '',
          source: 'tx' as const,
          reversePaddles: false,
          paddleMode: 'iambic-b' as const,
          name: person.name.trim(),
          color: person.color,
        })),
      ];
    }
    if (mouse.length) {
      patch.mouseKeyerEnabled = true;
      patch.mouseKeyerSource = 'tx';
      patch.mouseLeftAction = 'straightKey';
      patch.mouseKeyerName = mouse[0].name.trim();
      patch.mouseKeyerColor = mouse[0].color;
    }
    if (touch.length) {
      patch.touchKeyerEnabled = true;
      patch.touchKeyerMode = touch[0].mode === 'paddle' ? 'paddle' : 'straight';
      patch.touchKeyerSource = 'tx';
      patch.touchKeyerName = touch[0].name.trim();
      patch.touchKeyerColor = touch[0].color;
    }
    if (midi.length) {
      patch.midiInputMappings = [
        ...base.midiInputMappings,
        ...midi.map(person => ({
          enabled: true,
          deviceId: person.midiDeviceId,
          channel: person.midiChannel,
          source: 'tx' as const,
          mode: person.mode,
          value: person.midiNote,
          dahValue: person.mode === 'paddle' ? person.midiDahNote : -1,
          reversePaddles: false,
          name: person.name.trim(),
          color: person.color,
        })),
      ];
    }
    if (serial.length) {
      patch.serialInputMappings = [
        ...base.serialInputMappings,
        ...serial.map(person => ({
          enabled: true,
          mode: person.mode,
          pin: person.serialPin,
          dahPin: person.mode === 'paddle' ? person.serialDahPin : person.serialPin,
          invert: false,
          source: 'tx' as const,
          reversePaddles: false,
          paddleMode: 'iambic-b' as const,
          portIndex: person.serialPortIndex,
          pollInterval: 10,
          debounceMs: 5,
          name: person.name.trim(),
          color: person.color,
        })),
      ];
    }
  }

  if (scenarios.includes('copying')) {
    Object.assign(patch, {
      practiceEnabled: true,
      practicePipeline: 'local',
      practiceSource: 'rx',
      practiceContentMode: draft.practiceContentMode,
      practiceGroupCount: draft.practiceGroupCount,
      practiceCharGroupSize: draft.practiceCharGroupSize,
      practiceIncludeLetters: draft.practiceIncludeLetters,
      practiceIncludeNumbers: draft.practiceIncludeNumbers,
      practiceIncludePunctuation: draft.practiceIncludePunctuation,
      practiceWordLengths: structuredClone(draft.practiceWordLengths ?? base.practiceWordLengths),
      practiceFeedbackMode: draft.practiceFeedbackMode,
      practiceRounds: draft.practiceRounds,
    });
  }

  if (scenarios.includes('mobile')) {
    const teacher = participants.find(person => person.role === 'teacher');
    patch.rtdbInputChannelName = draft.teachRtdbChannelName?.trim() ?? '';
    patch.rtdbOutputChannelName = draft.teachRtdbChannelName?.trim() ?? '';
    patch.rtdbInputChannelSecret = draft.teachRtdbChannelSecret ?? '';
    patch.rtdbOutputChannelSecret = draft.teachRtdbChannelSecret ?? '';
    patch.rtdbInputName = '';
    patch.rtdbInputColor = '';
    patch.rtdbOutputName = teacher?.name.trim() || 'Teacher';
    patch.rtdbOutputColor = teacher?.color ?? '';
    patch.rtdbOutputOverrideName = false;
    patch.rtdbOutputOverrideColor = false;
  }

  if (scenarios.includes('sending')) {
    patch.sidetoneEnabled = draft.sidetoneEnabled ?? base.sidetoneEnabled;
    patch.sidetoneFrequency = draft.sidetoneFrequency ?? base.sidetoneFrequency;
  }

  patch.farnsworthEnabled = draft.farnsworthEnabled ?? base.farnsworthEnabled;
  patch.farnsworthInputMode = draft.farnsworthInputMode ?? base.farnsworthInputMode;
  patch.farnsworthEffectiveWpm = draft.farnsworthEffectiveWpm ?? base.farnsworthEffectiveWpm;
  patch.farnsworthMultiplier = draft.farnsworthMultiplier ?? base.farnsworthMultiplier;
  patch.farnsworthWordsworth = draft.farnsworthWordsworth ?? base.farnsworthWordsworth;
  patch.farnsworthAppliesTo = draft.farnsworthAppliesTo ?? base.farnsworthAppliesTo;
  patch.textBlurEnabled = draft.textBlurEnabled ?? base.textBlurEnabled;
  patch.textBlurAppliesTo = draft.textBlurAppliesTo ?? base.textBlurAppliesTo;
  patch.showProsigns = draft.showProsigns ?? base.showProsigns;
  patch.prosignActionsEnabled = draft.prosignActionsEnabled ?? base.prosignActionsEnabled;
  patch.prosignActions = structuredClone(draft.prosignActions ?? base.prosignActions);
  patch.emojisEnabled = draft.emojisEnabled ?? base.emojisEnabled;
  patch.emojiMappings = structuredClone(draft.emojiMappings ?? base.emojiMappings);
  return patch;
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
  const proposed = proposedValues(goal, draft, base);
  const changes: ReviewLine[] = [];
  const unchanged: { label: string; value: string }[] = [];
  for (const key of GOAL_FIELDS[goal]) {
    const from = base[key];
    const to = proposed[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({
        key,
        label: LABELS[key] ?? key,
        from: formatValue(key, from),
        to: formatValue(key, to),
      });
    } else {
      unchanged.push({ label: LABELS[key] ?? key, value: formatValue(key, from) });
    }
  }
  return { changes, unchanged };
}

/** True when the user has moved any answer away from the current settings. */
export function hasAnswerChanges(goal: WizardGoalId, base: AppSettings, draft: DraftValues): boolean {
  if (goal === 'teach') {
    const initial = initialDraft(goal, base);
    const answers: WizardDraftKey[] = [
      'teachScenarios', 'teachStudentCount', 'teachParticipants',
      'teachRtdbChannelName', 'teachRtdbChannelSecret', 'teachRouteReconfigureConfirmed',
      'teachRtdbReconfigureConfirmed',
    ];
    return answers.some(key => JSON.stringify(initial[key]) !== JSON.stringify(draft[key]))
      || GOAL_FIELDS[goal].some(key => JSON.stringify(base[key]) !== JSON.stringify(draft[key]));
  }
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
  if (step === 'teachScenarios' && !(draft.teachScenarios?.length)) {
    problems.push('Choose at least one teaching scenario.');
  }
  if (step === 'teachParticipants') {
    const count = draft.teachStudentCount;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 4) {
      problems.push('Choose between 0 and 4 local students. The teacher is additional.');
    } else if ((draft.teachParticipants?.filter(person => person.role !== 'additional').length ?? 0) !== count + 1) {
      problems.push('Add one input profile for the teacher and each student.');
    }
  }
  if (step === 'teachInputs') {
    const participants = draft.teachParticipants ?? [];
    if (participants.some(person => !person.name.trim() || person.name.length > 40)) {
      problems.push('Give each local participant a display name or emoji.');
    }
    const singleMouse = participants.filter(person => person.inputType === 'mouse').length;
    const singleTouch = participants.filter(person => person.inputType === 'touch').length;
    if (singleMouse > 1) {
      problems.push('This browser has one shared mouse input identity. Assign the mouse to one participant, or let students take turns under that identity.');
    }
    if (singleTouch > 1) {
      problems.push('This browser has one shared touch input identity. Assign touch input to one participant, or let students take turns under that identity.');
    }
    const keyCodes = new Set<string>();
    for (const person of participants.filter(entry => entry.inputType === 'keyboard')) {
      const keys = person.mode === 'paddle' ? [person.keyCode, person.dahKeyCode] : [person.keyCode];
      if (keys.some(key => !key)) {
        problems.push('Assign each keyboard participant a key; paddles need both a dit and dah key.');
        break;
      }
      if (keys.some(key => keyCodes.has(key))) {
        problems.push('Each keyboard participant needs a different key.');
        break;
      }
      const existingKeys = new Set(base.keyboardInputMappings.flatMap(mapping =>
        mapping.mode === 'paddle' ? [mapping.keyCode, mapping.dahKeyCode] : [mapping.keyCode]));
      if (keys.some(key => existingKeys.has(key))) {
        problems.push('A selected keyboard key is already mapped. Choose a different key so each student has a distinct input.');
        break;
      }
      keys.forEach(key => keyCodes.add(key));
    }
    const midiAssignments = new Set(base.midiInputMappings.map(mapping =>
      `${mapping.channel}:${mapping.value}:${mapping.mode === 'paddle' ? mapping.dahValue : ''}`));
    for (const person of participants.filter(entry => entry.inputType === 'midi')) {
      if (!Number.isInteger(person.midiChannel) || person.midiChannel < 0 || person.midiChannel > 16
        || !Number.isInteger(person.midiNote) || person.midiNote < 0 || person.midiNote > 127
        || (person.mode === 'paddle' && (!Number.isInteger(person.midiDahNote)
          || person.midiDahNote < 0 || person.midiDahNote > 127
          || person.midiDahNote === person.midiNote))) {
        problems.push('Choose a valid MIDI channel and distinct note numbers from 0 to 127.');
        break;
      }
      const assignment = `${person.midiChannel}:${person.midiNote}:${person.mode === 'paddle' ? person.midiDahNote : ''}`;
      if (midiAssignments.has(assignment)) {
        problems.push('Each MIDI participant needs a channel/note assignment that is not already in use.');
        break;
      }
      midiAssignments.add(assignment);
    }
    const serialAssignments = new Set(base.serialInputMappings.map(mapping =>
      `${mapping.portIndex}:${mapping.pin}:${mapping.mode === 'paddle' ? mapping.dahPin : ''}`));
    for (const person of participants.filter(entry => entry.inputType === 'serial')) {
      const assignment = `${person.serialPortIndex}:${person.serialPin}:${person.mode === 'paddle' ? person.serialDahPin : ''}`;
      if (person.serialPortIndex >= 0 && serialAssignments.has(assignment)) {
        problems.push('Each serial input needs a port/pin assignment that is not already in use.');
        break;
      }
      serialAssignments.add(assignment);
    }
    if (participants.some(person => person.inputType === 'serial' && person.serialPortIndex < 0)) {
      problems.push('Choose a serial device for each serial-key participant, or select another available input.');
    }
    const midiRouteChanges = base.midiInputEnabled
      && participants.some(person => person.inputType === 'midi');
    const serialRouteChanges = base.serialInputEnabled
      && participants.some(person => person.inputType === 'serial');
    if ((midiRouteChanges || serialRouteChanges) && !draft.teachRouteReconfigureConfirmed) {
      problems.push('Confirm before changing MIDI or serial mappings that are currently enabled.');
    }
  }
  if (step === 'teachCopy') {
    if (draft.practiceContentMode === 'characters' &&
      !draft.practiceIncludeLetters && !draft.practiceIncludeNumbers && !draft.practiceIncludePunctuation) {
      problems.push('Choose at least one kind of character.');
    }
    if (draft.practiceContentMode === 'words' && !(draft.practiceWordLengths?.length)) {
      problems.push('Choose at least one word length.');
    }
  }
  if (step === 'teachMobile') {
    if (!draft.teachRtdbChannelName?.trim()) problems.push('Enter the shared RTDB channel name.');
    if (!draft.teachRtdbChannelSecret?.trim()) problems.push('Enter the shared RTDB channel secret.');
    const activeRouteWillChange = (base.rtdbInputEnabled || base.rtdbOutputEnabled) &&
      (base.rtdbInputChannelName !== draft.teachRtdbChannelName
        || base.rtdbOutputChannelName !== draft.teachRtdbChannelName
        || base.rtdbInputChannelSecret !== draft.teachRtdbChannelSecret
        || base.rtdbOutputChannelSecret !== draft.teachRtdbChannelSecret);
    if (activeRouteWillChange && !draft.teachRtdbReconfigureConfirmed) {
      problems.push('Confirm before changing the shared channel used by an active RTDB route.');
    }
  }
  if (step === 'teachTiming' && draft.farnsworthEnabled) {
    if (draft.farnsworthInputMode === 'multiplier') {
      if (!inRange(draft.farnsworthMultiplier, LIMITS.farnsworthMultiplier.min, LIMITS.farnsworthMultiplier.max)) {
        problems.push(`Enter a gap multiplier from ${LIMITS.farnsworthMultiplier.min} to ${LIMITS.farnsworthMultiplier.max}.`);
      }
    } else if (!inRange(draft.farnsworthEffectiveWpm, LIMITS.farnsworthWpm.min, base.encoderWpm)) {
      problems.push(`Enter an effective speed from ${LIMITS.farnsworthWpm.min} up to your character speed of ${base.encoderWpm} WPM.`);
    }
  }
  if (step === 'teachOutputs' && draft.sidetoneEnabled &&
    !inRange(draft.sidetoneFrequency, LIMITS.sidetoneHz.min, LIMITS.sidetoneHz.max)) {
    problems.push(`Enter a pitch from ${LIMITS.sidetoneHz.min} to ${LIMITS.sidetoneHz.max} Hz.`);
  }
  if (step === 'teachExtras' && draft.emojiMappings?.some(mapping => !mapping.match.trim() || !mapping.emoji.trim())) {
    problems.push('Complete or remove any empty emoji replacement.');
  }
  return problems;
}

/** Every step's problems; the review blocks Apply while any remain. */
export function validateDraft(goal: WizardGoalId, draft: DraftValues, base: AppSettings): string[] {
  return wizardSteps(goal, draft).flatMap(step => validateStep(step, draft, base));
}

/** Channel conflicts the proposal would introduce (ones already present are not repeated). */
export function newChannelConflicts(base: AppSettings, patch: Partial<AppSettings>): string[] {
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
