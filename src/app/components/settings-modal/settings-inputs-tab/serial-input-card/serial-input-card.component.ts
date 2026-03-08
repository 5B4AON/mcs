/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings, SerialInputPin } from '../../../../services/settings.service';
import { SerialKeyInputService } from '../../../../services/serial-key-input.service';

/** Human-readable labels for serial input pins */
const PIN_LABELS: Record<SerialInputPin, string> = {
  dsr: 'DSR (Data Set Ready)',
  cts: 'CTS (Clear To Send)',
  dcd: 'DCD (Data Carrier Detect)',
  ri:  'RI (Ring Indicator)',
};

/**
 * Settings card — Serial Input.
 *
 * Reads serial port input signals (DSR, CTS, DCD, RI) as key/paddle
 * inputs for Morse code decoding. Supports straight key and paddle
 * modes with independent pin assignments. Can share the serial port
 * with Serial Output when the same port is selected.
 */
@Component({
  selector: 'app-serial-input-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './serial-input-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialInputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  /** Pin options for select dropdowns */
  readonly pinOptions: { value: SerialInputPin; label: string }[] = [
    { value: 'dsr', label: PIN_LABELS.dsr },
    { value: 'cts', label: PIN_LABELS.cts },
    { value: 'dcd', label: PIN_LABELS.dcd },
    { value: 'ri',  label: PIN_LABELS.ri },
  ];

  constructor(
    public settings: SettingsService,
    public serialInput: SerialKeyInputService,
  ) {}

  /** Toggle card expansion; refresh port list when opening */
  toggleExpand(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.refreshAndAutoSelect();
    }
  }

  /**
   * Refresh the port list and auto-select if there is exactly one port
   * and no port is currently selected.
   */
  async refreshAndAutoSelect(): Promise<void> {
    await this.serialInput.refreshPorts();
    if (this.serialInput.ports().length === 1 && this.settings.settings().serialInputPortIndex < 0) {
      this.settings.update({ serialInputPortIndex: 0 });
    }
  }

  /** Prompt user to add a serial port, then auto-select if only one */
  async addPort(): Promise<void> {
    await this.serialInput.requestPort();
    await this.refreshAndAutoSelect();
  }

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

  /** Handle serial input enabled toggle */
  async onSerialInputEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialInputEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().serialInputPortIndex;
      if (idx >= 0 && !this.serialInput.connected()) {
        await this.serialInput.open(idx);
      }
    } else {
      await this.serialInput.close();
    }
  }

  /** Handle serial port selection */
  async onSerialPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ serialInputPortIndex: idx });
    await this.serialInput.close();
    if (idx >= 0) {
      await this.serialInput.open(idx);
    }
  }

  /** Handle poll interval change — clamp to valid range */
  onPollIntervalChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 10;
    val = Math.max(SerialKeyInputService.MIN_POLL_INTERVAL,
      Math.min(SerialKeyInputService.MAX_POLL_INTERVAL, val));
    el.value = String(val);
    this.settings.update({ serialInputPollInterval: val });
  }

  /** Handle debounce change — clamp to valid range */
  onDebounceChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 5;
    val = Math.max(SerialKeyInputService.MIN_DEBOUNCE,
      Math.min(SerialKeyInputService.MAX_DEBOUNCE, val));
    el.value = String(val);
    this.settings.update({ serialInputDebounceMs: val });
  }
}
