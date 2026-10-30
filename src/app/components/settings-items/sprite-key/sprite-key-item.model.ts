/**
 * Morse Code Studio
 */

import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Sprite Key Button item owns. */
export interface SpriteKeySettings {
  /** Show the straight-key sprite button on the main screen */
  spriteButtonEnabled: boolean;
  /** Decoder source: which pool sprite keying feeds ('rx' or 'tx') */
  spriteSource: DecoderSource;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  spriteName: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  spriteColor: string;
  /** Animate the sprite when keyboard straight key is pressed */
  spriteAnimateKeyboard: boolean;
  /** Animate the sprite when keyboard encoder is sending elements */
  spriteAnimateEncoder: boolean;
  /** Animate the sprite when mouse straight key is pressed */
  spriteAnimateMouse: boolean;
  /** Animate the sprite when MIDI straight key is pressed */
  spriteAnimateMidi: boolean;
  /** Animate the sprite when serial straight key is pressed */
  spriteAnimateSerial: boolean;
  /** Animate the sprite when straight key via mic is pressed */
  spriteAnimateMic: boolean;
}

export const SPRITE_KEY_DEFAULTS: SpriteKeySettings = {
  spriteButtonEnabled: true,
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
  enums: { spriteSource: DECODER_SOURCES },
};

/** What the sprite-key item edits and says in a review. */
export const SPRITE_KEY_DESCRIPTOR: ItemDescriptor = {
  id: 'sprite-key',
  keys: ['spriteButtonEnabled', 'spriteSource', 'spriteName', 'spriteColor', 'spriteAnimateKeyboard', 'spriteAnimateEncoder', 'spriteAnimateMouse', 'spriteAnimateMidi', 'spriteAnimateSerial', 'spriteAnimateMic'],
  validate: () => [],
  review: labelledReview({
    spriteButtonEnabled: 'Sprite key',
    spriteSource: 'Sprite source',
    spriteName: 'Name',
    spriteColor: 'Colour',
    spriteAnimateKeyboard: 'Animate on keyboard',
    spriteAnimateEncoder: 'Animate on encoder',
    spriteAnimateMouse: 'Animate on mouse',
    spriteAnimateMidi: 'Animate on MIDI',
    spriteAnimateSerial: 'Animate on serial',
    spriteAnimateMic: 'Animate on microphone',
  }),
};
