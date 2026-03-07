/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { AudioDeviceService } from '../../../../services/audio-device.service';
import { AudioOutputService } from '../../../../services/audio-output.service';

/**
 * Settings card — Sidetone (audio feedback tone during keying).
 *
 * Configures the audible CW sidetone output with device/channel selection,
 * frequency, amplitude, and a test button.
 */
@Component({
  selector: 'app-sidetone-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidetone-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SidetoneCardComponent {
  /** Whether audio contexts are running (controls test button) */
  @Input() audioRunning = false;

  /** Whether this card's body is expanded */
  expanded = false;

  constructor(
    public settings: SettingsService,
    public devices: AudioDeviceService,
    public audioOutput: AudioOutputService,
  ) {}

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
