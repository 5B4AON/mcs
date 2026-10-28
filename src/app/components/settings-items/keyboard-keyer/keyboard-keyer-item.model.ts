/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Keyboard Keyer item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const KEYBOARD_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'keyboard-keyer',
  keys: ['keyboardKeyerEnabled'],
  validate: () => [],
  review: labelledReview({ keyboardKeyerEnabled: 'Keyboard keyer' }),
};
