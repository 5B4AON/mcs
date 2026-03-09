/**
 * Morse Code Studio
 */

import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { FirebaseRtdbService } from '../../../../services/firebase-rtdb.service';

/**
 * Settings card — Firebase RTDB Input.
 *
 * Subscribes to a Firebase Realtime Database channel to receive morse
 * characters from remote stations. Includes channel name/secret fields,
 * source selector (RX/TX), WPM override toggle, and connection status.
 */
@Component({
  selector: 'app-rtdb-input-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './rtdb-input-card.component.html',
  styles: [':host { display: contents; }'],
})
export class RtdbInputCardComponent implements OnDestroy {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Debounce timer for RTDB input restart on text field changes */
  private rtdbInputDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public settings: SettingsService,
    public rtdbService: FirebaseRtdbService,
  ) {}

  ngOnDestroy(): void {
    if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
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

  /** Handle RTDB input enabled toggle */
  onRtdbInputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB input — you are offline.');
      return;
    }
    this.settings.update({ rtdbInputEnabled: checked });
    if (checked) {
      this.rtdbService.startInput();
    } else {
      this.rtdbService.stopInput();
    }
  }

  /** Handle text setting changes with RTDB auto-reconnect */
  onTextSettingChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);

    const rtdbInputKeys: (keyof AppSettings)[] = ['rtdbInputChannelName', 'rtdbInputChannelSecret'];
    if (rtdbInputKeys.includes(key) && this.settings.settings().rtdbInputEnabled) {
      if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
      this.rtdbInputDebounce = setTimeout(() => this.rtdbService.startInput(), 600);
    }
  }
}
