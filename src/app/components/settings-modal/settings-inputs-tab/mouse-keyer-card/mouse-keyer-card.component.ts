/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings, MouseButtonAction } from '../../../../services/settings.service';

/**
 * Settings card — Mouse Keyer.
 *
 * Maps mouse buttons (left, middle, right) to straight key or paddle
 * actions. Includes conflict detection for duplicate button assignments,
 * reverse paddles, and paddle mode selection.
 */
@Component({
  selector: 'app-mouse-keyer-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mouse-keyer-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MouseKeyerCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Conflict: multiple mouse buttons mapped to the same non-none action */
  readonly mouseActionConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    const actions: MouseButtonAction[] = [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction];
    const nonNone = actions.filter(a => a !== 'none');
    const unique = new Set(nonNone);
    if (nonNone.length !== unique.size) {
      return 'Multiple mouse buttons are mapped to the same action. Each action should be assigned to only one button.';
    }
    return null;
  });

  constructor(public settings: SettingsService) {}

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked } as Partial<AppSettings>);
  }

  /** Handle mouse button action dropdown changes */
  onMouseActionChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }
}
