/**
 * Morse Code Studio
 */

import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import type { AppSettings } from '../../../services/settings.service';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Encoder submission mode: 'enter' waits for Enter key, 'live' sends as you type, 'practice' for copy practice */
export const ENCODER_MODES = ['enter', 'live', 'practice'] as const;
export type EncoderMode = typeof ENCODER_MODES[number];

/** The settings the Keyboard Encoder item owns. Its speed is in the common settings. */
export interface EncoderSettings {
  encoderMode: EncoderMode;
  /** Encoder source: which pool encoder text is tagged with ('rx' or 'tx') */
  encoderSource: DecoderSource;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  encoderName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  encoderColor: string;
}

export const ENCODER_DEFAULTS: EncoderSettings = {
  encoderMode: 'enter',
  encoderSource: 'tx',
  encoderName: '',
  encoderColor: '',
};

export const ENCODER_FIELD_RULES: SettingsFieldRules = {
  enums: { encoderMode: ENCODER_MODES, encoderSource: DECODER_SOURCES },
};

/** What the Keyboard Encoder item edits and says in a review. */
export const ENCODER_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder',
  keys: ['encoderSource', 'encoderName', 'encoderColor'],
  validate: () => [],
  review: labelledReview({
    encoderSource: 'Typed text is used as',
    encoderName: 'Encoder name',
    encoderColor: 'Encoder colour',
  }),
};

/** How an encoder mode reads in a review. */
function modeText(key: keyof AppSettings, value: unknown): string {
  if (key !== 'encoderMode') return value === '' || value === undefined ? 'none' : String(value);
  return value === 'live' ? 'Live' : value === 'practice' ? 'Practice' : 'Send on Enter';
}

/** The send mode of typed text (live or on Enter), asked on its own page of the Type guide. */
export const ENCODER_MODE_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder-mode',
  keys: ['encoderMode'],
  validate: () => [],
  review: labelledReview({ encoderMode: 'Typed text is sent' }, modeText),
};
