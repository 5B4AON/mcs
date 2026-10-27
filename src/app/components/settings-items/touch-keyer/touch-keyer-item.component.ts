/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';

/**
 * Settings item — Touch Keyer.
 *
 * Configures touch-screen-based keying in the full-screen conversation (Key mode).
 * Supports straight key mode (single button) and paddle mode (two
 * buttons). Includes left/right paddle assignment, reverse setting,
 * and paddle mode selection.
 */
@Component({
  selector: 'app-touch-keyer-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './touch-keyer-item.component.html',
  styles: [':host { display: contents; }'],
})
export class TouchKeyerItemComponent {
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
    const checked = (event.target as HTMLInputElement).checked;
    this.scope.update({ [key]: checked } as Partial<AppSettings>);
  }
}
