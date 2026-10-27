/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Firebase RTDB Input item edits. The channel secret is never shown in a review, only whether it is set. */
export const RTDB_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'rtdb-input',
  keys: [
    'rtdbInputEnabled', 'rtdbInputSource', 'rtdbInputChannelName', 'rtdbInputChannelSecret',
    'rtdbInputOverrideWpm', 'rtdbInputName', 'rtdbInputColor',
  ],
  validate: s => {
    if (!s.rtdbInputEnabled) return [];
    const errors: string[] = [];
    if (!s.rtdbInputChannelName.trim()) errors.push('Firebase input: enter a channel name, or turn it off.');
    if (!s.rtdbInputChannelSecret.trim()) errors.push('Firebase input: enter a channel secret, or turn it off.');
    return errors;
  },
  review: labelledReview({
    rtdbInputEnabled: 'Firebase RTDB input',
    rtdbInputSource: 'Firebase input used for',
    rtdbInputChannelName: 'Firebase input channel',
    rtdbInputChannelSecret: 'Firebase input channel secret',
    rtdbInputOverrideWpm: 'Firebase input uses local encoder speed',
    rtdbInputName: 'Firebase input name override',
    rtdbInputColor: 'Firebase input colour override',
  }, (key, value) => {
    if (key === 'rtdbInputChannelSecret') return value ? 'set' : 'none';
    if (key === 'rtdbInputSource') return value === 'rx' ? 'RX' : 'TX';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    return value === '' || value === undefined ? 'none' : String(value);
  }),
};
