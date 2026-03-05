/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON � Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal, computed } from '@angular/core';
import { timingsFromWpm } from '../morse-table';

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
/** Output forwarding mode: which signal source (RX, TX, or both) drives an output */
export type OutputForward = 'rx' | 'tx' | 'both';
/** @deprecated Use OutputForward instead */
export type WinkeyerForward = OutputForward;
/** Action to perform when a prosign is decoded */
export type ProsignAction = 'newLine' | 'newParagraph' | 'clearLastWord' | 'clearLine' | 'clearScreen';

/** Configuration for a single prosign action mapping */
export interface ProsignActionEntry {
  enabled: boolean;
  action: ProsignAction;
}

/** Configuration for a single emoji replacement mapping */
export interface EmojiMapping {
  enabled: boolean;
  /** Match pattern — a character (e.g. '+'), prosign (e.g. '<AR>'), or sequence (e.g. 'TNX') */
  match: string;
  /** Emoji character to display */
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
  rtdbOutputUserName: string;

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
  /** @deprecated Use keyboardStraightKeySource / keyboardPaddleSource instead */
  keyboardKeyerSource: DecoderSource;
  /** Decoder source for keyboard straight key ('rx' or 'tx') */
  keyboardStraightKeySource: DecoderSource;
  /** Decoder source for keyboard paddle ('rx' or 'tx') */
  keyboardPaddleSource: DecoderSource;
  straightKeyCode: string;
  leftPaddleKeyCode: string;
  rightPaddleKeyCode: string;
  paddleMode: PaddleMode;
  keyerWpm: number;
  keyboardReversePaddles: boolean;

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
  /** @deprecated Use midiStraightKeySource / midiPaddleSource instead */
  midiInputSource: DecoderSource;
  /** Decoder source for MIDI straight key ('rx' or 'tx') */
  midiStraightKeySource: DecoderSource;
  /** Decoder source for MIDI paddle ('rx' or 'tx') */
  midiPaddleSource: DecoderSource;
  /** MIDI input device ID (empty = any/first available) */
  midiInputDeviceId: string;
  /** MIDI channel filter: 0 = omni (all channels), 1-16 = specific channel */
  midiInputChannel: number;
  /** MIDI note number for straight key (-1 = not assigned) */
  midiStraightKeyNote: number;
  /** MIDI note number for dit paddle (-1 = not assigned) */
  midiDitNote: number;
  /** MIDI note number for dah paddle (-1 = not assigned) */
  midiDahNote: number;
  /** Reverse paddles for MIDI paddle input */
  midiReversePaddles: boolean;
  // --- MIDI Output ---
  midiOutputEnabled: boolean;
  /** MIDI output device ID (empty = first available) */
  midiOutputDeviceId: string;
  /** MIDI channel for output (1-16) */
  midiOutputChannel: number;
  /** MIDI note number for straight key output (-1 = not assigned) */
  midiOutputStraightKeyNote: number;
  /** MIDI note number for dit paddle output (-1 = not assigned) */
  midiOutputDitNote: number;
  /** MIDI note number for dah paddle output (-1 = not assigned) */
  midiOutputDahNote: number;
  /** MIDI velocity for note-on messages (0-127, default 127) */
  midiOutputVelocity: number;
  /** Output forwarding mode: which signal source drives MIDI output */
  midiOutputForward: OutputForward;
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

  winkeyerEnabled: false,
  winkeyerPortIndex: -1,
  winkeyerWpm: 20,
  winkeyerForward: 'tx',

  rtdbOutputEnabled: false,
  rtdbOutputForward: 'tx',
  rtdbOutputChannelName: '',
  rtdbOutputChannelSecret: '',
  rtdbOutputUserName: '',

  sidetoneOutputDeviceId: 'default',
  sidetoneOutputChannel: 'left',
  sidetoneFrequency: 600,
  sidetoneAmplitude: 0.5,
  sidetoneEnabled: true,
  sidetoneForward: 'both',

  vibrateEnabled: true,
  vibrateForward: 'both',
  vibrateEnhanced: true,

  rxDecoderWpm: 12,
  txDecoderWpm: 12,

  encoderWpm: 12,
  encoderMode: 'enter',

  keyboardKeyerEnabled: true,
  keyboardKeyerSource: 'tx',
  keyboardStraightKeySource: 'tx',
  keyboardPaddleSource: 'tx',
  straightKeyCode: 'Space',
  leftPaddleKeyCode: 'BracketLeft',
  rightPaddleKeyCode: 'BracketRight',
  paddleMode: 'iambic-b',
  keyerWpm: 12,
  keyboardReversePaddles: false,

  mouseKeyerEnabled: false,
  mouseKeyerSource: 'tx',
  mouseLeftAction: 'straightKey',
  mouseMiddleAction: 'none',
  mouseRightAction: 'none',
  mouseReversePaddles: false,

  touchKeyerEnabled: true,
  touchKeyerSource: 'tx',
  touchKeyerMode: 'straight',
  touchLeftPaddle: 'dit',
  touchRightPaddle: 'dah',
  touchReversePaddles: false,

