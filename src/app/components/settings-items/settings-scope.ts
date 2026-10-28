/**
 * Morse Code Studio
 */

import { InjectionToken, Signal } from '@angular/core';
import { AppSettings } from '../../services/settings.service';

/**
 * Where a settings item reads and writes its values.
 *
 * The Settings dialog provides the live scope (changes apply immediately).
 * A wizard provides a draft scope (changes stay temporary until the user
 * applies them on the review step). Items depend only on this interface, so
 * the same component works unchanged in both places.
 */
export interface SettingsScope {
  /** Current values, including any pending changes in a draft */
  readonly value: Signal<AppSettings>;

  /** True when changes apply to the running app now (device actions such as Test make sense) */
  readonly isLive: boolean;

  /** Values as they were when the scope was opened; the reference for change detection */
  base(): AppSettings;

  /** Apply a partial change to this scope */
  update(patch: Partial<AppSettings>): void;

  /** Keys whose current value differs from the base */
  changedKeys(): (keyof AppSettings)[];

  /** Put the given keys back to their base values */
  revert(keys: readonly (keyof AppSettings)[]): void;
}

/** Injection token items use to reach their settings scope. */
export const SETTINGS_SCOPE = new InjectionToken<SettingsScope>('SETTINGS_SCOPE');

/** Structural comparison used for change detection; settings are plain JSON values. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Clone arrays and objects so mappings are never shared between scopes. */
export function cloneValue<T>(value: T): T {
  return value !== null && typeof value === 'object' ? structuredClone(value) : value;
}
