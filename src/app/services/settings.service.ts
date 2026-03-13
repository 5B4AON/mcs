/**
 * Morse Code Studio
 */

import { Injectable, signal, computed } from '@angular/core';
import { timingsFromWpm } from '../morse-table';

/**
 * Detect whether the device has a touch-capable display.
 * Uses hardware capability (`maxTouchPoints`) plus the CSS `any-pointer: coarse`
 * media query so laptops with both trackpad and touchscreen are correctly
 * identified as touch devices.
 */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0
    || matchMedia('(any-pointer: coarse)').matches;
}

/** Iambic keyer paddle mode */
export type PaddleMode = 'iambic-b' | 'iambic-a' | 'ultimatic' | 'single-lever';
/** Encoder submission mode: 'enter' waits for Enter key, 'live' sends as you type */
export type EncoderMode = 'enter' | 'live';
/** Mouse button action mapping */
export type MouseButtonAction = 'straightKey' | 'dit' | 'dah' | 'none';
/** Touch keyer operating mode */
export type TouchKeyerMode = 'straight' | 'paddle';
/** Paddle element */
export type PaddleElement = 'dit' | 'dah';
/** Stereo channel selection */
export type AudioChannel = 'left' | 'right';
/** Decoder source assignment — determines which calibration pool an input feeds */
export type DecoderSource = 'rx' | 'tx';
/** Opto-coupler drive mode: 'dc' = constant voltage, 'ac' = oscillator tone */
export type OptoMode = 'ac' | 'dc';
/** Serial port control pin used for keying */
export type SerialPin = 'dtr' | 'rts';
/** Serial port input signal name */
export type SerialInputPin = 'dsr' | 'cts' | 'dcd' | 'ri';
/** Output forwarding mode: which signal source (RX, TX, or both) drives an output */
export type OutputForward = 'rx' | 'tx' | 'both';
/** Action to perform when a prosign is decoded */
export type ProsignAction = 'newLine' | 'newParagraph' | 'clearLastWord' | 'clearLine' | 'clearScreen';

/**
 * Unique identifier for each decoder input pipeline.
 *
 * Every input source that engages a decoder gets its own pipeline with
 * independent timing state and pattern buffer. Inputs that support both
 * straight-key and paddle modes are treated as two separate pipelines so
 * they can run autonomously without corrupting each other's decode state.
 */
export type InputPath =
  | 'mic'                   // Pilot tone detection (straight key via mic)
  | 'cwAudio'               // CW tone detection (straight key via audio channel)
  | 'keyboardStraightKey'   // Keyboard straight key
  | 'keyboardPaddle'        // Keyboard iambic/ultimatic paddle (external callers)
  | `keyboardPaddle:${number}` // Per-mapping keyboard paddle pipeline
  | 'mouseStraightKey'      // Mouse button as straight key
  | 'mousePaddle'           // Mouse button as paddle
  | 'touchStraightKey'      // Touch screen straight key
  | 'touchPaddle'           // Touch screen paddle
  | 'midiStraightKey'       // MIDI note as straight key (external callers)
  | `midiStraightKey:${number}` // Per-mapping MIDI straight key pipeline
  | 'midiPaddle'            // MIDI note as paddle (external callers)
  | `midiPaddle:${number}`  // Per-mapping MIDI paddle pipeline
  | 'serialStraightKey'     // Serial port input signal as straight key
  | 'serialPaddle';         // Serial port input signal as paddle

/** Configuration for a single prosign action mapping */
export interface ProsignActionEntry {
  enabled: boolean;
  action: ProsignAction;
}

/** Mode for a key input mapping entry (shared by keyboard and MIDI) */
export type KeyInputMode = 'straightKey' | 'paddle';

/** @deprecated Use KeyInputMode instead */
export type MidiInputMode = KeyInputMode;

/** Configuration for a single keyboard key input mapping */
export interface KeyboardInputMapping {
  enabled: boolean;
  /** Mode: straight key or paddle */
  mode: KeyInputMode;
  /** KeyboardEvent.code for straight key, or dit paddle */
  keyCode: string;
  /** KeyboardEvent.code for dah paddle (only used when mode is 'paddle', '' if unused) */
  dahKeyCode: string;
  /** Decoder source: which calibration pool this input feeds ('rx' or 'tx') */
  source: DecoderSource;
  /** Reverse paddles (only used when mode is 'paddle') */
  reversePaddles: boolean;
  /** Paddle mode for this mapping (only used when mode is 'paddle') */
  paddleMode: PaddleMode;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  name: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  color: string;
}