  midiInputEnabled: false,
  midiInputSource: 'rx',
  midiStraightKeySource: 'rx',
  midiPaddleSource: 'rx',
  midiInputDeviceId: '',
  midiInputChannel: 0,
  midiStraightKeyNote: 60,
  midiDitNote: 62,
  midiDahNote: 64,
  midiReversePaddles: false,

  midiOutputEnabled: false,
  midiOutputDeviceId: '',
  midiOutputChannel: 1,
  midiOutputStraightKeyNote: 66,
  midiOutputDitNote: 68,
  midiOutputDahNote: 70,
  midiOutputVelocity: 127,
  midiOutputForward: 'tx',
  midiOutputOverrideWpm: false,

  rtdbInputEnabled: false,
  rtdbInputSource: 'rx',
  rtdbInputChannelName: '',
  rtdbInputChannelSecret: '',
  rtdbInputOverrideWpm: false,

  wakeLockEnabled: false,

  showProsigns: true,

  prosignActionsEnabled: true,
  prosignActions: {
    '<AR>': { enabled: true, action: 'newParagraph' },
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
 *  - Migration from legacy flat storage format
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
    // Migration: load old flat format if present
    const old = localStorage.getItem('morseAppSettings');
    if (old) {
      try {
        const parsed = JSON.parse(old);
        delete parsed.inputDetectionMode;
        delete parsed.inputChannel;
        // Migrate: touchVibrateEnabled → vibrateEnabled
        if (parsed.touchVibrateEnabled !== undefined) {
          if (parsed.vibrateEnabled === undefined) {
            parsed.vibrateEnabled = parsed.touchVibrateEnabled;
          }
          delete parsed.touchVibrateEnabled;
        }
        // Migrate: keyboardKeyerSource → keyboardStraightKeySource + keyboardPaddleSource
        if (parsed.keyboardKeyerSource !== undefined && parsed.keyboardStraightKeySource === undefined) {
          parsed.keyboardStraightKeySource = parsed.keyboardKeyerSource;
          parsed.keyboardPaddleSource = parsed.keyboardKeyerSource;
        }
        // Migrate: midiInputSource → midiStraightKeySource + midiPaddleSource
        if (parsed.midiInputSource !== undefined && parsed.midiStraightKeySource === undefined) {
          parsed.midiStraightKeySource = parsed.midiInputSource;
          parsed.midiPaddleSource = parsed.midiInputSource;
        }
        // Migrate: remove <BK>/<SK> from prosignActions, update <HH> clearLine → clearLastWord
        if (parsed.prosignActions) {
          delete parsed.prosignActions['<BK>'];
          delete parsed.prosignActions['<SK>'];
          if (parsed.prosignActions['<HH>']?.action === 'clearLine') {
            parsed.prosignActions['<HH>'].action = 'clearLastWord';
          }
        }
        this.settings.set({ ...DEFAULT_SETTINGS, ...parsed });
        this.isDirty.set(true);
      } catch { /* ignore corrupt data */ }
    }

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
      // Strip any old fields that no longer exist
      delete (remapped as any).inputDetectionMode;
      delete (remapped as any).inputChannel;
      // Migrate: touchVibrateEnabled → vibrateEnabled
      if ((remapped as any).touchVibrateEnabled !== undefined) {
        if (remapped.vibrateEnabled === undefined) {
          (remapped as any).vibrateEnabled = (remapped as any).touchVibrateEnabled;
        }
        delete (remapped as any).touchVibrateEnabled;
      }
      // Migrate: keyboardKeyerSource → keyboardStraightKeySource + keyboardPaddleSource
      if (remapped.keyboardKeyerSource !== undefined && (remapped as any).keyboardStraightKeySource === undefined) {
        (remapped as any).keyboardStraightKeySource = remapped.keyboardKeyerSource;
        (remapped as any).keyboardPaddleSource = remapped.keyboardKeyerSource;
      }
      // Migrate: midiInputSource → midiStraightKeySource + midiPaddleSource
      if (remapped.midiInputSource !== undefined && (remapped as any).midiStraightKeySource === undefined) {
        (remapped as any).midiStraightKeySource = remapped.midiInputSource;
        (remapped as any).midiPaddleSource = remapped.midiInputSource;
      }
      // Migrate: remove <BK>/<SK> from prosignActions, update <HH> clearLine → clearLastWord
      if ((remapped as any).prosignActions) {
        delete (remapped as any).prosignActions['<BK>'];
        delete (remapped as any).prosignActions['<SK>'];
        if ((remapped as any).prosignActions['<HH>']?.action === 'clearLine') {
          (remapped as any).prosignActions['<HH>'].action = 'clearLastWord';
        }
      }
      this.settings.set({ ...DEFAULT_SETTINGS, ...remapped });
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

    // Clean up old flat format
    localStorage.removeItem('morseAppSettings');

    this.isDirty.set(false);
    this.needsValidation.set(false);
  }

  resetToDefaults(): void {
    this.settings.set({ ...DEFAULT_SETTINGS });
    this.modalDisplay.set({ ...DEFAULT_MODAL_DISPLAY });
    localStorage.setItem(MODAL_DISPLAY_KEY, JSON.stringify(DEFAULT_MODAL_DISPLAY));
    this.isDirty.set(true);
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
