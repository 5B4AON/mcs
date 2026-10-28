/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Serial Output item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const SERIAL_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'serial-output',
  keys: ['serialEnabled'],
  validate: () => [],
  review: labelledReview({ serialEnabled: 'Serial output (DTR/RTS keying)' }),
};
