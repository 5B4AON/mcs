/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings.service';

/**
 * Settings card — Text Blurring.
 *
 * Blurs decoded text in both main screen and fullscreen views for
 * training purposes. Users can choose to blur RX only, TX only, or
 * both directions. A momentary reveal button in the text areas lets
 * users peek at the blurred text by pressing and holding.
 */
@Component({
  selector: 'app-text-blur-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './text-blur-card.component.html',
  styles: [':host { display: contents; }'],
})
export class TextBlurCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

  /** Handle text blur toggle change */
  onEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ textBlurEnabled: checked });
  }

  /** Handle applies-to selection change */
  onAppliesToChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'rx' | 'tx' | 'both';
    this.settings.update({ textBlurAppliesTo: value });
  }
}
