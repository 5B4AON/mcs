/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Show Prosigns item edits and says in a review. */
export const SHOW_PROSIGNS_DESCRIPTOR: ItemDescriptor = {
  id: 'show-prosigns',
  keys: ['showProsigns'],
  validate: () => [],
  review: labelledReview({
    showProsigns: 'Show prosign names',
  }),
};
