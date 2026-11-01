/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SettingsService } from '../../../../services/settings.service';
import { WakeLockService } from '../../../../services/wake-lock.service';
import { AutoFullscreenService } from '../../../../services/auto-fullscreen.service';
import { ItemShellComponent } from '../../../settings-items/item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../../../settings-items/help-link-button/help-link-button.component';

/**
 * Settings card — Screen Settings.
 *
 * Two switches: Keep screen on (the Screen Wake Lock, which stops the device
 * dimming during active sessions) and Auto full screen (the browser page in
 * full screen). Each shows one short line and a Help button; the wake lock
 * status and its retry button stay below its switch.
 */
@Component({
  selector: 'app-screen-settings-card',
  standalone: true,
  imports: [ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './screen-settings-card.component.html',
  styles: [`
    :host { display: contents; }
    .screen-row { display: flex; align-items: center; font-size: .85rem; color: #bbb; }
    .screen-row + .cw-hint { margin-top: .3rem; padding-top: 0; border-top: none; }
    .screen-row:not(:first-child) { margin-top: .75rem; padding-top: .6rem; border-top: 1px solid #2a2a3a; }
    .screen-name { flex: 0 1 auto; }
    .screen-row .toggle-switch { margin-left: auto; }
    .screen-status { margin-top: .3rem; }
    .screen-status .pill-btn { margin-top: .4rem; }
  `],
})
export class ScreenSettingsCardComponent {
  constructor(
    public settings: SettingsService,
    public wakeLock: WakeLockService,
    public fullscreen: AutoFullscreenService,
  ) {}

  /** Handle wake lock toggle change */
  onWakeLockChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ wakeLockEnabled: checked });
    this.wakeLock.onSettingChanged(checked);
  }

  /** Handle auto full screen toggle change; called from the click so the browser sees the gesture */
  onAutoFullscreenChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ autoFullscreen: checked });
    this.fullscreen.onSettingChanged(checked);
  }
}
