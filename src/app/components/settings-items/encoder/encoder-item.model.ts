/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
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

/** How an encoder mode reads in a review. */
function modeText(key: keyof AppSettings, value: unknown): string {
  if (key !== 'encoderMode') return value === '' || value === undefined ? 'none' : String(value);
  return value === 'live' ? 'Live' : value === 'practice' ? 'Practice' : 'Send on Enter';
}

/** The send mode of typed text (live or on Enter), asked on its own page of the Type guide. */
export const ENCODER_MODE_DESCRIPTOR: ItemDescriptor = {
  id: 'encoder-mode',
  keys: ['encoderMode'],
  validate: () => [],
  review: labelledReview({ encoderMode: 'Typed text is sent' }, modeText),
};
