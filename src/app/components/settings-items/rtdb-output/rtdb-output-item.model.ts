/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Firebase RTDB Output item edits. The channel secret is never shown in a review, only whether it is set. */
export const RTDB_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'rtdb-output',
  keys: [
    'rtdbOutputEnabled', 'rtdbOutputForward', 'rtdbOutputChannelName', 'rtdbOutputChannelSecret',
    'rtdbOutputName', 'rtdbOutputOverrideName', 'rtdbOutputColor', 'rtdbOutputOverrideColor',
    'rtdbAllowInputRelay', 'rtdbRelaySuppressOtherInputs',
  ],
  validate: s => {
    if (!s.rtdbOutputEnabled) return [];
    const errors: string[] = [];
    if (!s.rtdbOutputChannelName.trim()) errors.push('Firebase output: enter a channel name, or turn it off.');
    if (!s.rtdbOutputChannelSecret.trim()) errors.push('Firebase output: enter a channel secret, or turn it off.');
    if (!s.rtdbOutputName.trim()) errors.push('Firebase output: enter your name, or turn it off.');
    return errors;
  },
  review: labelledReview({
    rtdbOutputEnabled: 'Firebase RTDB output',
    rtdbOutputForward: 'Firebase output forwards',
    rtdbOutputChannelName: 'Firebase output channel',
    rtdbOutputChannelSecret: 'Firebase output channel secret',
    rtdbOutputName: 'Firebase output name',
    rtdbOutputOverrideName: 'Always use this name',
    rtdbOutputColor: 'Firebase output colour',
    rtdbOutputOverrideColor: 'Always use this colour',
    rtdbAllowInputRelay: 'Relay Firebase input to output',
    rtdbRelaySuppressOtherInputs: 'Relay suppresses other inputs',
  }, (key, value) => {
    if (key === 'rtdbOutputChannelSecret') return value ? 'set' : 'none';
    if (key === 'rtdbOutputForward') return value === 'rx' ? 'RX only' : value === 'tx' ? 'TX only' : 'RX and TX';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    return value === '' || value === undefined ? 'none' : String(value);
  }),
};