/** Mode for a MIDI output mapping entry */
export type MidiOutputMode = 'straightKey' | 'paddle';

/** Configuration for a single MIDI input mapping */
export interface MidiInputMapping {
  enabled: boolean;
  /** MIDI input device ID (empty = any/first available) */
  deviceId: string;
  /** MIDI channel filter: 0 = omni (all channels), 1-16 = specific channel */
  channel: number;
  /** Decoder source: which calibration pool this input feeds ('rx' or 'tx') */
  source: DecoderSource;
  /** Mode: straight key or paddle */
  mode: KeyInputMode;
  /** MIDI note number for straight key, or dit paddle (-1 = not assigned) */
  value: number;
  /** MIDI note number for dah paddle (only used when mode is 'paddle', -1 = not assigned) */
  dahValue: number;
  /** Reverse paddles (only used when mode is 'paddle') */
  reversePaddles: boolean;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  name: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  color: string;
}

/** Configuration for a single MIDI output mapping */
export interface MidiOutputMapping {
  enabled: boolean;
  /** MIDI output device ID (empty = any/first available) */
  deviceId: string;
  /** MIDI channel (1-16) */
  channel: number;
  /** Output forwarding mode: which signal source drives this mapping */
  forward: OutputForward;
  /** Mode: straight key or paddle */
  mode: MidiOutputMode;
  /** MIDI note number for straight key, or dit paddle */
  value: number;
  /** MIDI note number for dah paddle (only used when mode is 'paddle', -1 = not assigned) */
  dahValue: number;
}

/** Configuration for a single emoji replacement mapping */
export interface EmojiMapping {
  enabled: boolean;
  /** Match pattern — a character (e.g. '+'), prosign (e.g. '<AR>'), or sequence (e.g. 'TNX') */
  match: string;
  /** Replacement text — one or more emojis, characters, or any mix */
  emoji: string;
  /** Optional short description of the mapping's meaning */
  meaning?: string;
}

/**
 * Complete application settings interface.
 *
 * Settings are organised into functional groups matching the UI panel layout.
 * All settings are persisted per-device-configuration (see StoredProfile).
 */
export interface AppSettings {
  // --- 1. Straight Key via Mic (pilot tone detection) ---
  micInputEnabled: boolean;
  /** Decoder source: which calibration pool mic input feeds ('rx' or 'tx') */
  micInputSource: DecoderSource;
  inputDeviceId: string;
  inputThreshold: number;
  inputInvert: boolean;
  inputDebounceMs: number;

  // --- Pilot Tone ---
  pilotFrequency: number;
  pilotAmplitude: number;
  pilotOutputDeviceId: string;
  pilotOutputChannel: AudioChannel;

  // --- 1b. Straight Key via Audio Channel (CW tone detection) ---
  cwInputEnabled: boolean;
  /** Decoder source: which calibration pool CW input feeds ('rx' or 'tx') */
  cwInputSource: DecoderSource;
  cwInputDeviceId: string;
  cwInputChannel: AudioChannel;
  cwInputFrequency: number;
  cwInputBandwidth: number;
  cwInputDebounceMs: number;
  cwInputAutoThreshold: boolean;
  cwInputThreshold: number;

  // --- 2. Key Output via Audio Channel (opto-coupler) ---
  optoOutputDeviceId: string;
  optoOutputChannel: AudioChannel;
  optoMode: OptoMode;
  optoFrequency: number;
  optoAmplitude: number;
  optoEnabled: boolean;
  optoForward: OutputForward;

  // --- 2b. Key Output via Serial Port (DTR/RTS) ---
  serialPortIndex: number;
  serialPin: SerialPin;
  serialInvert: boolean;
  serialEnabled: boolean;
  serialForward: OutputForward;

