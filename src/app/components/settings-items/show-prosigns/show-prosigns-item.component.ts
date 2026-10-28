/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Show Prosigns.
 *
 * Toggles prosign name display (e.g. <AR>, <BT>) in the fullscreen
 * conversation logs instead of the underlying punctuation characters.
 * Includes an explanatory table of ambiguous prosign/punctuation pairs.
 */
@Component({
  selector: 'app-show-prosigns-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './show-prosigns-item.component.html',
  styles: [':host { display: contents; }'],
})
export class ShowProsignsItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Master switch */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ showProsigns: enabled });
  }
}
