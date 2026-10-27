/**
 * Morse Code Studio
 */

/*
 * Settings item conventions
 * -------------------------
 * A settings item is one standalone component that edits one settings card or
 * one mapping. The Settings dialog and the setup wizards use the same item.
 *
 *  - Folder `settings-items/<name>/` holds `<name>-item.component.ts/html` and
 *    `<name>-item.model.ts`.
 *  - The component wraps its content in `<app-item-shell>` (card look in
 *    Settings, flat in a wizard step) and reads/writes ONLY through the
 *    injected `SETTINGS_SCOPE`. It never calls `SettingsService.update()`.
 *  - The model file exports an `ItemDescriptor`: which settings the item edits,
 *    how to validate them and how to describe a change in plain language.
 *  - Device actions (test tone, detect, request port) are explicit buttons and
 *    only work when `scope.isLive` is true.
 *  - Register the item in `item-registry.ts` so flows can refer to it by id.
 */

import { AppSettings } from '../../services/settings.service';

/** One plain-language line of a review: what changes and how. */
export interface ItemReviewLine {
  key: keyof AppSettings;
  label: string;
  before: string;
  after: string;
}

/** Everything the wizard engine needs to know about an item, without rendering it. */
export interface ItemDescriptor {
  /** Registry id, also used by flows */
  id: string;
  /** Settings this item edits; Revert and change detection work on exactly these */
  keys: readonly (keyof AppSettings)[];
  /** True when enabling it opens an external output or relay and needs acknowledgement */
  isRoute?: boolean;
  /** Problems that block moving on; empty when the values are fine */
  validate(settings: AppSettings): string[];
  /** Plain-language lines for the keys that differ between base and proposed */
  review(base: AppSettings, proposed: AppSettings): ItemReviewLine[];
}

/** Build a `review()` from a label table: one line per labelled key that changed. */
export function labelledReview(
  labels: Partial<Record<keyof AppSettings, string>>,
  format: (key: keyof AppSettings, value: unknown) => string = defaultFormat,
): ItemDescriptor['review'] {
  return (base, proposed) =>
    (Object.keys(labels) as (keyof AppSettings)[])
      .filter(key => JSON.stringify(base[key]) !== JSON.stringify(proposed[key]))
      .map(key => ({
        key,
        label: labels[key] as string,
        before: format(key, base[key]),
        after: format(key, proposed[key]),
      }));
}

/** Booleans read as On/Off, empty values as "none", everything else as text. */
function defaultFormat(_key: keyof AppSettings, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value === '' || value === undefined || value === null) return 'none';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'object') return Object.entries(value as Record<string, { enabled?: boolean; action?: string }>)
    .map(([k, v]) => `${k}: ${v.enabled ? v.action : 'off'}`).join(', ');
  return String(value);
}
