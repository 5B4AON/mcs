/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Serial port control pin used for keying */
export const SERIAL_PINS = ['dtr', 'rts'] as const;
export type SerialPin = typeof SERIAL_PINS[number];

/** Configuration for a single serial output mapping */
export interface SerialOutputMapping {
  enabled: boolean;
  /** Serial port index (-1 = not assigned) */
  portIndex: number;
  /** Which output pin to drive (DTR or RTS) */
  pin: SerialPin;
  /** Invert the signal (active-high instead of default active-low) */
  invert: boolean;
  /** Output forwarding mode: which signal source drives this mapping */
  forward: OutputForward;
  /** Indices into serialInputMappings that are allowed to relay through this output mapping */
  relayInputIndices: number[];
  /** When true, only relay sources (and encoder) drive this output — all other inputs are suppressed */
  relaySuppressOtherInputs: boolean;
}

/** The settings the Key Output via Serial Port (DTR/RTS) item owns. */
export interface SerialOutputSettings {
  serialEnabled: boolean;
  /** Ordered list of serial output mappings (one per port+pin combination) */
  serialOutputMappings: SerialOutputMapping[];
}

export const SERIAL_OUTPUT_DEFAULTS: SerialOutputSettings = {
  serialEnabled: false,
  serialOutputMappings: [
    {
      enabled: true,
      portIndex: -1,
      pin: 'dtr',
      invert: false,
      forward: 'tx',
      relayInputIndices: [],
      relaySuppressOtherInputs: false,
    },
  ],
};

export const SERIAL_OUTPUT_FIELD_RULES: SettingsFieldRules = {
  enums: {
    'serialOutputMappings[].pin': SERIAL_PINS,
    'serialOutputMappings[].forward': OUTPUT_FORWARDS,
  },
  integers: [
    'serialOutputMappings[].portIndex',
    'serialOutputMappings[].relayInputIndices[]',
  ],
};

/** What the Serial Output item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const SERIAL_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'serial-output',
  keys: ['serialEnabled'],
  validate: () => [],
  review: labelledReview({ serialEnabled: 'Serial output (DTR/RTS keying)' }),
};
