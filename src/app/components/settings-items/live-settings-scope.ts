/**
 * Morse Code Studio
 */

import { Injectable, Signal } from '@angular/core';
import { AppSettings, SettingsService } from '../../services/settings.service';
import { SettingsScope, cloneValue, sameValue } from './settings-scope';

/**
 * Scope used by the Settings dialog: reads and writes the running app's
 * settings through `SettingsService`, exactly as the cards do today.
 */
@Injectable({ providedIn: 'root' })
export class LiveSettingsScope implements SettingsScope {
  readonly isLive = true;
  readonly value: Signal<AppSettings>;

  /** Snapshot taken when the scope was created */
  private snapshot: AppSettings;

  constructor(private settings: SettingsService) {
    this.value = settings.settings;
    this.snapshot = cloneValue(settings.settings());
  }

  base(): AppSettings {
    return this.snapshot;
  }

  update(patch: Partial<AppSettings>): void {
    this.settings.update(patch);
  }

  changedKeys(): (keyof AppSettings)[] {
    const current = this.settings.settings();
    return (Object.keys(current) as (keyof AppSettings)[])
      .filter(key => !sameValue(current[key], this.snapshot[key]));
  }

  revert(keys: readonly (keyof AppSettings)[]): void {
    const patch: Record<string, unknown> = {};
    for (const key of keys) patch[key] = cloneValue(this.snapshot[key]);
    this.settings.update(patch as Partial<AppSettings>);
  }
}
