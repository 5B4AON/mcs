/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { StepperComponent } from '../stepper/stepper.component';

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
  imports: [FormsModule, ItemShellComponent, StepperComponent],
  templateUrl: './farnsworth-item.component.html',
  styles: [':host { display: contents; } .farnsworth-value { font-weight: 600; margin-top: .6rem; }'],
})
export class FarnsworthItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /**
   * The multiplier the slider shows: whole numbers 1 to 10 for Farnsworth,
   * 1 to 4 in steps of 0.5 for Wordsworth (older values are brought into range).
   */
  get multiplier(): number {
    const m = this.s().farnsworthMultiplier;
    return this.s().farnsworthWordsworth
      ? Math.max(1, Math.min(4, Math.round(m * 2) / 2))
      : Math.max(1, Math.min(10, Math.round(m)));
  }

  /** Write one setting; range inputs give numbers, selects give text. */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    const value = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  onCheckChange(key: keyof AppSettings, event: Event): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }

  /** Wordsworth allows a smaller multiplier range; bring the stored value into it. */
  onWordsworthChange(event: Event): void {
    this.onCheckChange('farnsworthWordsworth', event);
    if (this.s().farnsworthWordsworth) this.scope.update({ farnsworthMultiplier: this.multiplier });
  }
}
