/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';

/**
 * Settings card — Keyboard Keyer.
 *
 * Maps keyboard keys to straight key and paddle inputs. Supports
 * straight key, left/right paddles, reverse paddles toggle, and
 * paddle mode selection (iambic A/B, ultimatic, single lever).
 */
@Component({
  selector: 'app-keyboard-keyer-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './keyboard-keyer-card.component.html',
  styles: [':host { display: contents; }'],
})
export class KeyboardKeyerCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

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

  /** Capture a keyboard key press and store its code in the specified setting */
  onCaptureKeyDown(event: KeyboardEvent, settingKey: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.settings.update({ [settingKey]: event.code } as Partial<AppSettings>);
    (event.target as HTMLElement).blur();
  }
}
