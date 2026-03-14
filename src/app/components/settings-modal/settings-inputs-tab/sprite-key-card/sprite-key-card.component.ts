/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';

/**
 * Settings card — Straight-Key Sprite Button.
 *
 * Controls the on-screen straight-key sprite button that appears at
 * the bottom of the main view when screen space is available. The
 * button can be tapped/clicked to key Morse and can optionally
 * animate in response to straight-key presses from other input
 * sources (keyboard, encoder, mouse, MIDI, serial, mic).
 */
@Component({
  selector: 'app-sprite-key-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sprite-key-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SpriteKeyCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

  /** Toggle the sprite button master switch */
  onEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ spriteButtonEnabled: checked });
  }

  /** Handle a string setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    this.settings.update({ [key]: el.value } as Partial<AppSettings>);
  }

  /** Toggle a sprite animation association */
  onAnimateChange(key: 'spriteAnimateKeyboard' | 'spriteAnimateEncoder' | 'spriteAnimateMouse' | 'spriteAnimateMidi' | 'spriteAnimateSerial' | 'spriteAnimateMic', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked });
  }
}
