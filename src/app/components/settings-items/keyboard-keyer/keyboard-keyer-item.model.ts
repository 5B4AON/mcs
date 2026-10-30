/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, isTouchDevice, KEY_INPUT_MODES, KeyInputMode, PADDLE_MODES, PaddleMode,
  SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Configuration for a single keyboard key input mapping */
export interface KeyboardInputMapping {
  enabled: boolean;
  /** Mode: straight key or paddle */
  mode: KeyInputMode;
  /** KeyboardEvent.code for straight key, or dit paddle */
  keyCode: string;
  /** KeyboardEvent.code for dah paddle (only used when mode is 'paddle', '' if unused) */
  dahKeyCode: string;
  /** Decoder source: which calibration pool this input feeds ('rx' or 'tx') */
  source: DecoderSource;
  /** Reverse paddles (only used when mode is 'paddle') */
  reversePaddles: boolean;
  /** Paddle mode for this mapping (only used when mode is 'paddle') */
  paddleMode: PaddleMode;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  name: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  color: string;
}

/** The settings the Keyboard Keyer item owns. */
export interface KeyboardKeyerSettings {
  /** Enable/disable keyboard keyer input */
  keyboardKeyerEnabled: boolean;
  /** Ordered list of keyboard key input mappings (straight key / paddle entries) */
  keyboardInputMappings: KeyboardInputMapping[];
}

export const KEYBOARD_KEYER_DEFAULTS: KeyboardKeyerSettings = {
  keyboardKeyerEnabled: !isTouchDevice(),
  keyboardInputMappings: [
    {
      enabled: true,
      mode: 'straightKey',
      keyCode: 'Space',
      dahKeyCode: '',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    },
    {
      enabled: true,
      mode: 'paddle',
      keyCode: 'BracketLeft',
      dahKeyCode: 'BracketRight',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    },
  ],
};

export const KEYBOARD_KEYER_FIELD_RULES: SettingsFieldRules = {
  enums: {
    'keyboardInputMappings[].mode': KEY_INPUT_MODES,
    'keyboardInputMappings[].source': DECODER_SOURCES,
    'keyboardInputMappings[].paddleMode': PADDLE_MODES,
  },
};

/** What the Keyboard Keyer item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const KEYBOARD_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'keyboard-keyer',
  keys: ['keyboardKeyerEnabled'],
  validate: () => [],
  review: labelledReview({ keyboardKeyerEnabled: 'Keyboard keyer' }),
};
