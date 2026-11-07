/**
 * Morse Code Studio
 */

import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';
import type { AppSettings } from '../../../services/settings.service';

/** The settings the Firebase RTDB Input item owns. */
export interface RtdbInputSettings {
  rtdbInputEnabled: boolean;
  /** Decoder source: which pool RTDB input characters are tagged with ('rx' or 'tx') */
  rtdbInputSource: DecoderSource;
  rtdbInputChannelName: string;
  /** Never included in presets or settings files */
  rtdbInputChannelSecret: string;
  /** When true, ignore remote WPM and use local encoder WPM for playback */
  rtdbInputOverrideWpm: boolean;
  /** Optional override name — if non-empty, replaces the incoming sender name */
  rtdbInputName: string;
  /** Optional override color — if non-empty, replaces the incoming sender color */
  rtdbInputColor: string;
}

export const RTDB_INPUT_DEFAULTS: RtdbInputSettings = {
  rtdbInputEnabled: false,
  rtdbInputSource: 'rx',
  rtdbInputChannelName: '',
  rtdbInputChannelSecret: '',
  rtdbInputOverrideWpm: false,
  rtdbInputName: '',
  rtdbInputColor: '',
};

export const RTDB_INPUT_FIELD_RULES: SettingsFieldRules = {
  enums: { rtdbInputSource: DECODER_SOURCES },
};

/** What the Firebase RTDB Input item edits. The channel secret is never shown in a review, only whether it is set. */
const REVIEW_LABELS: Partial<Record<keyof AppSettings, string>> = {
  rtdbInputEnabled: 'Firebase RTDB input',
  rtdbInputSource: 'Firebase input used for',
  rtdbInputChannelName: 'Firebase input channel',
  rtdbInputChannelSecret: 'Firebase input channel secret',
  rtdbInputOverrideWpm: 'Firebase input uses local encoder speed',
  rtdbInputName: 'Firebase input name override',
  rtdbInputColor: 'Firebase input colour override',
};

/** Secrets read as set or none; the rest as plain text. */
function reviewText(key: keyof AppSettings, value: unknown): string {
  if (key === 'rtdbInputChannelSecret') return value ? 'set' : 'none';
  if (key === 'rtdbInputSource') return value === 'rx' ? 'RX' : 'TX';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return value === '' || value === undefined ? 'none' : String(value);
}

function connectProblems(s: AppSettings): string[] {
  if (!s.rtdbInputEnabled) return [];
  const errors: string[] = [];
  if (!s.rtdbInputChannelName.trim()) errors.push('Firebase input: enter a channel name, or turn it off.');
  if (!s.rtdbInputChannelSecret.trim()) errors.push('Firebase input: enter a channel secret, or turn it off.');
  return errors;
}

export const RTDB_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'rtdb-input',
  keys: [
    'rtdbInputEnabled', 'rtdbInputSource', 'rtdbInputChannelName', 'rtdbInputChannelSecret',
    'rtdbInputOverrideWpm', 'rtdbInputName', 'rtdbInputColor',
  ],
  validate: connectProblems,
  review: labelledReview(REVIEW_LABELS, reviewText),
};

/** The switch, channel name and secret on their own wizard step. */
export const RTDB_INPUT_CONNECT_DESCRIPTOR = partDescriptor('rtdb-input-connect', ['rtdbInputEnabled', 'rtdbInputChannelName', 'rtdbInputChannelSecret'], REVIEW_LABELS, connectProblems, reviewText);

/** How received Morse plays (RX or TX, local speed) on its own wizard step. */
export const RTDB_INPUT_PLAY_DESCRIPTOR = partDescriptor('rtdb-input-play', ['rtdbInputSource', 'rtdbInputOverrideWpm'], REVIEW_LABELS, undefined, reviewText);

/** The sender name and colour overrides on their own wizard step. */
export const RTDB_INPUT_NAMES_DESCRIPTOR = partDescriptor('rtdb-input-names', ['rtdbInputName', 'rtdbInputColor'], REVIEW_LABELS, undefined, reviewText);
