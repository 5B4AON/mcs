/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, isTouchDevice, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';

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

const REVIEW_LABELS = {
  touchKeyerEnabled: 'Fullscreen touch keyer',
  touchKeyerSource: 'Fullscreen touch keyer source',
  touchKeyerMode: 'Fullscreen touch mode',
  touchLeftPaddle: 'Left paddle',
  touchRightPaddle: 'Right paddle',
  touchReversePaddles: 'Reverse paddles',
  touchPaddleMode: 'Paddle mode',
  touchKeyerName: 'Name',
  touchKeyerColor: 'Colour',
};

/** What the touch-keyer item edits and says in a review. */
export const TOUCH_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'touch-keyer',
  keys: ['touchKeyerEnabled', 'touchKeyerSource', 'touchKeyerMode', 'touchLeftPaddle', 'touchRightPaddle', 'touchReversePaddles', 'touchPaddleMode', 'touchKeyerName', 'touchKeyerColor'],
  validate: () => [],
  review: labelledReview(REVIEW_LABELS),
};

/** Straight key or paddle on its own wizard step. */
export const TOUCH_KEYER_MODE_DESCRIPTOR = partDescriptor('touch-keyer-mode', ['touchKeyerSource', 'touchKeyerMode'], REVIEW_LABELS);

/** The paddle options on their own wizard step. */
export const TOUCH_KEYER_PADDLE_DESCRIPTOR = partDescriptor('touch-keyer-paddle', ['touchReversePaddles', 'touchPaddleMode'], REVIEW_LABELS);

/** The name and colour on their own wizard step. */
export const TOUCH_KEYER_IDENTITY_DESCRIPTOR = partDescriptor('touch-keyer-identity', ['touchKeyerName', 'touchKeyerColor'], REVIEW_LABELS);
