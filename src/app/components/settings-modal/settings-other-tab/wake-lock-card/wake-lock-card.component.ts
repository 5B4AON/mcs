/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings.service';
import { WakeLockService } from '../../../../services/wake-lock.service';

/**
 * Settings card — Screen Wake Lock.
 *
 * Prevents the device screen from dimming during active sessions.
 * Displays API support status and current lock state.
 */
@Component({
  selector: 'app-wake-lock-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './wake-lock-card.component.html',
  styles: [':host { display: contents; }'],
})
export class WakeLockCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(
    public settings: SettingsService,
    public wakeLock: WakeLockService,
  ) {}

  /** Handle wake lock toggle change */
  onWakeLockChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ wakeLockEnabled: checked });
    this.wakeLock.onSettingChanged(checked);
  }
}
