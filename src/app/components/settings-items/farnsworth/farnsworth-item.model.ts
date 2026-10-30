/**
 * Morse Code Studio
 */

import { SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** How the user specifies gap stretching: effective WPM or direct multiplier */
export const FARNSWORTH_INPUT_MODES = ['wpm', 'multiplier'] as const;
export type FarnsworthInputMode = typeof FARNSWORTH_INPUT_MODES[number];

/** Which direction Farnsworth timing applies to: tx, rx, or both */
export const FARNSWORTH_APPLIES_TO = ['tx', 'rx', 'both'] as const;
export type FarnsworthAppliesTo = typeof FARNSWORTH_APPLIES_TO[number];

/** The settings the Farnsworth / Wordsworth timing item owns. */
export interface FarnsworthSettings {
  /** Master toggle for Farnsworth gap stretching */
  farnsworthEnabled: boolean;
  /** How the user specifies gap stretching: effective WPM or direct multiplier */
  farnsworthInputMode: FarnsworthInputMode;
  /** Target effective WPM when inputMode is 'wpm' (range: 5 to encoderWpm) */
  farnsworthEffectiveWpm: number;
  /** Direct gap multiplier when inputMode is 'multiplier' (Farnsworth: whole numbers 1 to 10; Wordsworth: 1 to 4 in steps of 0.5) */
  farnsworthMultiplier: number;
  /** Wordsworth mode: stretch only word gaps (not inter-character gaps) */
  farnsworthWordsworth: boolean;
  /** Which direction Farnsworth timing applies to: tx, rx, or both */
  farnsworthAppliesTo: FarnsworthAppliesTo;
}

export const FARNSWORTH_DEFAULTS: FarnsworthSettings = {
  farnsworthEnabled: false,
  farnsworthInputMode: 'wpm',
  farnsworthEffectiveWpm: 10,
  farnsworthMultiplier: 2,
  farnsworthWordsworth: false,
  farnsworthAppliesTo: 'both',
};

export const FARNSWORTH_FIELD_RULES: SettingsFieldRules = {
  enums: {
    farnsworthInputMode: FARNSWORTH_INPUT_MODES,
    farnsworthAppliesTo: FARNSWORTH_APPLIES_TO,
  },
};

/** What the Farnsworth item edits, checks and says in a review. */
export const FARNSWORTH_DESCRIPTOR: ItemDescriptor = {
  id: 'farnsworth',
  keys: [
    'farnsworthEnabled', 'farnsworthAppliesTo', 'farnsworthInputMode',
    'farnsworthEffectiveWpm', 'farnsworthMultiplier', 'farnsworthWordsworth',
  ],
  validate: s => {
    if (!s.farnsworthEnabled) return [];
    if (s.farnsworthInputMode === 'wpm' && s.farnsworthEffectiveWpm > s.encoderWpm) {
      return [`The effective speed (${s.farnsworthEffectiveWpm} WPM) cannot be above the character speed (${s.encoderWpm} WPM).`];
    }
    return [];
  },
  review: labelledReview({
    farnsworthEnabled: 'Farnsworth timing',
    farnsworthAppliesTo: 'Farnsworth applies to',
    farnsworthInputMode: 'Farnsworth mode',
    farnsworthEffectiveWpm: 'Effective speed (WPM)',
    farnsworthMultiplier: 'Gap multiplier',
    farnsworthWordsworth: 'Wordsworth mode',
  }),
};
