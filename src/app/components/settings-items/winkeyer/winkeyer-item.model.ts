/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the WinKeyer item edits and says in a review. */
export const WINKEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'winkeyer',
  keys: ['winkeyerEnabled', 'winkeyerForward', 'winkeyerPortIndex', 'winkeyerWpm'],
  validate: s => {
    const errors: string[] = [];
    if (s.winkeyerEnabled && s.winkeyerPortIndex < 0) errors.push('WinKeyer: choose a serial port, or turn WinKeyer off.');
    if (s.winkeyerWpm < 5 || s.winkeyerWpm > 99) errors.push('WinKeyer speed must be between 5 and 99 WPM.');
    return errors;
  },
  review: labelledReview({
    winkeyerEnabled: 'WinKeyer output',
    winkeyerForward: 'WinKeyer forwards',
    winkeyerPortIndex: 'WinKeyer port',
    winkeyerWpm: 'WinKeyer speed (WPM)',
  }, (key, value) => {
    if (key === 'winkeyerForward') return value === 'rx' ? 'RX only' : value === 'tx' ? 'TX only' : 'RX and TX';
    if (key === 'winkeyerPortIndex') return (value as number) < 0 ? 'none' : `Port ${(value as number) + 1}`;
    if (key === 'winkeyerEnabled') return value ? 'On' : 'Off';
    return String(value);
  }),
};
