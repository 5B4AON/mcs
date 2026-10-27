/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { AppSettings } from '../../../services/settings.service';
import { WinkeyerOutputService } from '../../../services/winkeyer-output.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — WinKeyer Output (K1EL WinKeyer protocol via serial).
 *
 * Forwards decoded text to a WinKeyer device for re-keying with clean
 * timing: forward direction, serial port, speed, firmware version and
 * test / clear buffer buttons. The device is only opened, closed or sent
 * to from live Settings; a wizard only edits the draft values. The test
 * buttons send real keying, so they are live-only and need a click.
 */
@Component({
  selector: 'app-winkeyer-item',
  standalone: true,
  imports: [ItemShellComponent],
  templateUrl: './winkeyer-item.component.html',
  styles: [':host { display: contents; }'],
})
export class WinkeyerItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  readonly winkeyerOutput = inject(WinkeyerOutputService);

  readonly webSerialSupported = 'serial' in navigator;
  readonly isAndroid = /android/i.test(navigator.userAgent);

  constructor() {
    // Only lists ports the user has already granted; it never shows a prompt
    if (this.webSerialSupported) this.winkeyerOutput.refreshPorts();
  }

  get unavailable(): boolean {
    return !this.webSerialSupported || this.isAndroid;
  }

  /** Port choice; "-2" is "+ Add serial port" and asks the browser for a port (explicit click). */
  async onPortChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    if (select.value === '-2') {
      select.value = String(this.s().winkeyerPortIndex);
      await this.winkeyerOutput.requestPort();
      return;
    }
    const idx = parseInt(select.value, 10);
    this.scope.update({ winkeyerPortIndex: idx });
    if (!this.scope.isLive) return;
    await this.winkeyerOutput.close();
    if (idx >= 0) await this.winkeyerOutput.open(idx);
  }

  onForwardChange(event: Event): void {
    this.scope.update({ winkeyerForward: (event.target as HTMLSelectElement).value as AppSettings['winkeyerForward'] });
  }

  /** Master switch; in live Settings also opens or closes the connection. */
  async onEnabledChange(checked: boolean): Promise<void> {
    if (checked && this.unavailable) return;
    this.scope.update({ winkeyerEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) {
      const idx = this.s().winkeyerPortIndex;
      if (idx >= 0 && !this.winkeyerOutput.connected()) await this.winkeyerOutput.open(idx);
    } else {
      await this.winkeyerOutput.close();
    }
  }

  /** Speed change; also sent to the device when it is connected (live Settings only). */
  async onWpmChange(event: Event): Promise<void> {
    const wpm = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(wpm)) return;
    this.scope.update({ winkeyerWpm: wpm });
    if (this.scope.isLive && this.winkeyerOutput.connected()) {
      await this.winkeyerOutput.setSpeed(wpm);
    }
  }

  forwardLabel(forward: string): string {
    return forward === 'rx' ? 'RX' : forward === 'tx' ? 'TX' : 'RX/TX';
  }
}
