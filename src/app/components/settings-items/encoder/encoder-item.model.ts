/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Keyboard Encoder item edits and says in a review. */
export const ENCODER_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder',
  keys: ['encoderSource', 'encoderName', 'encoderColor'],
  validate: () => [],
  review: labelledReview({
    encoderSource: 'Typed text is used as',
    encoderName: 'Encoder name',
    encoderColor: 'Encoder colour',
  }),
};
