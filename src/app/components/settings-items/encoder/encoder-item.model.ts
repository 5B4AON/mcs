/**
 * Morse Code Studio
 */

import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import type { AppSettings } from '../../../services/settings.service';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';

/** Encoder submission mode: 'enter' waits for Enter key, 'live' sends as you type, 'practice' for copy practice, 'send-practice' for send practice */
export const ENCODER_MODES = ['enter', 'live', 'practice', 'send-practice'] as const;
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

const REVIEW_LABELS = {
  encoderSource: 'Typed text is used as',
  encoderName: 'Encoder name',
  encoderColor: 'Encoder colour',
};

/** What the Keyboard Encoder item edits and says in a review. */
export const ENCODER_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder',
  keys: ['encoderSource', 'encoderName', 'encoderColor'],
  validate: () => [],
  review: labelledReview(REVIEW_LABELS),
};

/** Whether typed text counts as sent or received, on its own wizard step. */
export const ENCODER_SOURCE_DESCRIPTOR = partDescriptor('encoder-source', ['encoderSource'], REVIEW_LABELS);

/** The name and colour of typed text, on their own wizard step. */
export const ENCODER_IDENTITY_DESCRIPTOR = partDescriptor('encoder-identity', ['encoderName', 'encoderColor'], REVIEW_LABELS);

/** How an encoder mode reads in a review. */
function modeText(key: keyof AppSettings, value: unknown): string {
  if (key !== 'encoderMode') return value === '' || value === undefined ? 'none' : String(value);
  return value === 'live' ? 'Live' : value === 'practice' ? 'Copy practice' : value === 'send-practice' ? 'Send practice' : 'Send on Enter';
}

/** The send mode of typed text (live or on Enter), asked on its own page of the Type guide. */
export const ENCODER_MODE_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder-mode',
  keys: ['encoderMode'],
  validate: s => s.encoderMode === 'enter' || s.encoderMode === 'live'
    ? []
    : ['Choose Send on Enter or Live: the main screen is in a practice mode, which does not type text as Morse.'],
  review: labelledReview({ encoderMode: 'Typed text is sent' }, modeText),
};
