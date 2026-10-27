/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Straight-Key Sprite Button.
 *
 * Controls the on-screen straight-key sprite button that appears at
 * the bottom of the main view when screen space is available. The
 * button can be tapped/clicked to key Morse and can optionally
 * animate in response to straight-key presses from other input
 * sources (keyboard, encoder, mouse, MIDI, serial, mic).
 */
@Component({
  selector: 'app-sprite-key-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './sprite-key-item.component.html',
  styles: [':host { display: contents; }'],
})
export class SpriteKeyItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Handle a string setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    this.scope.update({ [key]: el.value } as Partial<AppSettings>);
  }

  /** Toggle a sprite animation association */
  onAnimateChange(key: 'spriteAnimateKeyboard' | 'spriteAnimateEncoder' | 'spriteAnimateMouse' | 'spriteAnimateMidi' | 'spriteAnimateSerial' | 'spriteAnimateMic', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.scope.update({ [key]: checked });
  }
}
