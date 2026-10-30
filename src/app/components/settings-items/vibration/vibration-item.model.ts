/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Vibration Output (Android only) item owns. */
export interface VibrationSettings {
  /** Enable haptic vibration feedback while keying (Android only) */
  vibrateEnabled: boolean;
  vibrateForward: OutputForward;
  /** Enhanced haptic: pre-pulse on keydown + delayed cancel on keyup to compensate for motor lag */
  vibrateEnhanced: boolean;
}

export const VIBRATION_DEFAULTS: VibrationSettings = {
  vibrateEnabled: false,
  vibrateForward: 'both',
  vibrateEnhanced: true,
};

export const VIBRATION_FIELD_RULES: SettingsFieldRules = {
  enums: { vibrateForward: OUTPUT_FORWARDS },
};

/** What the Vibration item edits and says in a review. */
export const VIBRATION_DESCRIPTOR: ItemDescriptor = {
  id: 'vibration',
  keys: ['vibrateEnabled', 'vibrateForward', 'vibrateEnhanced'],
  validate: () => [],
  review: labelledReview({
    vibrateEnabled: 'Vibration',
    vibrateForward: 'Vibration active on',
    vibrateEnhanced: 'Enhanced haptic timing',
  }),
};
