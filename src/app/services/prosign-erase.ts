/**
 * Morse Code Studio
 */

import { ProsignActionEntry } from '../components/settings-items/prosign-actions/prosign-actions-item.model';

/** The prosign actions that remove decoded text, in the words used by the warnings */
const ERASING_ACTIONS: Record<string, string> = {
  clearLastWord: 'erases the last word',
  clearLine: 'erases the line',
  clearScreen: 'erases all the text',
};

/** The part of the settings that decides whether a prosign erases text */
export interface ProsignActionSettings {
  prosignActionsEnabled: boolean;
  prosignActions: Record<string, ProsignActionEntry>;
}

/**
 * The enabled prosign actions that erase decoded text, one phrase each (for example
 * "<BK> erases the last word"). Empty when prosign actions are off or none erases.
 */
export function erasingProsigns(s: ProsignActionSettings): string[] {
  if (!s.prosignActionsEnabled) return [];
  return Object.entries(s.prosignActions)
    .filter(([, entry]) => entry.enabled && ERASING_ACTIONS[entry.action])
    .map(([prosign, entry]) => `${prosign} ${ERASING_ACTIONS[entry.action]}`);
}

/** The erasing actions that `after` has and `before` did not (a change made them erase, or erase more) */
export function newErasingProsigns(before: ProsignActionSettings, after: ProsignActionSettings): string[] {
  const known = new Set(erasingProsigns(before));
  return erasingProsigns(after).filter(phrase => !known.has(phrase));
}

/** Joins the phrases as a sentence part: "a", "a and b", "a, b and c" */
export function joinPhrases(phrases: string[]): string {
  return phrases.length < 2 ? phrases.join('') : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}
