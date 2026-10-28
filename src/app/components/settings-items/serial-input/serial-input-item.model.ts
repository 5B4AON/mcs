/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Serial Input item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const SERIAL_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'serial-input',
  keys: ['serialInputEnabled'],
  validate: () => [],
  review: labelledReview({ serialInputEnabled: 'Serial key/paddle input' }),
};
