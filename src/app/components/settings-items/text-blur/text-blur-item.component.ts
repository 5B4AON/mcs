/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Text Blurring.
 *
 * Blurs decoded text in both main screen and fullscreen views for
 * training purposes. Users can choose to blur RX only, TX only, or
 * both directions. A momentary reveal button in the text areas lets
 * users peek at the blurred text by pressing and holding.
 */
@Component({
  selector: 'app-text-blur-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './text-blur-item.component.html',
  styles: [':host { display: contents; }'],
})
export class TextBlurItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Handle applies-to selection change */
  onAppliesToChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'rx' | 'tx' | 'both';
    this.scope.update({ textBlurAppliesTo: value });
  }

  /** Master switch */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ textBlurEnabled: enabled });
  }
}
