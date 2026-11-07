/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';
import { WizardLevel } from '../components/wizard-v2/engine/flow-types';
import { isWizardLevel } from '../components/wizard-v2/engine/levels';

const STORAGE_KEY = 'mcsWizardLevel';

/**
 * The level (Novice, Intermediate, Expert) the user last chose on the first step
 * of a setup guide. One value for every guide, kept in its own small
 * `localStorage` key: it is not a setting, so it is never part of the saved
 * profile, presets, snapshots or exported settings files.
 */
@Injectable({ providedIn: 'root' })
export class WizardLevelService {
  /** The remembered level; Novice until the user chooses another */
  readonly level = signal<WizardLevel>(this.load());

  /** Remember a level for the next guide. */
  set(level: WizardLevel): void {
    this.level.set(level);
    try {
      localStorage.setItem(STORAGE_KEY, level);
    } catch {
      // Storage can be unavailable (private mode); the level still holds for this session
    }
  }

  private load(): WizardLevel {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isWizardLevel(stored) ? stored : 'novice';
    } catch {
      return 'novice';
    }
  }
}
