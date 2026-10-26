/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

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
