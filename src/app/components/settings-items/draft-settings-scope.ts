/**
 * Morse Code Studio
 */

import { Signal, signal } from '@angular/core';
import { AppSettings, SettingsService } from '../../services/settings.service';
import { SettingsScope, cloneValue, sameValue } from './settings-scope';

/**
 * Scope used by a wizard: a private copy of the settings.
 *
 * Patches change only the copy. The running app is untouched until the wizard
 * reads `proposed()` and applies the reviewed keys itself. Create one per
 * wizard instance and provide it through `SETTINGS_SCOPE`.
 */
export class DraftSettingsScope implements SettingsScope {
  private baseSettings: AppSettings;
  private readonly draft;

  readonly isLive = false;

  /** Read-only view of the draft */
  readonly value: Signal<AppSettings>;

  constructor(settings: SettingsService) {
    this.baseSettings = cloneValue(settings.settings());
    this.draft = signal<AppSettings>(cloneValue(this.baseSettings));
    this.value = this.draft.asReadonly();
  }

  base(): AppSettings {
    return this.baseSettings;
  }

  update(patch: Partial<AppSettings>): void {
    const clonedPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) clonedPatch[key] = cloneValue(value);
    this.draft.set({ ...this.draft(), ...clonedPatch });
  }

  changedKeys(): (keyof AppSettings)[] {
    const current = this.draft();
    return (Object.keys(current) as (keyof AppSettings)[])
      .filter(key => !sameValue(current[key], this.baseSettings[key]));
  }

  revert(keys: readonly (keyof AppSettings)[]): void {
    const patch: Record<string, unknown> = {};
    for (const key of keys) patch[key] = this.baseSettings[key];
    this.update(patch as Partial<AppSettings>);
  }

  /** Only the changed keys with their draft values: what Apply would write. */
  proposed(): Partial<AppSettings> {
    const current = this.draft();
    const patch: Record<string, unknown> = {};
    for (const key of this.changedKeys()) patch[key] = cloneValue(current[key]);
    return patch as Partial<AppSettings>;
  }

  /** Replace the draft (for example from a validated preset) without touching live settings. */
  seed(settings: AppSettings): void {
    this.draft.set(cloneValue(settings));
  }
}