  // --- Serial Input (read DSR/CTS/DCD/RI signals as keying source) ---
  serialInputEnabled: boolean;
  serialInputPortIndex: number;
  serialInputPollInterval: number;
  serialInputDebounceMs: number;
  /** Decoder source for serial straight key ('rx' or 'tx') */
  serialStraightKeySource: DecoderSource;
  /** Which input signal pin to use for straight key (-1 = not assigned) */
  serialStraightKeyPin: SerialInputPin;
  /** Invert the straight key signal (active-low instead of active-high) */
  serialStraightKeyInvert: boolean;
  /** Decoder source for serial paddle ('rx' or 'tx') */
  serialPaddleSource: DecoderSource;
  /** Which input signal pin to use for dit paddle (-1 = not assigned) */
  serialPaddleDitPin: SerialInputPin;
  /** Which input signal pin to use for dah paddle (-1 = not assigned) */
  serialPaddleDahPin: SerialInputPin;
  /** Invert the paddle signals (active-low instead of active-high) */
  serialPaddleInvert: boolean;
  /** Reverse paddles for serial paddle input */
  serialReversePaddles: boolean;

  // --- 2c. WinKeyer Output (K1EL WinKeyer via serial port) ---
  winkeyerEnabled: boolean;
  winkeyerPortIndex: number;
  winkeyerWpm: number;
  winkeyerForward: OutputForward;

  // --- 2d. Firebase RTDB Output ---
  rtdbOutputEnabled: boolean;
  rtdbOutputForward: OutputForward;
  rtdbOutputChannelName: string;
  rtdbOutputChannelSecret: string;
  rtdbOutputName: string;

  // --- 3. Audio Output (sidetone / headphone / speaker) ---
  sidetoneOutputDeviceId: string;
  sidetoneOutputChannel: AudioChannel;
  sidetoneFrequency: number;
  sidetoneAmplitude: number;
  sidetoneEnabled: boolean;
  sidetoneForward: OutputForward;

  // --- 4. Vibration Output (Android only) ---
  /** Enable haptic vibration feedback while keying (Android only) */
  vibrateEnabled: boolean;
  vibrateForward: OutputForward;
  /** Enhanced haptic: pre-pulse on keydown + delayed cancel on keyup to compensate for motor lag */
  vibrateEnhanced: boolean;

  // --- Decoder ---
  rxDecoderWpm: number;
  txDecoderWpm: number;

  // --- Encoder ---
  encoderWpm: number;
  encoderMode: EncoderMode;

  // --- Keyer ---
  /** Enable/disable keyboard keyer input */
  keyboardKeyerEnabled: boolean;
  /** Ordered list of keyboard key input mappings (straight key / paddle entries) */
  keyboardInputMappings: KeyboardInputMapping[];
  /** Paddle mode for MIDI input (keyboard mappings each have their own paddleMode) */
  paddleMode: PaddleMode;
  /** Keyer WPM for all paddle inputs (keyboard + MIDI) */
  keyerWpm: number;

  // --- Mouse Keyer ---
  mouseKeyerEnabled: boolean;
  /** Decoder source: which calibration pool mouse keyer feeds ('rx' or 'tx') */
  mouseKeyerSource: DecoderSource;
  mouseLeftAction: MouseButtonAction;
  mouseMiddleAction: MouseButtonAction;
  mouseRightAction: MouseButtonAction;
  mouseReversePaddles: boolean;

  // --- Touch Keyer ---
  touchKeyerEnabled: boolean;
  /** Decoder source: which calibration pool touch keyer feeds ('rx' or 'tx') */
  touchKeyerSource: DecoderSource;
  touchKeyerMode: TouchKeyerMode;
  touchLeftPaddle: PaddleElement;
  touchRightPaddle: PaddleElement;
  touchReversePaddles: boolean;

  // --- MIDI Input ---
  midiInputEnabled: boolean;
  /** Ordered list of MIDI input mappings (straight key / paddle entries) */
  midiInputMappings: MidiInputMapping[];
  // --- MIDI Output ---
  midiOutputEnabled: boolean;
  /** Ordered list of MIDI output mappings (straight key / paddle entries) */
  midiOutputMappings: MidiOutputMapping[];
  /** When true, ignore remote WPM and use local encoder WPM for MIDI output */
  midiOutputOverrideWpm: boolean;

