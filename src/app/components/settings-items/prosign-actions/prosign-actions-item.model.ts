/**
 * Morse Code Studio
 */

import { ProsignActionEntry } from '../../../services/settings.service';
import { ItemDescriptor, ItemReviewLine, labelledReview } from '../item-descriptor';

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
