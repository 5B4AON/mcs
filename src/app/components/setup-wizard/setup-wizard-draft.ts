/**
 * Morse Code Studio
 */

import { AppSettings, DecoderSource, findChannelConflicts, PaddleMode } from '../../services/settings.service';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';

export type TeachScenario = 'sending' | 'copying' | 'mobile';
export type TeachInputType = 'keyboard' | 'mouse' | 'touch' | 'midi' | 'serial';
export type SendInputMethod = 'keyboard' | 'mouse' | 'touch';
export type HardwareOutputMethod = 'opto' | 'serial' | 'winkeyer' | 'midi';

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
  source: DecoderSource;
  reversePaddles: boolean;
  paddleMode: PaddleMode;
  serialPortIndex: number;
  serialPin: 'dsr' | 'cts' | 'dcd' | 'ri';
  serialDahPin: 'dsr' | 'cts' | 'dcd' | 'ri';
  serialInvert: boolean;
  serialPollInterval: number;
  serialDebounceMs: number;
}

/** Steps of the guided setup. Review and done are shared by every goal. */
export type WizardStepId =
  | 'speed' | 'sidetone' | 'content' | 'timing' | 'feedback' | 'before' | 'tone'
  | 'sendInput' | 'midiInput' | 'relay' | 'hardware'
  | 'teachScenarios' | 'teachParticipants' | 'teachInputs' | 'teachCopy'
  | 'teachMobile' | 'teachOutputs' | 'teachTiming' | 'teachDisplay' | 'teachExtras'
  | 'review' | 'done';

type WizardDraftKey = DraftKey | 'teachScenarios' | 'teachStudentCount' | 'teachParticipants'
  | 'teachRtdbChannelName' | 'teachRtdbChannelSecret' | 'teachRouteReconfigureConfirmed'
  | 'teachRtdbReconfigureConfirmed' | 'sendMethods' | 'hardwareMethods'
  | 'relayReceive' | 'relaySend';

