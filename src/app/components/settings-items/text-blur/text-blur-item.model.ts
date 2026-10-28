/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Text Blurring item edits and says in a review. */
export const TEXT_BLUR_DESCRIPTOR: ItemDescriptor = {
  id: 'text-blur',
  keys: ['textBlurEnabled', 'textBlurAppliesTo'],
  validate: () => [],
  review: labelledReview({
    textBlurEnabled: 'Text blurring',
    textBlurAppliesTo: 'Text blurring applies to',
  }),
};
