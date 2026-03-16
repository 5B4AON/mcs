/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings.service';

/**
 * Settings card — Farnsworth / Wordsworth Timing.
 *
 * Farnsworth timing sends individual characters at full speed but
 * stretches the gaps between characters and words to lower the
 * effective speed. Named after Donald R. "Russ" Farnsworth (W6TTB),
 * the technique helps learners recognise characters at real speed
 * while giving them extra thinking time.
 *
 * Wordsworth mode stretches only the inter-word gaps, keeping
 * characters and inter-character spacing at full speed. This helps
 * operators who have achieved instant character recognition but need
 * extra time to process whole words.
 */
@Component({
  selector: 'app-farnsworth-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './farnsworth-card.component.html',
  styles: [':host { display: contents; }'],
})
export class FarnsworthCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

  /** Handle master toggle change */
  onEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ farnsworthEnabled: checked });
  }

  /** Handle input mode change */
  onInputModeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'wpm' | 'multiplier';
    this.settings.update({ farnsworthInputMode: value });
  }

  /** Handle effective WPM change */
  onEffectiveWpmChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.settings.update({ farnsworthEffectiveWpm: value });
  }

  /** Handle multiplier change */
  onMultiplierChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.settings.update({ farnsworthMultiplier: value });
  }

  /** Handle Wordsworth toggle change */
  onWordsworthChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ farnsworthWordsworth: checked });
  }

  /** Handle applies-to selection change */
  onAppliesToChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'tx' | 'rx' | 'both';
    this.settings.update({ farnsworthAppliesTo: value });
  }
}
