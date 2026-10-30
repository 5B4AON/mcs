/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the WinKeyer Output (K1EL WinKeyer via serial port) item owns. */
export interface WinkeyerSettings {
  winkeyerEnabled: boolean;
  winkeyerPortIndex: number;
  winkeyerWpm: number;
  winkeyerForward: OutputForward;
}

export const WINKEYER_DEFAULTS: WinkeyerSettings = {
  winkeyerEnabled: false,
  winkeyerPortIndex: -1,
  winkeyerWpm: 20,
  winkeyerForward: 'tx',
};

export const WINKEYER_FIELD_RULES: SettingsFieldRules = {
  enums: { winkeyerForward: OUTPUT_FORWARDS },
  integers: ['winkeyerWpm', 'winkeyerPortIndex'],
};

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
