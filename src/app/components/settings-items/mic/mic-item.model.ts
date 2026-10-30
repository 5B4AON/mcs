/**
 * Morse Code Studio
 */

import {
  AUDIO_CHANNELS, AudioChannel, DECODER_SOURCES, DecoderSource, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Straight Key via Mic (pilot tone detection) item owns, including the pilot tone output. */
export interface MicSettings {
  micInputEnabled: boolean;
  /** Decoder source: which calibration pool mic input feeds ('rx' or 'tx') */
  micInputSource: DecoderSource;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  micInputName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  micInputColor: string;
  inputDeviceId: string;
  inputThreshold: number;
  inputInvert: boolean;
  inputDebounceMs: number;

  // --- Pilot Tone ---
  pilotFrequency: number;
  pilotAmplitude: number;
  pilotOutputDeviceId: string;
  pilotOutputChannel: AudioChannel;
}

export const MIC_DEFAULTS: MicSettings = {
  micInputEnabled: false,
  micInputSource: 'rx',
  micInputName: '',
  micInputColor: '',
  inputDeviceId: 'default',
  inputThreshold: 0.01,
  inputInvert: false,
  inputDebounceMs: 15,

  pilotFrequency: 18000,
  pilotAmplitude: 0.85,
  pilotOutputDeviceId: 'default',
  pilotOutputChannel: 'left',
};

export const MIC_FIELD_RULES: SettingsFieldRules = {
  enums: { micInputSource: DECODER_SOURCES, pilotOutputChannel: AUDIO_CHANNELS },
  integers: ['inputDebounceMs'],
};

/** What the Straight Key via Mic (pilot tone) item edits, checks and says in a review. */
export const MIC_DESCRIPTOR: ItemDescriptor = {
  id: 'mic',
  keys: [
    'micInputEnabled', 'micInputSource', 'inputDeviceId', 'pilotOutputDeviceId', 'pilotOutputChannel',
    'pilotFrequency', 'pilotAmplitude', 'inputThreshold', 'inputDebounceMs', 'inputInvert',
    'micInputName', 'micInputColor',
  ],
  validate: s => s.micInputEnabled && (s.pilotFrequency < 10000 || s.pilotFrequency > 22000)
    ? ['Mic key pilot frequency must be between 10000 and 22000 Hz.']
    : [],
  review: labelledReview({
    micInputEnabled: 'Straight key via mic',
    micInputSource: 'Mic key used for',
    inputDeviceId: 'Mic device',
    pilotOutputDeviceId: 'Pilot output device',
    pilotOutputChannel: 'Pilot output channel',
    pilotFrequency: 'Pilot frequency (Hz)',
    pilotAmplitude: 'Pilot amplitude',
    inputThreshold: 'Mic key threshold',
    inputDebounceMs: 'Mic key debounce (ms)',
    inputInvert: 'Mic key invert',
    micInputName: 'Mic key name',
    micInputColor: 'Mic key colour',
  }),
};
