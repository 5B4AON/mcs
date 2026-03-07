/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { SerialKeyOutputService } from '../../../../services/serial-key-output.service';

/**
 * Settings card — Serial Output (DTR/RTS keying via USB-serial adapter).
 *
 * Configures serial port keying for radio transmitters via Web Serial API.
 * Includes port selection, pin choice (DTR/RTS), invert toggle, and
 * connectivity status.
 */
@Component({
  selector: 'app-serial-output-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './serial-output-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialOutputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android (serial API exists but USB-serial typically fails) */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  constructor(
    public settings: SettingsService,
    public serialOutput: SerialKeyOutputService,
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

  /** Handle serial port selection — closes current port and opens selected */
  async onSerialPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ serialPortIndex: idx });
    await this.serialOutput.close();
    if (idx >= 0) {
      await this.serialOutput.open(idx);
    }
  }

  /** Handle serial output enabled toggle — opens/closes the serial connection */
  async onSerialEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().serialPortIndex;
      if (idx >= 0 && !this.serialOutput.connected()) {
        await this.serialOutput.open(idx);
      }
    } else {
      await this.serialOutput.close();
    }
  }
}
