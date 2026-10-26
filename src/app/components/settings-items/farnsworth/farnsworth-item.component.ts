/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Farnsworth / Wordsworth timing.
 *
 * Farnsworth timing sends characters at full speed but stretches the gaps
 * between characters and words, lowering the effective speed (named after
 * Donald R. "Russ" Farnsworth, W6TTB). Wordsworth stretches only the gaps
 * between words. Card in Settings; flat in a wizard step, where the enable
 * switch becomes a checkbox inside the body (the card header is not shown).
 */
@Component({
  selector: 'app-farnsworth-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './farnsworth-item.component.html',
  styles: [':host { display: contents; }'],
})
export class FarnsworthItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Write one setting; range inputs give numbers, selects give text. */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    const value = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  onCheckChange(key: keyof AppSettings, event: Event): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }
}