  // --- Firebase RTDB Input ---
  rtdbInputEnabled: boolean;
  /** Decoder source: which pool RTDB input characters are tagged with ('rx' or 'tx') */
  rtdbInputSource: DecoderSource;
  rtdbInputChannelName: string;
  rtdbInputChannelSecret: string;
  /** When true, ignore remote WPM and use local encoder WPM for playback */
  rtdbInputOverrideWpm: boolean;

  // --- Sprite Key Button ---
  /** Show the straight-key sprite button on the main screen */
  spriteButtonEnabled: boolean;
  /** Animate the sprite when keyboard straight key is pressed */
  spriteAnimateKeyboard: boolean;
  /** Animate the sprite when mouse straight key is pressed */
  spriteAnimateMouse: boolean;
  /** Animate the sprite when MIDI straight key is pressed */
  spriteAnimateMidi: boolean;
  /** Animate the sprite when straight key via mic is pressed */
  spriteAnimateMic: boolean;
  /** Animate the sprite when serial straight key is pressed */
  spriteAnimateSerial: boolean;

  // --- Screen Wake Lock ---
  /** Keep the screen active to prevent idle sleep (mobile devices) */
  wakeLockEnabled: boolean;

  // --- Display Options ---
  /** Show prosigns (e.g., <AR>) instead of punctuation (e.g., +) in conversation logs */
  showProsigns: boolean;

  // --- Prosign Actions ---
  /** Master toggle for prosign action handling */
  prosignActionsEnabled: boolean;
  /** Per-prosign action mappings */
  prosignActions: Record<string, ProsignActionEntry>;

  // --- Emoji Replacements ---
  /** Master toggle for emoji display in fullscreen modals */
  emojisEnabled: boolean;
  /** Ordered list of emoji replacement mappings */
  emojiMappings: EmojiMapping[];
}

/**
 * Stored profile: settings + device label map.
 *
 * Device IDs change across browser sessions, so we also store the
 * human-readable label of each selected device. On reload, labels
 * are matched against current devices to remap IDs correctly.
 */
interface StoredProfile {
  settings: AppSettings;
  deviceLabels: Record<string, string>;
}

/** Settings keys that contain device IDs (need label-based remapping) */
const DEVICE_SETTINGS_KEYS: (keyof AppSettings)[] = [
  'inputDeviceId',
  'pilotOutputDeviceId',
  'cwInputDeviceId',
  'optoOutputDeviceId',
  'sidetoneOutputDeviceId',
];

