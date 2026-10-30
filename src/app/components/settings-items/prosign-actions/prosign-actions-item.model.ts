/**
 * Morse Code Studio
 */

import { SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, ItemReviewLine, labelledReview } from '../item-descriptor';

/** Action to perform when a prosign is decoded */
export const PROSIGN_ACTION_VALUES = ['newLine', 'newParagraph', 'clearLastWord', 'clearLine', 'clearScreen'] as const;
export type ProsignAction = typeof PROSIGN_ACTION_VALUES[number];

/** Configuration for a single prosign action mapping */
export interface ProsignActionEntry {
  enabled: boolean;
  action: ProsignAction;
}

/** The settings the Prosign Actions item owns. */
export interface ProsignActionsSettings {
  /** Master toggle for prosign action handling */
  prosignActionsEnabled: boolean;
  /** Per-prosign action mappings */
  prosignActions: Record<string, ProsignActionEntry>;
}

export const PROSIGN_ACTIONS_DEFAULTS: ProsignActionsSettings = {
  prosignActionsEnabled: true,
  prosignActions: {
    '<AR>': { enabled: true, action: 'clearScreen' },
    '<BK>': { enabled: true, action: 'newParagraph' },
    '<BT>': { enabled: true, action: 'newLine' },
    '<HH>': { enabled: true, action: 'clearLastWord' },
  },
};

export const PROSIGN_ACTIONS_FIELD_RULES: SettingsFieldRules = {
  enums: { 'prosignActions.*.action': PROSIGN_ACTION_VALUES },
};

/** Plain text for one prosign assignment: its action, or Off. */
function describe(entry: ProsignActionEntry | undefined): string {
  return entry?.enabled ? entry.action : 'Off';
}

const enabledReview = labelledReview({ prosignActionsEnabled: 'Prosign actions' });

/** What the Prosign Actions item edits and says in a review. */
export const PROSIGN_ACTIONS_DESCRIPTOR: ItemDescriptor = {
  id: 'prosign-actions',
  keys: ['prosignActionsEnabled', 'prosignActions'],
  validate: () => [],
  // One line per prosign that changed, not the whole table
  review: (base, proposed) => {
    const lines: ItemReviewLine[] = [...enabledReview(base, proposed)];
    const before = base.prosignActions ?? {};
    const after = proposed.prosignActions ?? {};
    for (const key of Object.keys({ ...before, ...after })) {
      if (describe(before[key]) !== describe(after[key])) {
        lines.push({ key: 'prosignActions', label: `Prosign ${key}`, before: describe(before[key]), after: describe(after[key]) });
      }
    }
    return lines;
  },
};
