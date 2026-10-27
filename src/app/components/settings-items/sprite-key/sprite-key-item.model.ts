/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the sprite-key item edits and says in a review. */
export const SPRITE_KEY_DESCRIPTOR: ItemDescriptor = {
  id: 'sprite-key',
  keys: ['spriteButtonEnabled', 'spriteSource', 'spriteName', 'spriteColor', 'spriteAnimateKeyboard', 'spriteAnimateEncoder', 'spriteAnimateMouse', 'spriteAnimateMidi', 'spriteAnimateSerial', 'spriteAnimateMic'],
  validate: () => [],
  review: labelledReview({
    spriteButtonEnabled: 'Sprite key',
    spriteSource: 'Sprite source',
    spriteName: 'Name',
    spriteColor: 'Colour',
    spriteAnimateKeyboard: 'Animate on keyboard',
    spriteAnimateEncoder: 'Animate on encoder',
    spriteAnimateMouse: 'Animate on mouse',
    spriteAnimateMidi: 'Animate on MIDI',
    spriteAnimateSerial: 'Animate on serial',
    spriteAnimateMic: 'Animate on microphone',
  }),
};