const DEFAULT_SETTINGS: AppSettings = {
  micInputEnabled: false,
  micInputSource: 'rx',
  inputDeviceId: 'default',
  inputThreshold: 0.01,
  inputInvert: false,
  inputDebounceMs: 15,

  pilotFrequency: 18000,
  pilotAmplitude: 0.85,
  pilotOutputDeviceId: 'default',
  pilotOutputChannel: 'left',

  cwInputEnabled: false,
  cwInputSource: 'rx',
  cwInputDeviceId: 'default',
  cwInputChannel: 'left',
  cwInputFrequency: 600,
  cwInputBandwidth: 100,
  cwInputDebounceMs: 10,
  cwInputAutoThreshold: true,
  cwInputThreshold: 0.01,

  optoOutputDeviceId: 'default',
  optoOutputChannel: 'right',
  optoMode: 'dc',
  optoFrequency: 5000,
  optoAmplitude: 1.0,
  optoEnabled: false,
  optoForward: 'tx',

  serialPortIndex: -1,
  serialPin: 'dtr',
  serialInvert: false,
  serialEnabled: false,
  serialForward: 'tx',

  serialInputEnabled: false,
  serialInputPortIndex: -1,
  serialInputPollInterval: 10,
  serialInputDebounceMs: 5,
  serialStraightKeySource: 'rx',
  serialStraightKeyPin: 'dsr',
  serialStraightKeyInvert: false,
  serialPaddleSource: 'rx',
  serialPaddleDitPin: 'cts',
  serialPaddleDahPin: 'dcd',
  serialPaddleInvert: false,
  serialReversePaddles: false,

  winkeyerEnabled: false,
  winkeyerPortIndex: -1,
  winkeyerWpm: 20,
  winkeyerForward: 'tx',

  rtdbOutputEnabled: false,
  rtdbOutputForward: 'tx',
  rtdbOutputChannelName: '',
  rtdbOutputChannelSecret: '',
  rtdbOutputName: '',

  sidetoneOutputDeviceId: 'default',
  sidetoneOutputChannel: 'left',
  sidetoneFrequency: 600,
  sidetoneAmplitude: 0.5,
  sidetoneEnabled: true,
  sidetoneForward: 'both',

  vibrateEnabled: false,
  vibrateForward: 'both',
  vibrateEnhanced: true,

  rxDecoderWpm: 12,
  txDecoderWpm: 12,

  encoderWpm: 12,
  encoderMode: 'enter',

  keyboardKeyerEnabled: true,
  keyboardInputMappings: [
    {
      enabled: true,
      mode: 'straightKey',
      keyCode: 'Space',
      dahKeyCode: '',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    },
    {
      enabled: true,
      mode: 'paddle',
      keyCode: 'BracketLeft',
      dahKeyCode: 'BracketRight',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    },
    {
      enabled: true,
      mode: 'paddle',
      keyCode: 'ControlLeft',
      dahKeyCode: 'ControlRight',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    },
  ],
  paddleMode: 'iambic-b',
  keyerWpm: 12,

  mouseKeyerEnabled: false,
  mouseKeyerSource: 'tx',
  mouseLeftAction: 'straightKey',
  mouseMiddleAction: 'none',
  mouseRightAction: 'none',
  mouseReversePaddles: false,

  touchKeyerEnabled: isTouchDevice(),
  touchKeyerSource: 'tx',
  touchKeyerMode: 'straight',
  touchLeftPaddle: 'dit',
  touchRightPaddle: 'dah',
  touchReversePaddles: false,

  midiInputEnabled: false,
  midiInputMappings: [
    {
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'rx',
      mode: 'straightKey',
      value: 60,
      dahValue: -1,
      reversePaddles: false,
      name: '',
      color: '',
    },
    {
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'rx',
      mode: 'paddle',
      value: 62,
      dahValue: 64,
      reversePaddles: false,
      name: '',
      color: '',
    },
  ],

  midiOutputEnabled: false,
  midiOutputMappings: [
    {
      enabled: true,
      deviceId: '',
      channel: 1,
      forward: 'tx',
      mode: 'straightKey',
      value: 80,
      dahValue: -1,
    },
    {
      enabled: true,
      deviceId: '',
      channel: 1,
      forward: 'tx',
      mode: 'paddle',
      value: 82,
      dahValue: 84,
    },
  ],
  midiOutputOverrideWpm: false,

  rtdbInputEnabled: false,
  rtdbInputSource: 'rx',
  rtdbInputChannelName: '',
  rtdbInputChannelSecret: '',
  rtdbInputOverrideWpm: false,

  spriteButtonEnabled: true,
  spriteAnimateKeyboard: false,
  spriteAnimateMouse: false,
  spriteAnimateMidi: false,
  spriteAnimateMic: false,
  spriteAnimateSerial: false,

  wakeLockEnabled: false,

  showProsigns: true,

  prosignActionsEnabled: true,
  prosignActions: {
    '<AR>': { enabled: true, action: 'newParagraph' },
    '<BK>': { enabled: true, action: 'newLine' },
    '<BT>': { enabled: true, action: 'newLine' },
    '<HH>': { enabled: true, action: 'clearLastWord' },
  },

  emojisEnabled: false,
  emojiMappings: [
    // Prosigns
    { enabled: true, match: '<AR>', emoji: '✅', meaning: 'End of message' },
    { enabled: true, match: '<SK>', emoji: '🔚', meaning: 'End of contact' },
    { enabled: true, match: '<SOS>', emoji: '🆘', meaning: 'Distress' },
    // Greetings & farewells
    { enabled: true, match: 'GM', emoji: '🌅', meaning: 'Good morning' },
    { enabled: true, match: 'GA', emoji: '☀️', meaning: 'Good afternoon' },
    { enabled: true, match: 'GE', emoji: '🌆', meaning: 'Good evening' },
    { enabled: true, match: 'GN', emoji: '🌙', meaning: 'Good night' },
    // Common abbreviations
    { enabled: true, match: 'CQ', emoji: '📡', meaning: 'Calling any station' },
    { enabled: true, match: 'R', emoji: '👍', meaning: 'Roger / received' },
    { enabled: true, match: 'K', emoji: '🎤', meaning: 'Go ahead' },
    { enabled: true, match: '<KN>', emoji: '🎤🔒', meaning: 'Go ahead (named only)' },
    { enabled: true, match: '<BK>', emoji: '🔙', meaning: 'Break / back to you' },
    { enabled: true, match: '73', emoji: '👋', meaning: 'Best regards' },
    { enabled: true, match: '88', emoji: '💋', meaning: 'Love and kisses' },
    { enabled: true, match: 'TNX', emoji: '🙏', meaning: 'Thanks' },
    { enabled: true, match: 'TKS', emoji: '🙏', meaning: 'Thanks' },
    { enabled: true, match: 'TU', emoji: '🤝', meaning: 'Thank you' },
    { enabled: true, match: 'FB', emoji: '✨', meaning: 'Fine business' },
    { enabled: true, match: 'GL', emoji: '🍀', meaning: 'Good luck' },
    { enabled: true, match: 'HI', emoji: '😄', meaning: 'Laughter' },
    { enabled: true, match: 'WX', emoji: '⛅', meaning: 'Weather' },
    // Q-codes
    { enabled: true, match: 'QSL', emoji: '✔️', meaning: 'Confirmed' },
    { enabled: true, match: 'QTH', emoji: '📍', meaning: 'Location' },
    { enabled: true, match: 'QRT', emoji: '🔇', meaning: 'Going silent' },
    { enabled: true, match: 'QRX', emoji: '⏳', meaning: 'Standby' },
    { enabled: true, match: 'QRS', emoji: '🐢', meaning: 'Send slower' },
    { enabled: true, match: 'QRQ', emoji: '🐇', meaning: 'Send faster' },
  ],
};

