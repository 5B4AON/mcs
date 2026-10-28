/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the MIDI Input item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const MIDI_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'midi-input',
  keys: ['midiInputEnabled'],
  validate: () => [],
  review: labelledReview({ midiInputEnabled: 'MIDI key/paddle input' }),
};
