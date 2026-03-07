/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { WinkeyerOutputService } from '../../../../services/winkeyer-output.service';

/**
 * Settings card — WinKeyer Output (K1EL WinKeyer protocol via serial).
 *
 * Forwards decoded text to a WinKeyer device for re-keying with clean
 * timing. Includes serial port selection, WPM speed control, firmware
 * version display, and test/clear buffer buttons.
 */
@Component({
  selector: 'app-winkeyer-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './winkeyer-card.component.html',
  styles: [':host { display: contents; }'],
})
export class WinkeyerCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  constructor(
    public settings: SettingsService,
    public winkeyerOutput: WinkeyerOutputService,
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

  /** Handle WinKeyer port selection — closes current and opens selected */
  async onWinkeyerPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ winkeyerPortIndex: idx });
    await this.winkeyerOutput.close();
    if (idx >= 0) {
      await this.winkeyerOutput.open(idx);
    }
  }

  /** Handle WinKeyer enabled toggle — opens/closes the WinKeyer connection */
  async onWinkeyerEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ winkeyerEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().winkeyerPortIndex;
      if (idx >= 0 && !this.winkeyerOutput.connected()) {
        await this.winkeyerOutput.open(idx);
      }
    } else {
      await this.winkeyerOutput.close();
    }
  }

  /** Handle WinKeyer WPM speed change — updates setting and sends to device */
  async onWinkeyerWpmChange(event: Event): Promise<void> {
    const wpm = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(wpm)) return;
    this.settings.update({ winkeyerWpm: wpm });
    if (this.winkeyerOutput.connected()) {
      await this.winkeyerOutput.setSpeed(wpm);
    }
  }
}
