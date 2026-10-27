/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the MIDI Output item (master switch and WPM option) edits and says in a review. The mappings have their own descriptor. */
export const MIDI_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'midi-output',
  keys: ['midiOutputEnabled', 'midiOutputOverrideWpm'],
  validate: () => [],
  review: labelledReview({
    midiOutputEnabled: 'MIDI output',
    midiOutputOverrideWpm: 'MIDI output uses local encoder speed',
  }),
};
