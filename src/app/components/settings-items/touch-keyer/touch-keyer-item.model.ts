/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the touch-keyer item edits and says in a review. */
export const TOUCH_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'touch-keyer',
  keys: ['touchKeyerEnabled', 'touchKeyerSource', 'touchKeyerMode', 'touchLeftPaddle', 'touchRightPaddle', 'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor'],
  validate: () => [],
  review: labelledReview({
    touchKeyerEnabled: 'Touch keyer',
    touchKeyerSource: 'Touch keyer source',
    touchKeyerMode: 'Touch mode',
    touchLeftPaddle: 'Left paddle',
    touchRightPaddle: 'Right paddle',
    touchReversePaddles: 'Reverse paddles',
    touchPaddleMode: 'Paddle mode',
    touchKeyerName: 'Name',
    touchKeyerColor: 'Colour',
  }),
};
