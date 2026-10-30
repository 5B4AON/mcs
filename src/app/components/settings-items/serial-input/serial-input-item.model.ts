/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, KEY_INPUT_MODES, KeyInputMode, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Serial port input signal name */
export const SERIAL_INPUT_PINS = ['dsr', 'cts', 'dcd', 'ri'] as const;
export type SerialInputPin = typeof SERIAL_INPUT_PINS[number];

/** Configuration for a single serial input mapping */
export interface SerialInputMapping {
  enabled: boolean;
  /** Mode: straight key or paddle */
  mode: KeyInputMode;
  /** Which input signal pin to use for straight key, or dit paddle */
  pin: SerialInputPin;
  /** Which input signal pin to use for dah paddle (only used when mode is 'paddle') */
  dahPin: SerialInputPin;
  /** Invert the signal (active-low instead of active-high) */
  invert: boolean;
  /** Decoder source: which calibration pool this input feeds ('rx' or 'tx') */
  source: DecoderSource;
  /** Reverse paddles (only used when mode is 'paddle') */
  reversePaddles: boolean;
  /** Paddle mode for this mapping (only used when mode is 'paddle') */
  paddleMode: PaddleMode;
  /** Serial port index (-1 = not assigned) */
  portIndex: number;
  /** Polling interval in ms (5–50) */
  pollInterval: number;
  /** Debounce duration in ms (2–10) */
  debounceMs: number;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  name: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  color: string;
}

/** The settings the Serial Input (read DSR/CTS/DCD/RI signals as keying source) item owns. */
export interface SerialInputSettings {
  serialInputEnabled: boolean;
  /** Ordered list of serial input mappings (straight key / paddle entries) */
  serialInputMappings: SerialInputMapping[];
}

export const SERIAL_INPUT_DEFAULTS: SerialInputSettings = {
  serialInputEnabled: false,
  serialInputMappings: [
    {
      enabled: true,
      mode: 'straightKey',
      pin: 'dsr',
      dahPin: 'cts',
      invert: false,
      source: 'rx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      portIndex: -1,
      pollInterval: 10,
      debounceMs: 5,
      name: '',
      color: '',
    },
    {
      enabled: true,
      mode: 'paddle',
      pin: 'cts',
      dahPin: 'dcd',
      invert: false,
      source: 'rx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      portIndex: -1,
      pollInterval: 10,
      debounceMs: 5,
      name: '',
      color: '',
    },
  ],
};

export const SERIAL_INPUT_FIELD_RULES: SettingsFieldRules = {
  enums: {
    'serialInputMappings[].mode': KEY_INPUT_MODES,
    'serialInputMappings[].pin': SERIAL_INPUT_PINS,
    'serialInputMappings[].dahPin': SERIAL_INPUT_PINS,
    'serialInputMappings[].source': DECODER_SOURCES,
    'serialInputMappings[].paddleMode': PADDLE_MODES,
  },
  integers: [
    'serialInputMappings[].portIndex',
    'serialInputMappings[].pollInterval',
    'serialInputMappings[].debounceMs',
  ],
};

/** What the Serial Input item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const SERIAL_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'serial-input',
  keys: ['serialInputEnabled'],
  validate: () => [],
  review: labelledReview({ serialInputEnabled: 'Serial key/paddle input' }),
};
