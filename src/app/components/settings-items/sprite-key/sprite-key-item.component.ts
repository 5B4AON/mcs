/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Main Screen Touch Keyer.
 *
 * Controls the on-screen key that appears at the bottom of the main view when screen
 * space is available: a straight key or two paddles (the same choices as the Fullscreen
 * Touch Keyer card, including Reverse Paddles and the paddle mode). It can be tapped or
 * clicked to key Morse and can optionally animate in response to the same kind of key
 * from other input sources (keyboard, encoder, mouse, MIDI, serial).
 */
@Component({
  selector: 'app-sprite-key-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './sprite-key-item.component.html',
  styles: [':host { display: contents; }'],
})
export class SpriteKeyItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** A wizard step can show one part of the card; Settings shows all of it. */
  @Input() part: 'all' | 'mode' | 'paddle' | 'identity' | 'animate' = 'all';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** True while the sprite is a paddle (the animate list and the hints change with it) */
  get paddle(): boolean {
    return this.s().spriteKeyerMode === 'paddle';
  }

  /** Handle a string setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    this.scope.update({ [key]: el.value } as Partial<AppSettings>);
  }

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.scope.update({ [key]: checked } as Partial<AppSettings>);
  }

  /** Toggle a sprite animation association */
  onAnimateChange(key: 'spriteAnimateKeyboard' | 'spriteAnimateEncoder' | 'spriteAnimateMouse' | 'spriteAnimateMidi' | 'spriteAnimateSerial', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.scope.update({ [key]: checked });
  }
}
