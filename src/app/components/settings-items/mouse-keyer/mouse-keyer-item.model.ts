/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the mouse-keyer item edits and says in a review. */
export const MOUSE_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'mouse-keyer',
  keys: ['mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction', 'mouseRightAction', 'mouseReversePaddles', 'mousePaddleMode', 'mouseKeyerName', 'mouseKeyerColor'],
  validate: v => {
    const a = [v.mouseLeftAction, v.mouseMiddleAction, v.mouseRightAction].filter(x => x !== 'none');
    return new Set(a).size !== a.length
      ? ['Each mouse action should be assigned to only one button.']
      : [];
  },
  review: labelledReview({
    mouseKeyerEnabled: 'Mouse keyer',
    mouseKeyerSource: 'Mouse keyer source',
    mouseLeftAction: 'Left button',
    mouseMiddleAction: 'Middle button',
    mouseRightAction: 'Right button',
    mouseReversePaddles: 'Reverse paddles',
    mousePaddleMode: 'Paddle mode',
    mouseKeyerName: 'Name',
    mouseKeyerColor: 'Colour',
  }),
};
