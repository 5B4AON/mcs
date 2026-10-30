/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Firebase RTDB Output item owns. */
export interface RtdbOutputSettings {
  rtdbOutputEnabled: boolean;
  rtdbOutputForward: OutputForward;
  rtdbOutputChannelName: string;
  /** Never included in presets or settings files */
  rtdbOutputChannelSecret: string;
  rtdbOutputName: string;
  /** Optional text color (CSS color string) — sent as 'col' parameter to remote listeners */
  rtdbOutputColor: string;
  /** When true, always send rtdbOutputName — overriding any input-specific name */
  rtdbOutputOverrideName: boolean;
  /** When true, always send rtdbOutputColor — overriding any input-specific color */
  rtdbOutputOverrideColor: boolean;
  /** When true, allow RTDB input characters to be relayed to RTDB output (disables echo suppression) */
  rtdbAllowInputRelay: boolean;
  /** When true, RTDB output only forwards chars from RTDB input relay — all other inputs are suppressed */
  rtdbRelaySuppressOtherInputs: boolean;
}

export const RTDB_OUTPUT_DEFAULTS: RtdbOutputSettings = {
  rtdbOutputEnabled: false,
  rtdbOutputForward: 'tx',
  rtdbOutputChannelName: '',
  rtdbOutputChannelSecret: '',
  rtdbOutputName: '',
  rtdbOutputColor: '',
  rtdbOutputOverrideName: false,
  rtdbOutputOverrideColor: false,
  rtdbAllowInputRelay: false,
  rtdbRelaySuppressOtherInputs: false,
};

export const RTDB_OUTPUT_FIELD_RULES: SettingsFieldRules = {
  enums: { rtdbOutputForward: OUTPUT_FORWARDS },
};

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
