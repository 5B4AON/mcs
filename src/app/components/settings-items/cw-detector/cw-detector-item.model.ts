/**
 * Morse Code Studio
 */

import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Input channel the detector listens to; 'both' mixes left and right */
export const CW_INPUT_CHANNELS = ['both', 'left', 'right'] as const;
export type CwInputChannel = typeof CW_INPUT_CHANNELS[number];

/** The settings the CW Tone Detector (straight key via audio channel) item owns. */
export interface CwDetectorSettings {
  cwInputEnabled: boolean;
  /** Decoder source: which calibration pool CW input feeds ('rx' or 'tx') */
  cwInputSource: DecoderSource;
  cwInputDeviceId: string;
  cwInputChannel: CwInputChannel;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  cwInputName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  cwInputColor: string;
}

export const CW_DETECTOR_DEFAULTS: CwDetectorSettings = {
  cwInputEnabled: false,
  cwInputSource: 'rx',
  cwInputDeviceId: 'default',
  cwInputChannel: 'both',
  cwInputName: '',
  cwInputColor: '',
};

export const CW_DETECTOR_FIELD_RULES: SettingsFieldRules = {
  enums: { cwInputSource: DECODER_SOURCES, cwInputChannel: CW_INPUT_CHANNELS },
};

/** What the CW Tone Detector item edits, checks and says in a review. */
export const CW_DETECTOR_DESCRIPTOR: ItemDescriptor = {
  id: 'cw-detector',
  keys: [
    'cwInputEnabled', 'cwInputSource', 'cwInputDeviceId', 'cwInputChannel', 'cwInputName', 'cwInputColor',
  ],
  validate: s => {
    if (!s.cwInputEnabled) return [];
    const errors: string[] = [];
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
    cwInputName: 'CW detector name',
    cwInputColor: 'CW detector colour',
  }),
};