/** Ordered steps for each wizard goal. */
export const WIZARD_STEPS: Record<WizardGoalId, WizardStepId[]> = {
  send: ['sendInput', 'review', 'done'],
  type: ['speed', 'timing', 'sidetone', 'review', 'done'],
  practice: ['content', 'timing', 'feedback', 'review', 'done'],
  midi: ['midiInput', 'review', 'done'],
  relay: ['relay', 'review', 'done'],
  hardware: ['hardware', 'review', 'done'],
  decode: ['before', 'tone', 'review', 'done'],
  teach: ['teachScenarios', 'teachParticipants', 'teachInputs', 'review', 'done'],
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
  | 'mouseKeyerEnabled' | 'mouseKeyerSource' | 'mouseLeftAction' | 'mouseMiddleAction'
  | 'mouseRightAction' | 'mouseReversePaddles' | 'mousePaddleMode' | 'mouseKeyerName' | 'mouseKeyerColor'
  | 'touchKeyerEnabled' | 'touchKeyerMode' | 'touchKeyerSource' | 'touchLeftPaddle' | 'touchRightPaddle'
  | 'touchReversePaddles' | 'touchPaddleMode' | 'touchKeyerName' | 'touchKeyerColor'
  | 'midiInputMappings' | 'serialInputMappings'
  | 'practiceEnabled' | 'practicePipeline' | 'practiceSource'
  | 'sidetoneEnabled' | 'sidetoneFrequency'
  | 'rtdbInputChannelName' | 'rtdbOutputChannelName' | 'rtdbInputChannelSecret'
  | 'rtdbOutputChannelSecret' | 'rtdbInputName' | 'rtdbInputColor' | 'rtdbInputOverrideWpm'
  | 'rtdbOutputName' | 'rtdbOutputColor' | 'rtdbOutputOverrideName' | 'rtdbOutputOverrideColor'
  | 'rtdbAllowInputRelay' | 'rtdbRelaySuppressOtherInputs'
  | 'midiInputEnabled' | 'rtdbInputEnabled' | 'rtdbOutputEnabled'
  | 'rtdbInputSource' | 'rtdbOutputForward'
  | 'optoEnabled' | 'optoOutputDeviceId' | 'optoOutputChannel' | 'optoMode' | 'optoFrequency' | 'optoAmplitude' | 'optoForward'
  | 'serialEnabled' | 'serialOutputMappings'
  | 'winkeyerEnabled' | 'winkeyerPortIndex' | 'winkeyerWpm' | 'winkeyerForward'
  | 'midiOutputEnabled' | 'midiOutputMappings' | 'midiOutputOverrideWpm'
  | 'textBlurEnabled' | 'textBlurAppliesTo' | 'showProsigns' | 'prosignActionsEnabled'
  | 'prosignActions' | 'emojisEnabled' | 'emojiMappings';

/** Fields that are always part of a goal's proposal, not asked as a question. */
type ForcedKey = 'practiceEnabled' | 'practicePipeline';

export interface DraftValues extends Partial<Pick<AppSettings, DraftKey | ForcedKey>> {
  sendMethods?: SendInputMethod[];
  hardwareMethods?: HardwareOutputMethod[];
  relayReceive?: boolean;
  relaySend?: boolean;
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
  sendInput: [
    'sendMethods', 'keyboardKeyerEnabled', 'keyboardInputMappings',
    'mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction',
    'mouseRightAction', 'mouseReversePaddles', 'mousePaddleMode', 'mouseKeyerName', 'mouseKeyerColor',
    'touchKeyerEnabled', 'touchKeyerSource', 'touchKeyerMode', 'touchLeftPaddle', 'touchRightPaddle',
    'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor',
  ],
  midiInput: ['midiInputEnabled', 'midiInputMappings'],
  relay: [
    'relayReceive', 'relaySend',
    'rtdbInputEnabled', 'rtdbInputSource', 'rtdbInputChannelName', 'rtdbInputChannelSecret',
    'rtdbInputOverrideWpm', 'rtdbInputName', 'rtdbInputColor',
    'rtdbOutputEnabled', 'rtdbOutputForward', 'rtdbOutputChannelName', 'rtdbOutputChannelSecret',
    'rtdbOutputName', 'rtdbOutputColor', 'rtdbOutputOverrideName', 'rtdbOutputOverrideColor',
    'rtdbAllowInputRelay', 'rtdbRelaySuppressOtherInputs',
  ],
  hardware: [
    'hardwareMethods', 'optoEnabled', 'optoOutputDeviceId', 'optoOutputChannel',
    'optoMode', 'optoFrequency', 'optoAmplitude', 'optoForward',
    'serialEnabled', 'serialOutputMappings', 'winkeyerEnabled', 'winkeyerPortIndex',
    'winkeyerWpm', 'winkeyerForward', 'midiOutputEnabled', 'midiOutputMappings',
    'midiOutputOverrideWpm',
  ],
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
  send: [
    'keyboardKeyerEnabled', 'keyboardInputMappings',
    'mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction',
    'mouseRightAction', 'mouseReversePaddles', 'mousePaddleMode', 'mouseKeyerName', 'mouseKeyerColor',
    'touchKeyerEnabled', 'touchKeyerSource', 'touchKeyerMode', 'touchLeftPaddle', 'touchRightPaddle',
    'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor',
  ],
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
  midi: ['midiInputEnabled', 'midiInputMappings'],
  relay: [
    'rtdbInputEnabled', 'rtdbInputChannelName', 'rtdbInputChannelSecret', 'rtdbInputSource',
    'rtdbInputOverrideWpm', 'rtdbInputName', 'rtdbInputColor',
    'rtdbOutputEnabled', 'rtdbOutputChannelName', 'rtdbOutputChannelSecret', 'rtdbOutputForward',
    'rtdbOutputName', 'rtdbOutputColor', 'rtdbOutputOverrideName', 'rtdbOutputOverrideColor',
    'rtdbAllowInputRelay', 'rtdbRelaySuppressOtherInputs',
  ],
  hardware: [
    'optoEnabled', 'optoOutputDeviceId', 'optoOutputChannel', 'optoMode', 'optoFrequency',
    'optoAmplitude', 'optoForward', 'serialEnabled', 'serialOutputMappings',
    'winkeyerEnabled', 'winkeyerPortIndex', 'winkeyerWpm', 'winkeyerForward',
    'midiOutputEnabled', 'midiOutputMappings', 'midiOutputOverrideWpm',
  ],
  decode: ['cwInputSource', 'cwInputFrequency', 'cwInputBandwidth', 'cwInputAutoThreshold'],
  teach: [
    'keyboardKeyerEnabled', 'keyboardInputMappings',
    'mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction', 'mouseRightAction',
    'mouseReversePaddles', 'mousePaddleMode', 'mouseKeyerName', 'mouseKeyerColor',
    'touchKeyerEnabled', 'touchKeyerMode', 'touchKeyerSource', 'touchLeftPaddle', 'touchRightPaddle',
    'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor',
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
    source: 'tx',
    reversePaddles: false,
    paddleMode: 'iambic-b',
    serialPortIndex: -1,
    serialPin: 'dsr',
    serialDahPin: 'cts',
    serialInvert: false,
    serialPollInterval: 10,
    serialDebounceMs: 5,
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
  mouseLeftAction: 'Left mouse button action',
  mouseMiddleAction: 'Middle mouse button action',
  mouseRightAction: 'Right mouse button action',
  mouseReversePaddles: 'Reverse mouse paddles',
  mousePaddleMode: 'Mouse paddle mode',
  mouseKeyerName: 'Mouse participant name',
  mouseKeyerColor: 'Mouse participant color',
  touchKeyerEnabled: 'Touch keying',
  touchKeyerMode: 'Touch key mode',
  touchKeyerSource: 'Touch key source',
  touchLeftPaddle: 'Left touch paddle',
  touchRightPaddle: 'Right touch paddle',
  touchReversePaddles: 'Reverse touch paddles',
  touchPaddleMode: 'Touch paddle mode',
  touchKeyerName: 'Touch participant name',
  touchKeyerColor: 'Touch participant color',
  midiInputEnabled: 'MIDI key/paddle input',
  midiInputMappings: 'MIDI participant mappings',
  serialInputMappings: 'Serial participant mappings',
  practiceSource: 'Practice direction',
  rtdbInputEnabled: 'Online relay input',
  rtdbOutputEnabled: 'Online relay output',
  rtdbInputChannelName: 'Shared RTDB channel',
  rtdbOutputChannelName: 'Shared RTDB channel',
  rtdbInputOverrideWpm: 'Receive speed override (WPM)',
  rtdbInputName: 'Receive participant name',
  rtdbInputColor: 'Receive participant color',
  rtdbOutputName: 'Send participant name',
  rtdbOutputColor: 'Send participant color',
  rtdbInputSource: 'Relay input direction',
  rtdbOutputForward: 'Relay output direction',
  rtdbOutputOverrideName: 'Override input-specific names',
  rtdbOutputOverrideColor: 'Override input-specific colors',
  rtdbAllowInputRelay: 'Allow received characters to relay',
  rtdbRelaySuppressOtherInputs: 'Suppress other inputs while relaying',
  optoEnabled: 'Radio keying through audio optocoupler',
  optoOutputDeviceId: 'Optocoupler audio device',
  optoOutputChannel: 'Optocoupler channel',
  optoMode: 'Optocoupler drive mode',
  optoFrequency: 'Optocoupler frequency (Hz)',
  optoAmplitude: 'Optocoupler output level',
  optoForward: 'Optocoupler forwarding',
  serialEnabled: 'Serial radio keying',
  serialOutputMappings: 'Serial output mappings',
  winkeyerEnabled: 'WinKeyer radio keying',
  winkeyerPortIndex: 'WinKeyer serial port',
  winkeyerWpm: 'WinKeyer speed (WPM)',
  winkeyerForward: 'WinKeyer forwarding',
  midiOutputEnabled: 'MIDI radio keying',
  midiOutputMappings: 'MIDI output mappings',
  midiOutputOverrideWpm: 'Override MIDI output speed',
  rtdbInputChannelSecret: 'Shared RTDB secret',
  rtdbOutputChannelSecret: 'Shared RTDB secret',
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
    case 'cwInputSource': case 'rtdbInputSource':
      return value === 'tx' ? 'TX (transmitted)' : 'RX (received)';
    case 'optoForward': case 'winkeyerForward': case 'rtdbOutputForward':
      return value === 'both' ? 'RX and TX' : value === 'tx' ? 'TX only' : 'RX only';
    case 'optoMode': return value === 'ac' ? 'AC oscillator' : 'DC';
    case 'optoAmplitude': return Number(value).toFixed(2);
    case 'optoFrequency': return `${value} Hz`;
    case 'optoOutputChannel': return value === 'left' ? 'Left' : 'Right';
    case 'practiceWordLengths': return (value as number[]).join(', ') + ' letters';
    case 'farnsworthInputMode': return value === 'multiplier' ? 'Gap multiplier' : 'Effective WPM';
    case 'farnsworthMultiplier': return `${Number(value).toFixed(2)}\u00d7`;
    case 'farnsworthAppliesTo': return value === 'both' ? 'Received and sent Morse' : value === 'tx' ? 'Sent (TX) Morse only' : 'Received (RX) Morse only';
    case 'farnsworthEnabled': case 'farnsworthWordsworth':
    case 'sidetoneEnabled': case 'practiceEnabled': case 'keyboardKeyerEnabled':
    case 'mouseKeyerEnabled': case 'touchKeyerEnabled': case 'textBlurEnabled':
    case 'showProsigns': case 'prosignActionsEnabled': case 'emojisEnabled':
    case 'midiInputEnabled': case 'midiOutputOverrideWpm': case 'rtdbInputEnabled':
    case 'rtdbOutputEnabled': case 'rtdbInputOverrideWpm':
    case 'optoEnabled': case 'serialEnabled': case 'winkeyerEnabled': case 'midiOutputEnabled':
      return value ? 'On' : 'Off';
    case 'practiceIncludeLetters': case 'practiceIncludeNumbers': case 'practiceIncludePunctuation':
    case 'cwInputAutoThreshold': case 'rtdbOutputOverrideName': case 'rtdbOutputOverrideColor':
      return value ? 'Yes' : 'No';
    case 'keyboardInputMappings': {
      const mappings = value as AppSettings['keyboardInputMappings'];
      return mappings.map(mapping =>
        `${mapping.enabled ? 'On' : 'Off'}: ${mapping.name || 'Unnamed'} (${mapping.mode === 'paddle'
          ? `${mapping.keyCode}/${mapping.dahKeyCode}, ${mapping.paddleMode}${mapping.reversePaddles ? ', reversed' : ''}`
          : mapping.keyCode}, ${mapping.source.toUpperCase()})`).join('; ') || 'None';
    }
    case 'midiInputMappings': {
      const mappings = value as AppSettings['midiInputMappings'];
      return mappings.map(mapping =>
        `${mapping.enabled ? 'On' : 'Off'}: ${mapping.name || 'Unnamed'} (${mapping.deviceId || 'any device'}, ch ${mapping.channel}, ${mapping.mode === 'paddle' ? `notes ${mapping.value}/${mapping.dahValue}` : `note ${mapping.value}`}, ${mapping.source.toUpperCase()}${mapping.reversePaddles ? ', reversed' : ''})`)
        .join('; ') || 'None';
    }
    case 'serialOutputMappings': {
      const mappings = value as AppSettings['serialOutputMappings'];
      return mappings.map(mapping => `${mapping.enabled ? 'On' : 'Off'} (port ${mapping.portIndex + 1}, ${mapping.pin.toUpperCase()}, ${mapping.forward.toUpperCase()}${mapping.invert ? ', inverted' : ''}${mapping.relayInputIndices.length ? `, relay inputs ${mapping.relayInputIndices.map(index => index + 1).join('/')}` : ''}${mapping.relaySuppressOtherInputs ? ', relay only' : ''})`).join('; ') || 'None';
    }
    case 'midiOutputMappings': {
      const mappings = value as AppSettings['midiOutputMappings'];
      return mappings.map(mapping => `${mapping.enabled ? 'On' : 'Off'} (${mapping.deviceId || 'no device'}, channel ${mapping.channel}, ${mapping.mode === 'paddle' ? `notes ${mapping.value}/${mapping.dahValue}` : `note ${mapping.value}`}, ${mapping.forward.toUpperCase()}${mapping.relayInputIndices.length ? `, relay inputs ${mapping.relayInputIndices.map(index => index + 1).join('/')}` : ''}${mapping.relaySuppressOtherInputs ? ', relay only' : ''})`).join('; ') || 'None';
    }
    case 'serialInputMappings': {
      const mappings = value as AppSettings['serialInputMappings'];
      return mappings.map(mapping =>
        `${mapping.enabled ? 'On' : 'Off'}: ${mapping.name || 'Unnamed'} (port ${mapping.portIndex + 1}, ${mapping.mode === 'paddle' ? `${mapping.pin.toUpperCase()}/${mapping.dahPin.toUpperCase()}` : mapping.pin.toUpperCase()}, ${mapping.source.toUpperCase()}${mapping.invert ? ', inverted' : ''}${mapping.mode === 'paddle' ? `, ${mapping.paddleMode}${mapping.reversePaddles ? ', reversed' : ''}` : ''}, poll ${mapping.pollInterval} ms, debounce ${mapping.debounceMs} ms)`)
        .join('; ') || 'None';
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
  if (goal === 'send') {
    draft['sendMethods'] = [
      ...(base.keyboardKeyerEnabled ? ['keyboard' as const] : []),
      ...(base.mouseKeyerEnabled ? ['mouse' as const] : []),
      ...(base.touchKeyerEnabled ? ['touch' as const] : []),
    ];
  }
  if (goal === 'hardware') {
    draft['hardwareMethods'] = [
      ...(base.optoEnabled ? ['opto' as const] : []),
      ...(base.serialEnabled ? ['serial' as const] : []),
      ...(base.winkeyerEnabled ? ['winkeyer' as const] : []),
      ...(base.midiOutputEnabled ? ['midi' as const] : []),
    ];
    draft['serialInputMappings'] = structuredClone(base.serialInputMappings);
    draft['midiInputMappings'] = structuredClone(base.midiInputMappings);
  }
  if (goal === 'midi' && !base.midiInputEnabled) {
    draft['midiInputEnabled'] = true;
  }
  if (goal === 'relay') {
    draft['relayReceive'] = base.rtdbInputEnabled;
    draft['relaySend'] = base.rtdbOutputEnabled;
  }
  return draft as DraftValues;
}

/** What the goal will actually apply: the answers plus fixed, safe values. */
export function proposedValues(goal: WizardGoalId, draft: DraftValues, base: AppSettings): DraftValues {
  if (goal === 'send') {
    const methods = draft.sendMethods ?? [];
    return {
      ...draft,
      keyboardKeyerEnabled: methods.includes('keyboard'),
      mouseKeyerEnabled: methods.includes('mouse'),
      touchKeyerEnabled: methods.includes('touch'),
    };
  }
  if (goal === 'midi') {
    return { ...draft, midiInputEnabled: true };
  }
  if (goal === 'relay') {
    return {
      ...draft,
      rtdbInputEnabled: !!draft.relayReceive,
      rtdbOutputEnabled: !!draft.relaySend,
    };
  }
  if (goal === 'hardware') {
    const methods = draft.hardwareMethods ?? [];
    return {
      ...draft,
      optoEnabled: methods.includes('opto'),
      serialEnabled: methods.includes('serial'),
      winkeyerEnabled: methods.includes('winkeyer'),
      midiOutputEnabled: methods.includes('midi'),
    };
  }
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
          source: person.source,
          reversePaddles: person.mode === 'paddle' ? person.reversePaddles : false,
          paddleMode: person.paddleMode,
          name: person.name.trim(),
          color: person.color,
        })),
      ];
    }
    if (mouse.length) {
      patch.mouseKeyerEnabled = true;
      patch.mouseKeyerSource = draft.mouseKeyerSource ?? base.mouseKeyerSource;
      patch.mouseLeftAction = draft.mouseLeftAction ?? base.mouseLeftAction;
      patch.mouseMiddleAction = draft.mouseMiddleAction ?? base.mouseMiddleAction;
      patch.mouseRightAction = draft.mouseRightAction ?? base.mouseRightAction;
      patch.mouseReversePaddles = draft.mouseReversePaddles ?? base.mouseReversePaddles;
      patch.mousePaddleMode = draft.mousePaddleMode ?? base.mousePaddleMode;
      patch.mouseKeyerName = mouse[0].name.trim();
      patch.mouseKeyerColor = mouse[0].color;
    }
    if (touch.length) {
      patch.touchKeyerEnabled = true;
      patch.touchKeyerMode = touch[0].mode === 'paddle' ? 'paddle' : 'straight';
      patch.touchKeyerSource = draft.touchKeyerSource ?? base.touchKeyerSource;
      patch.touchLeftPaddle = draft.touchLeftPaddle ?? base.touchLeftPaddle;
      patch.touchRightPaddle = draft.touchRightPaddle ?? base.touchRightPaddle;
      patch.touchReversePaddles = draft.touchReversePaddles ?? base.touchReversePaddles;
      patch.touchPaddleMode = draft.touchPaddleMode ?? base.touchPaddleMode;
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
          source: person.source,
          mode: person.mode,
          value: person.midiNote,
          dahValue: person.mode === 'paddle' ? person.midiDahNote : -1,
          reversePaddles: person.mode === 'paddle' ? person.reversePaddles : false,
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
          invert: person.serialInvert,
          source: person.source,
          reversePaddles: person.mode === 'paddle' ? person.reversePaddles : false,
          paddleMode: person.paddleMode,
          portIndex: person.serialPortIndex,
          pollInterval: person.serialPollInterval,
          debounceMs: person.serialDebounceMs,
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
  const initialValues = proposedValues(goal, start, base);
  const currentValues = proposedValues(goal, draft, base);
  return GOAL_FIELDS[goal].some(key => JSON.stringify(initialValues[key]) !== JSON.stringify(currentValues[key]));
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
  if (step === 'sendInput') {
    const methods = draft.sendMethods ?? [];
    if (!methods.length) problems.push('Choose a keyboard, mouse or touch keyer.');
    if (methods.includes('keyboard')) {
      const mappings = (draft.keyboardInputMappings ?? []).filter(mapping => mapping.enabled);
      if (!mappings.length) {
        problems.push('Enable and configure at least one keyboard key or paddle mapping.');
      }
      const assignedKeys = new Set<string>();
      for (const mapping of mappings) {
        const keys = mapping.mode === 'paddle' ? [mapping.keyCode, mapping.dahKeyCode] : [mapping.keyCode];
        if (keys.some(key => !key) || mapping.mode === 'paddle' && mapping.keyCode === mapping.dahKeyCode) {
          problems.push('Assign a key to each enabled keyboard mapping; paddle mappings need two different keys.');
          break;
        }
        if (keys.some(key => assignedKeys.has(key))) {
          problems.push('Each enabled keyboard mapping must use different keys.');
          break;
        }
        keys.forEach(key => assignedKeys.add(key));
        if (mapping.name.length > 20) {
          problems.push('Keyboard display names must be 20 characters or fewer.');
          break;
        }
      }
    }
    if (methods.includes('mouse') && draft.mouseLeftAction === 'none'
      && draft.mouseMiddleAction === 'none' && draft.mouseRightAction === 'none') {
      problems.push('Assign at least one mouse button action before enabling mouse keying.');
    }
    if (methods.includes('mouse')) {
      const actions = [draft.mouseLeftAction, draft.mouseMiddleAction, draft.mouseRightAction]
        .filter(action => action && action !== 'none');
      if (new Set(actions).size !== actions.length) {
        problems.push('Assign each mouse action to only one button.');
      }
    }
    if (methods.includes('touch') && draft.touchKeyerMode === 'paddle'
      && draft.touchLeftPaddle === draft.touchRightPaddle) {
      problems.push('Assign different dit and dah actions to the left and right touch areas.');
    }
  }
  if (step === 'midiInput') {
    const mappings = draft.midiInputMappings ?? [];
    if (!mappings.some(mapping => mapping.enabled)) {
      problems.push('Enable and configure at least one MIDI key or paddle mapping in MIDI Input settings.');
    } else if (mappings.some(mapping => mapping.enabled && !mapping.deviceId.trim())) {
      problems.push('Select an exact MIDI input device for every enabled mapping; an any-device mapping is not specific enough.');
    } else if (mappings.some(mapping => mapping.enabled && (
      !Number.isInteger(mapping.channel) || mapping.channel < 0 || mapping.channel > 16
      || !Number.isInteger(mapping.value) || mapping.value < 0 || mapping.value > 127
      || (mapping.mode === 'paddle' && (!Number.isInteger(mapping.dahValue)
        || mapping.dahValue < 0 || mapping.dahValue > 127 || mapping.dahValue === mapping.value))
      || mapping.name.length > 20
    ))) {
      problems.push('Check enabled MIDI mappings: use channel 0–16, distinct paddle notes from 0–127, and names up to 20 characters.');
    }
  }
  if (step === 'relay') {
    if (!draft.relayReceive && !draft.relaySend
      && !base.rtdbInputEnabled && !base.rtdbOutputEnabled) {
      problems.push('Choose whether to receive from or send to the shared channel.');
    }
    const validChannel = (value: string) => {
      const channel = value.trim();
      return channel.length > 0 && channel.length <= 50 && !/[.#$\[\]\/]/.test(channel);
    };
    if (draft.relayReceive && !validChannel(draft.rtdbInputChannelName ?? '')) {
      problems.push('Enter a receive channel name up to 50 characters without periods, slashes, brackets, or dollar signs.');
    }
    if (draft.relayReceive && !(draft.rtdbInputChannelSecret ?? '').trim()) {
      problems.push('Enter the receive channel secret.');
    }
    if (draft.relaySend && !validChannel(draft.rtdbOutputChannelName ?? '')) {
      problems.push('Enter a send channel name up to 50 characters without periods, slashes, brackets, or dollar signs.');
    }
    if (draft.relaySend && !(draft.rtdbOutputChannelSecret ?? '').trim()) {
      problems.push('Enter the send channel secret.');
    }
    if (draft.relaySend && !(draft.rtdbOutputName ?? '').trim()) {
      problems.push('Enter the display name used for characters sent to the channel.');
    }
    if (draft.relaySend && (draft.rtdbOutputName ?? '').length > 20) {
      problems.push('The send display name must be 20 characters or fewer.');
    }
    if (draft.relaySend && draft.rtdbOutputOverrideColor && !draft.rtdbOutputColor) {
      problems.push('Choose a send color before overriding input-specific colors.');
    }
    if (draft.rtdbAllowInputRelay && (!draft.relayReceive || !draft.relaySend
      || draft.rtdbInputChannelName === draft.rtdbOutputChannelName
      && draft.rtdbInputChannelSecret === draft.rtdbOutputChannelSecret)) {
      problems.push('RTDB input relay needs both directions and different channel/secret combinations to avoid a feedback loop.');
    }
  }
  if (step === 'hardware') {
    const methods = draft.hardwareMethods ?? [];
    if (!methods.length && !base.optoEnabled && !base.serialEnabled && !base.winkeyerEnabled && !base.midiOutputEnabled) {
      problems.push('Choose at least one radio-keying output.');
    }
    if (methods.includes('opto') && (!draft.optoOutputDeviceId || draft.optoOutputDeviceId === 'default')) {
      problems.push('Choose a specific audio device for the optocoupler; System Default is not accepted.');
    }
    if (methods.includes('opto') && (
      !inRange(draft.optoAmplitude, 0, 1)
      || draft.optoMode === 'ac' && !inRange(draft.optoFrequency, 100, 20000)
    )) {
      problems.push('Check the optocoupler output level and AC frequency range.');
    }
    if (methods.includes('serial') && !(draft.serialOutputMappings ?? []).some(mapping =>
      mapping.enabled && mapping.portIndex >= 0)) {
      problems.push('Enable a serial mapping and assign it an exact serial port.');
    }
    if (methods.includes('serial') && (draft.serialOutputMappings ?? []).some(mapping =>
      mapping.enabled && mapping.portIndex < 0)) {
      problems.push('Every enabled serial mapping must have an exact serial port.');
    }
    if (methods.includes('winkeyer') && (draft.winkeyerPortIndex ?? -1) < 0) {
      problems.push('Choose an exact WinKeyer serial port.');
    }
    if (methods.includes('winkeyer') && !inRange(draft.winkeyerWpm, 5, 99)) {
      problems.push('Set the WinKeyer speed from 5 to 99 WPM.');
    }
    if (methods.includes('midi')) {
      const mappings = draft.midiOutputMappings ?? [];
      if (!mappings.some(mapping => mapping.enabled)) {
        problems.push('Enable and configure at least one MIDI output mapping.');
      } else if (mappings.some(mapping => mapping.enabled && !mapping.deviceId.trim())) {
        problems.push('Select an exact MIDI output device for every enabled mapping; an any-device mapping is not specific enough.');
      } else if (mappings.some(mapping => mapping.enabled && (
        !Number.isInteger(mapping.channel) || mapping.channel < 1 || mapping.channel > 16
        || !Number.isInteger(mapping.value) || mapping.value < 0 || mapping.value > 127
        || (mapping.mode === 'paddle' && (!Number.isInteger(mapping.dahValue)
          || mapping.dahValue < 0 || mapping.dahValue > 127 || mapping.dahValue === mapping.value))
      ))) {
        problems.push('Check enabled MIDI output mappings: use channels 1–16 and valid, distinct paddle notes from 0–127.');
      }
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
    if (participants.some(person => !person.name.trim() || person.name.length > 20)) {
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
    if (participants.some(person => person.inputType === 'mouse')
      && [draft.mouseLeftAction, draft.mouseMiddleAction, draft.mouseRightAction].every(action => action === 'none')) {
      problems.push('Assign at least one mouse button action.');
    }
    const mouseActions = [draft.mouseLeftAction, draft.mouseMiddleAction, draft.mouseRightAction]
      .filter(action => action && action !== 'none');
    if (participants.some(person => person.inputType === 'mouse')
      && new Set(mouseActions).size !== mouseActions.length) {
      problems.push('Assign each mouse action to only one button.');
    }
    if (participants.some(person => person.inputType === 'touch' && person.mode === 'paddle')
      && draft.touchLeftPaddle === draft.touchRightPaddle) {
      problems.push('Assign different dit and dah actions to the left and right touch areas.');
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
      if (person.name.length > 20) {
        problems.push('MIDI participant names must be 20 characters or fewer.');
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
      if (person.mode === 'paddle' && person.serialPin === person.serialDahPin) {
        problems.push('Serial paddle input needs separate signal pins for dit and dah.');
        break;
      }
      if (!Number.isInteger(person.serialPollInterval) || person.serialPollInterval < 5 || person.serialPollInterval > 50
        || !Number.isInteger(person.serialDebounceMs) || person.serialDebounceMs < 2 || person.serialDebounceMs > 10) {
        problems.push('Serial polling must be 5–50 ms and debounce must be 2–10 ms.');
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
