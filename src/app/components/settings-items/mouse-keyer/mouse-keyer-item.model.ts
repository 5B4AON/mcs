/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';
import type { AppSettings } from '../../../services/settings.service';

/** Mouse button action mapping */
export const MOUSE_BUTTON_ACTIONS = ['straightKey', 'dit', 'dah', 'none'] as const;
export type MouseButtonAction = typeof MOUSE_BUTTON_ACTIONS[number];

/** The settings the Mouse Keyer item owns. */
export interface MouseKeyerSettings {
  mouseKeyerEnabled: boolean;
  /** Decoder source: which calibration pool mouse keyer feeds ('rx' or 'tx') */
  mouseKeyerSource: DecoderSource;
  mouseLeftAction: MouseButtonAction;
  mouseMiddleAction: MouseButtonAction;
  mouseRightAction: MouseButtonAction;
  mouseReversePaddles: boolean;
  mousePaddleMode: PaddleMode;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  mouseKeyerName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  mouseKeyerColor: string;
}

export const MOUSE_KEYER_DEFAULTS: MouseKeyerSettings = {
  mouseKeyerEnabled: false,
  mouseKeyerSource: 'tx',
  mouseLeftAction: 'straightKey',
  mouseMiddleAction: 'none',
  mouseRightAction: 'none',
  mouseReversePaddles: false,
  mousePaddleMode: 'iambic-b',
  mouseKeyerName: '',
  mouseKeyerColor: '',
};

export const MOUSE_KEYER_FIELD_RULES: SettingsFieldRules = {
  enums: {
    mouseKeyerSource: DECODER_SOURCES,
    mouseLeftAction: MOUSE_BUTTON_ACTIONS,
    mouseMiddleAction: MOUSE_BUTTON_ACTIONS,
    mouseRightAction: MOUSE_BUTTON_ACTIONS,
    mousePaddleMode: PADDLE_MODES,
  },
};

const REVIEW_LABELS = {
  mouseKeyerEnabled: 'Mouse keyer',
  mouseKeyerSource: 'Mouse keyer source',
  mouseLeftAction: 'Left button',
  mouseMiddleAction: 'Middle button',
  mouseRightAction: 'Right button',
  mouseReversePaddles: 'Reverse paddles',
  mousePaddleMode: 'Paddle mode',
  mouseKeyerName: 'Name',
  mouseKeyerColor: 'Colour',
};

function buttonProblems(v: AppSettings): string[] {
  const a = [v.mouseLeftAction, v.mouseMiddleAction, v.mouseRightAction].filter(x => x !== 'none');
  return new Set(a).size !== a.length
    ? ['Each mouse action should be assigned to only one button.']
    : [];
}

/** What the mouse-keyer item edits and says in a review. */
export const MOUSE_KEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'mouse-keyer',
  keys: ['mouseKeyerEnabled', 'mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction', 'mouseRightAction', 'mouseReversePaddles', 'mousePaddleMode', 'mouseKeyerName', 'mouseKeyerColor'],
  validate: buttonProblems,
  review: labelledReview(REVIEW_LABELS),
};

/** The buttons on their own wizard step. */
export const MOUSE_KEYER_BUTTONS_DESCRIPTOR = partDescriptor('mouse-keyer-buttons', ['mouseKeyerSource', 'mouseLeftAction', 'mouseMiddleAction', 'mouseRightAction'], REVIEW_LABELS, buttonProblems);

/** The paddle options on their own wizard step. */
export const MOUSE_KEYER_PADDLE_DESCRIPTOR = partDescriptor('mouse-keyer-paddle', ['mouseReversePaddles', 'mousePaddleMode'], REVIEW_LABELS);

/** The name and colour on their own wizard step. */
export const MOUSE_KEYER_IDENTITY_DESCRIPTOR = partDescriptor('mouse-keyer-identity', ['mouseKeyerName', 'mouseKeyerColor'], REVIEW_LABELS);
