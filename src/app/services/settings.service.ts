/**
 * Morse Code Studio
 */

import { Injectable, signal, computed } from '@angular/core';
import { timingsFromWpm } from '../morse-table';
import { DEFAULT_FULLSCREEN_FONT, FULLSCREEN_FONTS, FullscreenFontId } from '../fullscreen-fonts';
import { findChannelConflicts } from './audio-channel-conflicts';
import {
  mergeFieldRules, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from './settings-common';
import { AUDIO_OUTPUT_DEFAULTS, AUDIO_OUTPUT_FIELD_RULES, AudioOutputSettings } from '../components/settings-items/audio-output/audio-output-item.model';
import { CW_DETECTOR_DEFAULTS, CW_DETECTOR_FIELD_RULES, CwDetectorSettings } from '../components/settings-items/cw-detector/cw-detector-item.model';
import { EMOJIS_DEFAULTS, EMOJIS_FIELD_RULES, EmojisSettings } from '../components/settings-items/emojis/emojis-item.model';
import { ENCODER_DEFAULTS, ENCODER_FIELD_RULES, EncoderSettings } from '../components/settings-items/encoder/encoder-item.model';
import { FARNSWORTH_DEFAULTS, FARNSWORTH_FIELD_RULES, FarnsworthSettings } from '../components/settings-items/farnsworth/farnsworth-item.model';
import { KEYBOARD_KEYER_DEFAULTS, KEYBOARD_KEYER_FIELD_RULES, KeyboardKeyerSettings } from '../components/settings-items/keyboard-keyer/keyboard-keyer-item.model';
import { MIC_DEFAULTS, MIC_FIELD_RULES, MicSettings } from '../components/settings-items/mic/mic-item.model';
import { MIDI_INPUT_DEFAULTS, MIDI_INPUT_FIELD_RULES, MidiInputSettings } from '../components/settings-items/midi-input/midi-input-item.model';
import { MIDI_OUTPUT_DEFAULTS, MIDI_OUTPUT_FIELD_RULES, MidiOutputSettings } from '../components/settings-items/midi-output/midi-output-item.model';
import { MOUSE_KEYER_DEFAULTS, MOUSE_KEYER_FIELD_RULES, MouseKeyerSettings } from '../components/settings-items/mouse-keyer/mouse-keyer-item.model';
import { PRACTICE_DEFAULTS, PRACTICE_FIELD_RULES, PracticeSettings } from '../components/settings-items/practice/practice-item.model';
import { PROSIGN_ACTIONS_DEFAULTS, PROSIGN_ACTIONS_FIELD_RULES, ProsignActionsSettings } from '../components/settings-items/prosign-actions/prosign-actions-item.model';
import { RTDB_INPUT_DEFAULTS, RTDB_INPUT_FIELD_RULES, RtdbInputSettings } from '../components/settings-items/rtdb-input/rtdb-input-item.model';
import { RTDB_OUTPUT_DEFAULTS, RTDB_OUTPUT_FIELD_RULES, RtdbOutputSettings } from '../components/settings-items/rtdb-output/rtdb-output-item.model';
import { SERIAL_INPUT_DEFAULTS, SERIAL_INPUT_FIELD_RULES, SerialInputSettings } from '../components/settings-items/serial-input/serial-input-item.model';
import { SERIAL_OUTPUT_DEFAULTS, SERIAL_OUTPUT_FIELD_RULES, SerialOutputSettings } from '../components/settings-items/serial-output/serial-output-item.model';
import { SHOW_PROSIGNS_DEFAULTS, ShowProsignsSettings } from '../components/settings-items/show-prosigns/show-prosigns-item.model';
import { SIDETONE_DEFAULTS, SIDETONE_FIELD_RULES, SidetoneSettings } from '../components/settings-items/sidetone/sidetone-item.model';
import { SPRITE_KEY_DEFAULTS, SPRITE_KEY_FIELD_RULES, SpriteKeySettings } from '../components/settings-items/sprite-key/sprite-key-item.model';
import { TEXT_BLUR_DEFAULTS, TEXT_BLUR_FIELD_RULES, TextBlurSettings } from '../components/settings-items/text-blur/text-blur-item.model';
import { TOUCH_KEYER_DEFAULTS, TOUCH_KEYER_FIELD_RULES, TouchKeyerSettings } from '../components/settings-items/touch-keyer/touch-keyer-item.model';
import { VIBRATION_DEFAULTS, VIBRATION_FIELD_RULES, VibrationSettings } from '../components/settings-items/vibration/vibration-item.model';
import { WINKEYER_DEFAULTS, WINKEYER_FIELD_RULES, WinkeyerSettings } from '../components/settings-items/winkeyer/winkeyer-item.model';

export type SettingsSaveResult = 'saved' | 'no-profile' | 'storage-error';

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
  | 'serialStraightKey'     // Serial port input signal as straight key (external callers)
  | `serialStraightKey:${number}` // Per-mapping serial straight key pipeline
  | 'serialPaddle'          // Serial port input signal as paddle (external callers)
  | `serialPaddle:${number}`; // Per-mapping serial paddle pipeline

/**
 * Settings that no single item owns: the speeds shared by the decoders,
 * encoder and keyers, the global paddle mode, the fullscreen display and the
 * screen wake lock.
 */
export interface CommonSettings {
  // --- Speeds (decoders, encoder, keyers) ---
  rxDecoderWpm: number;
  txDecoderWpm: number;
  encoderWpm: number;
  /** Keyer WPM for all paddle inputs (keyboard + MIDI) */
  keyerWpm: number;
  /** Paddle mode for MIDI input (keyboard mappings each have their own paddleMode) */
  paddleMode: PaddleMode;

  // --- Fullscreen view ---
  /** Last chosen fullscreen input: mapped keying or typing */
  fullscreenInputMode: 'key' | 'type';
  /** Lens mode: show only the latest character and its symbols in fullscreen */
  fullscreenLensEnabled: boolean;
  /** Font used in the fullscreen view */
  fullscreenFont: FullscreenFontId;
  /** Fullscreen text size in px */
  fullscreenFontSize: number;
  fullscreenFontBold: boolean;
  /** Row spacing in em (line-height plus margin between lines) */
  fullscreenLineSpacing: number;
  /** Fullscreen colours (hex) */
  fullscreenRxForeground: string;
  fullscreenRxBackground: string;
  fullscreenTxForeground: string;
  fullscreenTxBackground: string;
  /** Colour of unsent (buffered) text */
  fullscreenBufferForeground: string;
  /** Colour of the character being transmitted */
  fullscreenSendingForeground: string;

  // --- Screen Wake Lock ---
  /** Keep the screen active to prevent idle sleep (mobile devices) */
  wakeLockEnabled: boolean;
}

const COMMON_DEFAULTS: CommonSettings = {
  rxDecoderWpm: 12,
  txDecoderWpm: 12,
  encoderWpm: 12,
  keyerWpm: 12,
  paddleMode: 'iambic-b',

  fullscreenInputMode: 'key',
  fullscreenLensEnabled: false,
  fullscreenFont: DEFAULT_FULLSCREEN_FONT,
  fullscreenFontSize: 24,
  fullscreenFontBold: false,
  fullscreenLineSpacing: 0.1,
  fullscreenRxForeground: '#00ff88',
  fullscreenRxBackground: '#0e1218',
  fullscreenTxForeground: '#ffcc00',
  fullscreenTxBackground: '#0d0d18',
  fullscreenBufferForeground: '#666666',
  fullscreenSendingForeground: '#ffff00',

  wakeLockEnabled: false,
};

const COMMON_FIELD_RULES: SettingsFieldRules = {
  enums: {
    paddleMode: PADDLE_MODES,
    fullscreenInputMode: ['key', 'type'],
    fullscreenFont: FULLSCREEN_FONTS.map(f => f.id),
  },
  colors: [
    'fullscreenRxForeground',
    'fullscreenRxBackground',
    'fullscreenTxForeground',
    'fullscreenTxBackground',
    'fullscreenBufferForeground',
    'fullscreenSendingForeground',
  ],
  // Matching the fullscreen menu sliders
  ranges: {
    fullscreenFontSize: [24, 184],
    fullscreenLineSpacing: [-0.3, 0.5],
  },
  integers: ['rxDecoderWpm', 'txDecoderWpm', 'encoderWpm', 'keyerWpm'],
};

/**
 * Complete application settings: the settings of every item plus the common
 * ones. To add a setting, add it to the model of the item that owns it; to add
 * an item, extend this interface and the two compositions below.
 *
 * All settings are persisted per-device-configuration (see StoredProfile).
 */
export interface AppSettings extends
  MicSettings, CwDetectorSettings, AudioOutputSettings, SerialOutputSettings, SerialInputSettings,
  WinkeyerSettings, RtdbOutputSettings, SidetoneSettings, VibrationSettings, EncoderSettings,
  KeyboardKeyerSettings, MouseKeyerSettings, TouchKeyerSettings, MidiInputSettings, MidiOutputSettings,
  RtdbInputSettings, SpriteKeySettings, TextBlurSettings, ShowProsignsSettings, ProsignActionsSettings,
  FarnsworthSettings, PracticeSettings, EmojisSettings, CommonSettings {}

const DEFAULT_SETTINGS: AppSettings = {
  ...MIC_DEFAULTS,
  ...CW_DETECTOR_DEFAULTS,
  ...AUDIO_OUTPUT_DEFAULTS,
  ...SERIAL_OUTPUT_DEFAULTS,
  ...SERIAL_INPUT_DEFAULTS,
  ...WINKEYER_DEFAULTS,
  ...RTDB_OUTPUT_DEFAULTS,
  ...SIDETONE_DEFAULTS,
  ...VIBRATION_DEFAULTS,
  ...ENCODER_DEFAULTS,
  ...KEYBOARD_KEYER_DEFAULTS,
  ...MOUSE_KEYER_DEFAULTS,
  ...TOUCH_KEYER_DEFAULTS,
  ...MIDI_INPUT_DEFAULTS,
  ...MIDI_OUTPUT_DEFAULTS,
  ...RTDB_INPUT_DEFAULTS,
  ...SPRITE_KEY_DEFAULTS,
  ...TEXT_BLUR_DEFAULTS,
  ...SHOW_PROSIGNS_DEFAULTS,
  ...PROSIGN_ACTIONS_DEFAULTS,
  ...FARNSWORTH_DEFAULTS,
  ...PRACTICE_DEFAULTS,
  ...EMOJIS_DEFAULTS,
  ...COMMON_DEFAULTS,
};

/** How preset and settings-file values are checked, combined from every item. */
export const SETTINGS_FIELD_RULES = mergeFieldRules(
  MIC_FIELD_RULES, CW_DETECTOR_FIELD_RULES, AUDIO_OUTPUT_FIELD_RULES, SERIAL_OUTPUT_FIELD_RULES,
  SERIAL_INPUT_FIELD_RULES, WINKEYER_FIELD_RULES, RTDB_OUTPUT_FIELD_RULES, SIDETONE_FIELD_RULES,
  VIBRATION_FIELD_RULES, ENCODER_FIELD_RULES, KEYBOARD_KEYER_FIELD_RULES, MOUSE_KEYER_FIELD_RULES,
  TOUCH_KEYER_FIELD_RULES, MIDI_INPUT_FIELD_RULES, MIDI_OUTPUT_FIELD_RULES, RTDB_INPUT_FIELD_RULES,
  SPRITE_KEY_FIELD_RULES, TEXT_BLUR_FIELD_RULES, PROSIGN_ACTIONS_FIELD_RULES, FARNSWORTH_FIELD_RULES,
  PRACTICE_FIELD_RULES, EMOJIS_FIELD_RULES, COMMON_FIELD_RULES,
);

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

const PROFILES_KEY = 'morseProfiles';

/**
 * Display settings of the fullscreen conversation modal, as one read-only view
 * of the `fullscreen*` fields of AppSettings (so they are saved with the profile
 * and included in presets).
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

/** AppSettings field behind each display setting. */
const MODAL_DISPLAY_FIELDS: Record<keyof ModalDisplaySettings, keyof AppSettings> = {
  fontSize: 'fullscreenFontSize',
  fontBold: 'fullscreenFontBold',
  lineSpacing: 'fullscreenLineSpacing',
  rxForeground: 'fullscreenRxForeground',
  rxBackground: 'fullscreenRxBackground',
  txForeground: 'fullscreenTxForeground',
  txBackground: 'fullscreenTxBackground',
  bufferForeground: 'fullscreenBufferForeground',
  sendingForeground: 'fullscreenSendingForeground',
};

/**
 * Settings Service — centralized configuration store.
 *
 * Responsibilities:
 *  - Holds all application settings as reactive Angular signals
 *  - Per-device profile management: saves/loads settings keyed by device
 *    fingerprint (so different USB sound card combos get different configs)
 *  - Device ID remapping: stores device labels and re-resolves IDs on reload
 *  - Channel conflict detection: warns when outputs overlap on same channel
 *  - Fullscreen modal display settings as a view over the common settings
 *
 * What each setting is, its default and its allowed values belong to the item
 * model that owns it (`components/settings-items/<item>/<item>-item.model.ts`).
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<AppSettings>({ ...DEFAULT_SETTINGS });

  /** Fullscreen display settings: a read-only view of the `fullscreen*` fields of `settings` */
  readonly modalDisplay = computed<ModalDisplaySettings>(() => {
    const s = this.settings();
    return {
      fontSize: s.fullscreenFontSize,
      fontBold: s.fullscreenFontBold,
      lineSpacing: s.fullscreenLineSpacing,
      rxForeground: s.fullscreenRxForeground,
      rxBackground: s.fullscreenRxBackground,
      txForeground: s.fullscreenTxForeground,
      txBackground: s.fullscreenTxBackground,
      bufferForeground: s.fullscreenBufferForeground,
      sendingForeground: s.fullscreenSendingForeground,
    };
  });

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
  readonly channelConflict = computed<string[] | null>(() => findChannelConflicts(this.settings()));

  /** True when all outputs target the same device */
  readonly singleCardGuide = computed(() => {
    const s = this.settings();
    const norm = (id: string) => id || 'default';
    return norm(s.sidetoneOutputDeviceId) === norm(s.optoOutputDeviceId) &&
      norm(s.optoOutputDeviceId) === norm(s.pilotOutputDeviceId);
  });

  /**
   * Update fullscreen display settings in memory. Like other settings they are
   * saved with the profile by `save()`, which the caller runs afterwards.
   */
  updateModalDisplay(patch: Partial<ModalDisplaySettings>): void {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      mapped[MODAL_DISPLAY_FIELDS[key as keyof ModalDisplaySettings]] = value;
    }
    this.update(mapped as Partial<AppSettings>);
  }

  /** Update in-memory settings (does NOT persist — use save() for that) */
  update(patch: Partial<AppSettings>): void {
    this.settings.set({ ...this.settings(), ...patch });
    this.isDirty.set(true);
  }

  /**
   * Try to load a saved settings profile for the given device fingerprint.
   * Remaps stored device IDs to current session IDs using labels. Settings
   * missing from the stored profile take their default.
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
      this.settings.set(this._remapProfile(profile, currentInputs, currentOutputs));
      this.isDirty.set(false);
      this.needsValidation.set(false);
      return true;
    }

    // No profile found — reset device IDs to 'default' so selects show correctly
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
  ): SettingsSaveResult {
    const fp = this.currentFingerprint();
    if (!fp) return 'no-profile';

    const s = this.settings();
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      const profiles: Record<string, StoredProfile> = raw ? JSON.parse(raw) : {};
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

      profiles[fp] = { settings: { ...s }, deviceLabels };
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      return 'storage-error';
    }

    this.isDirty.set(false);
    this.needsValidation.set(false);
    return 'saved';
  }

  /** Stored device ids are remapped to this session's ids by label; missing settings take their default */
  private _remapProfile(
    profile: StoredProfile,
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): AppSettings {
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
    return { ...DEFAULT_SETTINGS, ...remapped };
  }

  /** The last saved settings for the current device, or null when none are saved. Changes nothing. */
  peekSavedSettings(
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): AppSettings | null {
    const profile = this._getProfiles()[this.currentFingerprint()];
    return profile ? this._remapProfile(profile, currentInputs, currentOutputs) : null;
  }

  /**
   * Discard unsaved changes by restoring the last saved settings for the
   * current device. Returns the restored settings, or null when nothing is saved.
   */
  revertToSaved(
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): AppSettings | null {
    const saved = this.peekSavedSettings(currentInputs, currentOutputs);
    if (!saved) return null;
    this.settings.set(saved);
    this.isDirty.set(false);
    this.needsValidation.set(false);
    return saved;
  }

  /** True when there are unsaved changes and a saved profile exists to go back to */
  readonly canRevert = computed(() =>
    this.isDirty() && !this.needsValidation() && this.currentFingerprint() !== '');

  /** Clear the unsaved flag when the live settings turn out to match the saved profile again */
  clearDirtyIfSaved(
    currentInputs: { deviceId: string; label: string }[],
    currentOutputs: { deviceId: string; label: string }[],
  ): void {
    const saved = this.peekSavedSettings(currentInputs, currentOutputs);
    if (!saved || this.needsValidation()) return;
    const live = this.settings() as unknown as Record<string, unknown>;
    const same = Object.entries(saved as unknown as Record<string, unknown>)
      .every(([key, value]) => JSON.stringify(live[key]) === JSON.stringify(value));
    if (same) this.isDirty.set(false);
  }

  resetToDefaults(): void {
    this.settings.set({ ...DEFAULT_SETTINGS });
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
