/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Keyboard Encoder.
 *
 * Text typed on the keyboard is encoded to Morse and played through the
 * enabled outputs. Here you tag it as received (RX) or transmitted (TX) and
 * give it a name and colour for conversation views. Card in Settings, flat
 * block in wizard steps.
 */
@Component({
  selector: 'app-encoder-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './encoder-item.component.html',
  styles: [':host { display: contents; }'],
})
export class EncoderItemComponent {
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
}
