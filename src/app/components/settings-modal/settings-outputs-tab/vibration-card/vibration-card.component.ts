/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';

/**
 * Settings card — Vibration (haptic feedback on Android).
 *
 * Enables and configures haptic vibration feedback during keying events.
 * Includes forward direction selector (RX/TX/Both) and an enhanced
 * timing option to compensate for motor spin-up delay.
 */
@Component({
  selector: 'app-vibration-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './vibration-card.component.html',
  styles: [':host { display: contents; }'],
})
export class VibrationCardComponent {
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
}
