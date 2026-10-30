/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Show Prosigns item owns. */
export interface ShowProsignsSettings {
  /** Show prosigns (e.g., <AR>) instead of punctuation (e.g., +) in conversation logs */
  showProsigns: boolean;
}

export const SHOW_PROSIGNS_DEFAULTS: ShowProsignsSettings = {
  showProsigns: true,
};

/** What the Show Prosigns item edits and says in a review. */
export const SHOW_PROSIGNS_DESCRIPTOR: ItemDescriptor = {
  id: 'show-prosigns',
  keys: ['showProsigns'],
  validate: () => [],
  review: labelledReview({
    showProsigns: 'Show prosign names',
  }),
};
