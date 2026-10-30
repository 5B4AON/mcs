/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, isTouchDevice, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Touch keyer operating mode */
export const TOUCH_KEYER_MODES = ['straight', 'paddle'] as const;
export type TouchKeyerMode = typeof TOUCH_KEYER_MODES[number];

/** Paddle element */
export const PADDLE_ELEMENTS = ['dit', 'dah'] as const;
export type PaddleElement = typeof PADDLE_ELEMENTS[number];

/** The settings the Touch Keyer item owns. */
export interface TouchKeyerSettings {
  touchKeyerEnabled: boolean;
  /** Decoder source: which calibration pool touch keyer feeds ('rx' or 'tx') */
  touchKeyerSource: DecoderSource;
  touchKeyerMode: TouchKeyerMode;
  touchLeftPaddle: PaddleElement;
  touchRightPaddle: PaddleElement;
  touchReversePaddles: boolean;
  touchPaddleMode: PaddleMode;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  touchKeyerName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  touchKeyerColor: string;
}

export const TOUCH_KEYER_DEFAULTS: TouchKeyerSettings = {
  touchKeyerEnabled: isTouchDevice(),
  touchKeyerSource: 'tx',
  touchKeyerMode: 'straight',
  touchLeftPaddle: 'dit',
  touchRightPaddle: 'dah',
  touchReversePaddles: false,
  touchPaddleMode: 'iambic-b',
  touchKeyerName: '',
  touchKeyerColor: '',
};

export const TOUCH_KEYER_FIELD_RULES: SettingsFieldRules = {
  enums: {
    touchKeyerSource: DECODER_SOURCES,
    touchKeyerMode: TOUCH_KEYER_MODES,
    touchLeftPaddle: PADDLE_ELEMENTS,
    touchRightPaddle: PADDLE_ELEMENTS,
    touchPaddleMode: PADDLE_MODES,
  },
};

/** What the touch-keyer item edits and says in a review. */
export const TOUCH_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'touch-keyer',
  keys: ['touchKeyerEnabled', 'touchKeyerSource', 'touchKeyerMode', 'touchLeftPaddle', 'touchRightPaddle', 'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor'],
  validate: () => [],
  review: labelledReview({
    touchKeyerEnabled: 'Touch keyer',
    touchKeyerSource: 'Touch keyer source',
    touchKeyerMode: 'Touch mode',
    touchLeftPaddle: 'Left paddle',
    touchRightPaddle: 'Right paddle',
    touchReversePaddles: 'Reverse paddles',
    touchPaddleMode: 'Paddle mode',
    touchKeyerName: 'Name',
    touchKeyerColor: 'Colour',
  }),
};
