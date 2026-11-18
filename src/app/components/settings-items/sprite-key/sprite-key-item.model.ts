/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, PADDLE_MODES, PaddleMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';
import { TOUCH_KEYER_MODES, TouchKeyerMode } from '../touch-keyer/touch-keyer-item.model';

/** The settings the Main Screen Touch Keyer item (the sprite on the main screen) owns. */
export interface SpriteKeySettings {
  /** Show the touch keyer sprite (straight key or paddle) on the main screen */
  spriteButtonEnabled: boolean;
  /** One straight-key sprite or a two-paddle sprite */
  spriteKeyerMode: TouchKeyerMode;
  /** Paddle sprite: the left paddle sends dashes and the right one dots */
  spriteReversePaddles: boolean;
  /** Paddle sprite: how the keyer treats both paddles held down */
  spritePaddleMode: PaddleMode;
  /** Decoder source: which pool sprite keying feeds ('rx' or 'tx') */
  spriteSource: DecoderSource;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  spriteName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  spriteColor: string;
  /** Animate the sprite when the keyboard straight key (straight mode) or a keyboard paddle (paddle mode) is pressed */
  spriteAnimateKeyboard: boolean;
  /** Animate the sprite when keyboard encoder is sending elements (the paddle sprite shows each dot or dash) */
  spriteAnimateEncoder: boolean;
  /** Animate the sprite when the mouse straight key or a mouse paddle is pressed */
  spriteAnimateMouse: boolean;
  /** Animate the sprite when a MIDI straight key or paddle is pressed */
  spriteAnimateMidi: boolean;
  /** Animate the sprite when a serial straight key or paddle is pressed */
  spriteAnimateSerial: boolean;
  /** Animate the straight-key sprite when the straight key via mic is pressed (no paddle equivalent) */
  spriteAnimateMic: boolean;
}

export const SPRITE_KEY_DEFAULTS: SpriteKeySettings = {
  spriteButtonEnabled: true,
  spriteKeyerMode: 'straight',
  spriteReversePaddles: false,
  spritePaddleMode: 'iambic-b',
  spriteSource: 'tx',
  spriteName: '',
  spriteColor: '',
  spriteAnimateKeyboard: false,
  spriteAnimateEncoder: false,
  spriteAnimateMouse: false,
  spriteAnimateMidi: false,
  spriteAnimateSerial: false,
  spriteAnimateMic: false,
};

export const SPRITE_KEY_FIELD_RULES: SettingsFieldRules = {
  enums: { spriteSource: DECODER_SOURCES, spriteKeyerMode: TOUCH_KEYER_MODES, spritePaddleMode: PADDLE_MODES },
};

const REVIEW_LABELS = {
  spriteButtonEnabled: 'Main screen touch keyer',
  spriteKeyerMode: 'Main screen touch mode',
  spriteReversePaddles: 'Main screen reverse paddles',
  spritePaddleMode: 'Main screen paddle mode',
  spriteSource: 'Main screen touch keyer source',
  spriteName: 'Main screen touch keyer name',
  spriteColor: 'Main screen touch keyer colour',
  spriteAnimateKeyboard: 'Main screen touch keyer animates on keyboard',
  spriteAnimateEncoder: 'Main screen touch keyer animates on encoder',
  spriteAnimateMouse: 'Main screen touch keyer animates on mouse',
  spriteAnimateMidi: 'Main screen touch keyer animates on MIDI',
  spriteAnimateSerial: 'Main screen touch keyer animates on serial',
  spriteAnimateMic: 'Main screen touch keyer animates on microphone',
};

/** What the main-screen touch keyer item edits and says in a review. */
export const SPRITE_KEY_DESCRIPTOR: ItemDescriptor = {
  id: 'sprite-key',
  keys: ['spriteButtonEnabled', 'spriteKeyerMode', 'spriteReversePaddles', 'spritePaddleMode', 'spriteSource', 'spriteName', 'spriteColor', 'spriteAnimateKeyboard', 'spriteAnimateEncoder', 'spriteAnimateMouse', 'spriteAnimateMidi', 'spriteAnimateSerial', 'spriteAnimateMic'],
  validate: () => [],
  review: labelledReview(REVIEW_LABELS),
};

/** Straight key or paddle on its own wizard step. */
export const SPRITE_KEY_MODE_DESCRIPTOR = partDescriptor('sprite-key-mode', ['spriteSource', 'spriteKeyerMode'], REVIEW_LABELS);

/** The paddle options on their own wizard step. */
export const SPRITE_KEY_PADDLE_DESCRIPTOR = partDescriptor('sprite-key-paddle', ['spriteReversePaddles', 'spritePaddleMode'], REVIEW_LABELS);

/** The name and colour on their own wizard step. */
export const SPRITE_KEY_IDENTITY_DESCRIPTOR = partDescriptor('sprite-key-identity', ['spriteName', 'spriteColor'], REVIEW_LABELS);

/** Which other inputs also move the sprite, on their own wizard step. */
export const SPRITE_KEY_ANIMATE_DESCRIPTOR = partDescriptor('sprite-key-animate', ['spriteAnimateKeyboard', 'spriteAnimateEncoder', 'spriteAnimateMouse', 'spriteAnimateMidi', 'spriteAnimateSerial', 'spriteAnimateMic'], REVIEW_LABELS);
