/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';

/**
 * Settings card — Keyboard Encoder.
 *
 * Configures the keyboard encoder input — the text typed via the keyboard
 * and sent as Morse code. Allows assigning an RX/TX source, optional
 * display name, and text color for conversation views.
 */
@Component({
  selector: 'app-encoder-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './encoder-card.component.html',
  styles: [':host { display: contents; }'],
})
export class EncoderCardComponent {
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
}
