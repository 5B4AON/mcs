/**
 * Morse Code Studio
 */

import { EmojiMapping } from '../../../services/settings.service';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

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
