/**
 * Morse Code Studio
 */

import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { FirebaseRtdbService } from '../../../../services/firebase-rtdb.service';

/**
 * Settings card — Firebase RTDB Output (publish decoded chars to remote channel).
 *
 * Configures outbound character publishing via Firebase Realtime Database.
 * Includes channel name/secret fields, user name, forward selector
 * (RX/TX/Both), and connection status display.
 */
@Component({
  selector: 'app-rtdb-output-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './rtdb-output-card.component.html',
  styles: [':host { display: contents; }'],
})
export class RtdbOutputCardComponent implements OnDestroy {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Debounce timer for RTDB output restart on text field changes */
  private rtdbOutputDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public settings: SettingsService,
    public rtdbService: FirebaseRtdbService,
  ) {}

  ngOnDestroy(): void {
    if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
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

  /** Handle RTDB output enabled toggle — starts/stops the RTDB publisher */
  onRtdbOutputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB output — you are offline.');
      return;
    }
    this.settings.update({ rtdbOutputEnabled: checked });
    if (checked) {
      this.rtdbService.startOutput();
    } else {
      this.rtdbService.stopOutput();
    }
  }

  /**
   * Handle text setting changes with RTDB auto-reconnect.
   * Debounces restarts to avoid rapid reconnections while typing.
   */
  onTextSettingChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);

    const rtdbOutputKeys: (keyof AppSettings)[] = ['rtdbOutputChannelName', 'rtdbOutputChannelSecret', 'rtdbOutputName'];
    if (rtdbOutputKeys.includes(key) && this.settings.settings().rtdbOutputEnabled) {
      if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
      this.rtdbOutputDebounce = setTimeout(() => this.rtdbService.startOutput(), 600);
    }
  }
}
