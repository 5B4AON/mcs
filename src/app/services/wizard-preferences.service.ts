/**
 * Morse Code Studio
 */

import { Injectable } from '@angular/core';

const STORAGE_KEY = 'mcsWizardPreferences';

/**
 * Answers the setup guides remember between visits, other than the level
 * (see `WizardLevelService`): questions flagged `preference` in a flow, such as
 * the Teach guide's audience. Kept in their own small `localStorage` key: they
 * are not settings, so they are never part of the saved profile, presets,
 * snapshots or exported settings files.
 */
@Injectable({ providedIn: 'root' })
export class WizardPreferencesService {
  private values: Record<string, unknown> = this.load();

  /** Everything remembered so far, by question id. */
  all(): Record<string, unknown> {
    return { ...this.values };
  }

  /** Remember an answer for the next guide. */
  set(id: string, value: unknown): void {
    this.values = { ...this.values, [id]: value };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Storage can be unavailable (private mode); the answer still holds for this session
    }
  }

  private load(): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}
