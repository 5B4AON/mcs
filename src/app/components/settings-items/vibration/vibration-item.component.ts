/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Vibration (haptic feedback mirroring the sidetone).
 *
 * Uses the Vibration API, so it only does anything on Android browsers.
 * Card in Settings, flat block in wizard steps.
 */
@Component({
  selector: 'app-vibration-item',
  standalone: true,
  imports: [ItemShellComponent],
  templateUrl: './vibration-item.component.html',
  styles: [':host { display: contents; }'],
})
export class VibrationItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }
}