const PROFILES_KEY = 'morseProfiles';
const MODAL_DISPLAY_KEY = 'morseModalDisplay';

/**
 * Display settings for the fullscreen conversation modal.
 * Stored separately from AppSettings since they are not device-dependent.
 */
export interface ModalDisplaySettings {
  fontSize: number;               // px
  fontBold: boolean;
  lineSpacing: number;            // em — row spacing (line-height + margin between lines)
  rxForeground: string;           // hex colour
  rxBackground: string;
  txForeground: string;
  txBackground: string;
  bufferForeground: string;       // unsent/buffered text colour
  sendingForeground: string;      // currently transmitting char colour
}

const DEFAULT_MODAL_DISPLAY: ModalDisplaySettings = {
  fontSize: 24,
  fontBold: false,
  lineSpacing: 0.1,
  rxForeground: '#00ff88',
  rxBackground: '#0e1218',
  txForeground: '#ffcc00',
  txBackground: '#0d0d18',
  bufferForeground: '#666666',
  sendingForeground: '#ffff00',
};

/**
 * Settings Service � centralized configuration store.
 *
 * Responsibilities:
 *  - Holds all application settings as reactive Angular signals
 *  - Per-device profile management: saves/loads settings keyed by device
 *    fingerprint (so different USB sound card combos get different configs)
 *  - Device ID remapping: stores device labels and re-resolves IDs on reload
 *  - Channel conflict detection: warns when outputs overlap on same channel
 *  - Fullscreen modal display settings with separate auto-persistence
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<AppSettings>({ ...DEFAULT_SETTINGS });

  /** Modal (fullscreen) display settings � auto-saved separately */
  readonly modalDisplay = signal<ModalDisplaySettings>({ ...DEFAULT_MODAL_DISPLAY });

  /** True when in-memory settings differ from last save */
  readonly isDirty = signal(false);

  /** True when no saved profile exists for the current device configuration */
  readonly needsValidation = signal(false);

  /** Current device fingerprint (set after enumeration) */
  readonly currentFingerprint = signal('');

  /** Pre-computed morse timing durations for each WPM setting */
  readonly rxDecoderTimings = computed(() => timingsFromWpm(this.settings().rxDecoderWpm));
  readonly txDecoderTimings = computed(() => timingsFromWpm(this.settings().txDecoderWpm));
  readonly encoderTimings = computed(() => timingsFromWpm(this.settings().encoderWpm));
  readonly keyerTimings = computed(() => timingsFromWpm(this.settings().keyerWpm));

  /**
   * Detect stereo channel conflicts on shared audio devices.
   *
   * A stereo sound card has only two channels (L+R). If sidetone, opto,
   * and pilot all target the same device, at most two can coexist.
   * This computed signal returns warning messages for any detected conflicts.
   *
   * Pilot tone conflicts are only checked when mic input is enabled.
   */
  readonly channelConflict = computed<string[] | null>(() => {
    const s = this.settings();
    const warnings: string[] = [];
    const norm = (id: string) => id || 'default';
    const sidetoneActive = s.sidetoneEnabled;
    const optoActive = s.optoEnabled;
    const pilotActive = s.micInputEnabled;
    const sideId = norm(s.sidetoneOutputDeviceId);
    const optoId = norm(s.optoOutputDeviceId);
    const pilotId = norm(s.pilotOutputDeviceId);

    // Triple conflict: all 3 outputs on one stereo device (only if pilot is active)
    if (pilotActive && sidetoneActive && optoActive &&
        sideId === optoId && optoId === pilotId) {
      warnings.push(
        'Stereo sound card has only 2 channels \u2014 cannot carry Sidetone + Key Out + Pilot simultaneously. Disable one or add a second sound card.'
      );
      return warnings;
    }

    if (sidetoneActive && optoActive && sideId === optoId &&
        s.sidetoneOutputChannel === s.optoOutputChannel) {
      warnings.push(`Sidetone and Key Output both use ${s.sidetoneOutputChannel} channel on the same device.`);
    }
    if (pilotActive && optoActive && pilotId === optoId &&
        s.pilotOutputChannel === s.optoOutputChannel) {
      warnings.push(`Pilot and Key Output both use ${s.pilotOutputChannel} channel on the same device.`);
    }
    if (pilotActive && sidetoneActive && pilotId === sideId &&
        s.pilotOutputChannel === s.sidetoneOutputChannel) {
      warnings.push(`Pilot and Sidetone both use ${s.pilotOutputChannel} channel on the same device.`);
    }
    return warnings.length ? warnings : null;
  });

  /** True when all outputs target the same device */
  readonly singleCardGuide = computed(() => {
    const s = this.settings();
    const norm = (id: string) => id || 'default';
    return norm(s.sidetoneOutputDeviceId) === norm(s.optoOutputDeviceId) &&
           norm(s.optoOutputDeviceId) === norm(s.pilotOutputDeviceId);
  });

  constructor() {
    // Load modal display settings
    try {
      const raw = localStorage.getItem(MODAL_DISPLAY_KEY);
      if (raw) {
        this.modalDisplay.set({ ...DEFAULT_MODAL_DISPLAY, ...JSON.parse(raw) });
      }
    } catch { /* ignore */ }
  }

  /** Update modal display settings and auto-persist */
  updateModalDisplay(patch: Partial<ModalDisplaySettings>): void {
    const next = { ...this.modalDisplay(), ...patch };
    this.modalDisplay.set(next);
    localStorage.setItem(MODAL_DISPLAY_KEY, JSON.stringify(next));
  }

  /** Update in-memory settings (does NOT persist  use save() for that) */
  update(patch: Partial<AppSettings>): void {
    this.settings.set({ ...this.settings(), ...patch });
    this.isDirty.set(true);
  }

  /**
   * Try to load a saved settings profile for the given device fingerprint.
   * Remaps stored device IDs to current session IDs using labels.
   * @returns true if a profile was found and loaded
   */
  loadForFingerprint(
    fingerprint: string,
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): boolean {
    this.currentFingerprint.set(fingerprint);
    const profiles = this._getProfiles();
    const profile = profiles[fingerprint];

    if (profile) {
      const remapped = { ...profile.settings };
      for (const key of DEVICE_SETTINGS_KEYS) {
        const savedLabel = profile.deviceLabels[key];
        if (savedLabel && savedLabel !== 'System Default') {
          const isInput = key === 'inputDeviceId' || key === 'cwInputDeviceId';
          const devices = isInput ? currentInputs : currentOutputs;
          const match = devices.find(d => d.label === savedLabel);
          (remapped as any)[key] = match ? match.deviceId : 'default';
        }
      }
      this.settings.set({ ...DEFAULT_SETTINGS, ...remapped });
      // Ensure nested collections have all expected keys (e.g. new prosign
      // keys added after the profile was saved).
      this.backfillProsignActions();
      this.backfillMidiOutputMappings();
      this.backfillKeyboardInputMappings();
      this.isDirty.set(false);
      this.needsValidation.set(false);
      return true;
    }

    // No profile found � reset device IDs to 'default' so selects show correctly
    const s = this.settings();
    const resetPatch: Partial<AppSettings> = {};
    for (const key of DEVICE_SETTINGS_KEYS) {
      if ((s as any)[key] && (s as any)[key] !== 'default') {
        (resetPatch as any)[key] = 'default';
      }
    }
    if (Object.keys(resetPatch).length) {
      this.settings.set({ ...s, ...resetPatch });
    }
    this.needsValidation.set(true);
    this.isDirty.set(true);
    return false;
  }

  /**
   * Persist current settings for the current device fingerprint.
   * Stores device labels alongside IDs so they can be remapped on reload.
   */
  save(
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): void {
    const fp = this.currentFingerprint();
    if (!fp) return;

    const s = this.settings();
    const deviceLabels: Record<string, string> = {};
    for (const key of DEVICE_SETTINGS_KEYS) {
      const did = (s as any)[key] as string;
      if (!did || did === 'default') {
        deviceLabels[key] = 'System Default';
      } else {
        const isInput = key === 'inputDeviceId' || key === 'cwInputDeviceId';
        const devices = isInput ? currentInputs : currentOutputs;
        deviceLabels[key] = devices.find(d => d.deviceId === did)?.label ?? 'Unknown';
      }
    }

    const profiles = this._getProfiles();
    profiles[fp] = { settings: { ...s }, deviceLabels };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

    this.isDirty.set(false);
    this.needsValidation.set(false);
  }

  resetToDefaults(): void {
    this.settings.set({ ...DEFAULT_SETTINGS });
    this.modalDisplay.set({ ...DEFAULT_MODAL_DISPLAY });
    localStorage.setItem(MODAL_DISPLAY_KEY, JSON.stringify(DEFAULT_MODAL_DISPLAY));
    this.isDirty.set(true);
  }

  /**
   * Ensure every MIDI output mapping has a 'forward' field.
   * Profiles saved before forward was moved from global to per-mapping
   * will have mappings without it; default to 'tx'.
   */
  private backfillMidiOutputMappings(): void {
    const s = this.settings();
    let patched = false;
    const mappings = s.midiOutputMappings.map(m => {
      if (!m.forward) {
        patched = true;
        return { ...m, forward: ((s as any).midiOutputForward || 'tx') as OutputForward };
      }
      return m;
    });
    if (patched) {
      this.settings.set({ ...s, midiOutputMappings: mappings });
    }
  }

  /**
   * Ensure keyboardInputMappings exists. Profiles saved before the
   * multi-mapping feature was added will have the old single-key fields
   * instead; replace them with the new default mappings array.
   */
  private backfillKeyboardInputMappings(): void {
    const s = this.settings();
    if (!Array.isArray(s.keyboardInputMappings) || s.keyboardInputMappings.length === 0) {
      this.settings.set({ ...s, keyboardInputMappings: [...DEFAULT_SETTINGS.keyboardInputMappings] });
    }
  }

  /**
   * Ensure prosignActions contains entries for every key present in
   * DEFAULT_SETTINGS.  Profiles saved before a new prosign was added
   * will be missing that key; back-fill it from the defaults.
   */
  private backfillProsignActions(): void {
    const current = this.settings().prosignActions;
    const defaults = DEFAULT_SETTINGS.prosignActions;
    let patched = false;
    const merged = { ...current };
    for (const key of Object.keys(defaults)) {
      if (!merged[key]) {
        merged[key] = { ...defaults[key] };
        patched = true;
      }
    }
    if (patched) {
      this.settings.set({ ...this.settings(), prosignActions: merged });
    }
  }

  getDefaults(): AppSettings {
    return { ...DEFAULT_SETTINGS };
  }

  private _getProfiles(): Record<string, StoredProfile> {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
}
