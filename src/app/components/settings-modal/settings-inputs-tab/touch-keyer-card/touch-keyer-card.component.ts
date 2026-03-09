/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';

/**
 * Settings card — Touch Keyer.
 *
 * Configures touch-screen-based keying in the fullscreen decoder view.
 * Supports straight key mode (single button) and paddle mode (two
 * buttons). Includes left/right paddle assignment, reverse setting,
 * and paddle mode selection.
 */
@Component({
  selector: 'app-touch-keyer-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './touch-keyer-card.component.html',
  styles: [':host { display: contents; }'],
})
export class TouchKeyerCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

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
