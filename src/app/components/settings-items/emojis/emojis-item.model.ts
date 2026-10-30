/**
 * Morse Code Studio
 */

import { SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Configuration for a single emoji replacement mapping */
export interface EmojiMapping {
  enabled: boolean;
  /** Match pattern — a character (e.g. '+'), prosign (e.g. '<AR>'), or sequence (e.g. 'TNX') */
  match: string;
  /** Replacement text — one or more emojis, characters, or any mix */
  emoji: string;
  /** Optional short description of the mapping's meaning */
  meaning?: string;
}

/** The settings the Emojis item owns. */
export interface EmojisSettings {
  /** Master toggle for emoji display in fullscreen modals */
  emojisEnabled: boolean;
  /** Ordered list of emoji replacement mappings */
  emojiMappings: EmojiMapping[];
}

export const EMOJIS_DEFAULTS: EmojisSettings = {
  emojisEnabled: false,
  emojiMappings: [
    // Prosigns
    { enabled: true, match: '<AR>', emoji: '✅', meaning: 'End of message' },
    { enabled: true, match: '<SK>', emoji: '🔚', meaning: 'End of contact' },
    { enabled: true, match: '<SOS>', emoji: '🆘', meaning: 'Distress' },
    // Greetings & farewells
    { enabled: true, match: 'GM', emoji: '🌅', meaning: 'Good morning' },
    { enabled: true, match: 'GA', emoji: '☀️', meaning: 'Good afternoon' },
    { enabled: true, match: 'GE', emoji: '🌆', meaning: 'Good evening' },
    { enabled: true, match: 'GN', emoji: '🌙', meaning: 'Good night' },
    // Common abbreviations
    { enabled: true, match: 'CQ', emoji: '📡', meaning: 'Calling any station' },
    { enabled: true, match: 'R', emoji: '👍', meaning: 'Roger / received' },
    { enabled: true, match: 'K', emoji: '🎤', meaning: 'Go ahead' },
    { enabled: true, match: '<KN>', emoji: '🎤🔒', meaning: 'Go ahead (named only)' },
    { enabled: true, match: '<BK>', emoji: '🔙', meaning: 'Break / back to you' },
    { enabled: true, match: '73', emoji: '👋', meaning: 'Best regards' },
    { enabled: true, match: '88', emoji: '💋', meaning: 'Love and kisses' },
    { enabled: true, match: 'TNX', emoji: '🙏', meaning: 'Thanks' },
    { enabled: true, match: 'TKS', emoji: '🙏', meaning: 'Thanks' },
    { enabled: true, match: 'TU', emoji: '🤝', meaning: 'Thank you' },
    { enabled: true, match: 'FB', emoji: '✨', meaning: 'Fine business' },
    { enabled: true, match: 'GL', emoji: '🍀', meaning: 'Good luck' },
    { enabled: true, match: 'HI', emoji: '😄', meaning: 'Laughter' },
    { enabled: true, match: 'WX', emoji: '⛅', meaning: 'Weather' },
    // Q-codes
    { enabled: true, match: 'QSL', emoji: '✔️', meaning: 'Confirmed' },
    { enabled: true, match: 'QTH', emoji: '📍', meaning: 'Location' },
    { enabled: true, match: 'QRT', emoji: '🔇', meaning: 'Going silent' },
    { enabled: true, match: 'QRX', emoji: '⏳', meaning: 'Standby' },
    { enabled: true, match: 'QRS', emoji: '🐢', meaning: 'Send slower' },
    { enabled: true, match: 'QRQ', emoji: '🐇', meaning: 'Send faster' },
  ],
};

export const EMOJIS_FIELD_RULES: SettingsFieldRules = {
  optional: ['emojiMappings[].meaning'],
};

/** What the Emojis item edits and says in a review. */
export const EMOJIS_DESCRIPTOR: ItemDescriptor = {
  id: 'emojis',
  keys: ['emojisEnabled', 'emojiMappings'],
  validate: () => [],
  review: labelledReview({
    emojisEnabled: 'Emojis',
    emojiMappings: 'Emoji mappings',
  }, (key, value) => key === 'emojiMappings'
    ? `${(value as EmojiMapping[]).filter(m => m.enabled).length} active of ${(value as EmojiMapping[]).length}`
    : typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value)),
};
