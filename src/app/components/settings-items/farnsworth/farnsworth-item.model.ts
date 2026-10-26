/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Farnsworth item edits, checks and says in a review. */
export const FARNSWORTH_DESCRIPTOR: ItemDescriptor = {
  id: 'farnsworth',
  keys: [
    'farnsworthEnabled', 'farnsworthAppliesTo', 'farnsworthInputMode',
    'farnsworthEffectiveWpm', 'farnsworthMultiplier', 'farnsworthWordsworth',
  ],
  validate: s => {
    if (!s.farnsworthEnabled) return [];
    if (s.farnsworthInputMode === 'wpm' && s.farnsworthEffectiveWpm > s.encoderWpm) {
      return [`The effective speed (${s.farnsworthEffectiveWpm} WPM) cannot be above the character speed (${s.encoderWpm} WPM).`];
    }
    return [];
  },
  review: labelledReview({
    farnsworthEnabled: 'Farnsworth timing',
    farnsworthAppliesTo: 'Farnsworth applies to',
    farnsworthInputMode: 'Farnsworth mode',
    farnsworthEffectiveWpm: 'Effective speed (WPM)',
    farnsworthMultiplier: 'Gap multiplier',
    farnsworthWordsworth: 'Wordsworth mode',
  }),
};
