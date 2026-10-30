/**
 * Morse Code Studio
 */

import {
  AUDIO_CHANNELS, AudioChannel, DECODER_SOURCES, DecoderSource, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the CW Tone Detector (straight key via audio channel) item owns. */
export interface CwDetectorSettings {
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
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  cwInputName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  cwInputColor: string;
}

export const CW_DETECTOR_DEFAULTS: CwDetectorSettings = {
  cwInputEnabled: false,
  cwInputSource: 'rx',
  cwInputDeviceId: 'default',
  cwInputChannel: 'left',
  cwInputFrequency: 600,
  cwInputBandwidth: 100,
  cwInputDebounceMs: 10,
  cwInputAutoThreshold: true,
  cwInputThreshold: 0.01,
  cwInputName: '',
  cwInputColor: '',
};

export const CW_DETECTOR_FIELD_RULES: SettingsFieldRules = {
  enums: { cwInputSource: DECODER_SOURCES, cwInputChannel: AUDIO_CHANNELS },
  integers: ['cwInputDebounceMs'],
};

/** What the CW Tone Detector item edits, checks and says in a review. */
export const CW_DETECTOR_DESCRIPTOR: ItemDescriptor = {
  id: 'cw-detector',
  keys: [
    'cwInputEnabled', 'cwInputSource', 'cwInputDeviceId', 'cwInputChannel', 'cwInputFrequency',
    'cwInputBandwidth', 'cwInputAutoThreshold', 'cwInputThreshold', 'cwInputDebounceMs',
    'cwInputName', 'cwInputColor',
  ],
  validate: s => {
    if (!s.cwInputEnabled) return [];
    const errors: string[] = [];
    if (s.cwInputFrequency < 200 || s.cwInputFrequency > 2000) errors.push('CW detector tone frequency must be between 200 and 2000 Hz.');
    if (s.cwInputBandwidth < 100 || s.cwInputBandwidth > 500) errors.push('CW detector bandwidth must be between 100 and 500 Hz.');
    if (s.micInputEnabled && (s.cwInputDeviceId || 'default') === (s.inputDeviceId || 'default')) {
      errors.push('CW detector and mic key both use the same mic device. Use a different device or turn one off.');
    }
    return errors;
  },
  review: labelledReview({
    cwInputEnabled: 'CW tone detector',
    cwInputSource: 'CW detector used for',
    cwInputDeviceId: 'CW detector input device',
    cwInputChannel: 'CW detector input channel',
    cwInputFrequency: 'CW tone frequency (Hz)',
    cwInputBandwidth: 'CW tone bandwidth (Hz)',
    cwInputAutoThreshold: 'CW auto threshold',
    cwInputThreshold: 'CW manual threshold',
    cwInputDebounceMs: 'CW debounce (ms)',
    cwInputName: 'CW detector name',
    cwInputColor: 'CW detector colour',
  }),
};
