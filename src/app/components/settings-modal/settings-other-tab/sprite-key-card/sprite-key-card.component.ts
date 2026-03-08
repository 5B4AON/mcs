/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings.service';

/**
 * Settings card — Straight-Key Sprite Button.
 *
 * Controls the on-screen straight-key sprite button that appears at
 * the bottom of the main view when screen space is available. The
 * button can be tapped/clicked to key Morse and can optionally
 * animate in response to straight-key presses from other input
 * sources (keyboard, mouse, MIDI, mic).
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

  /** Toggle a sprite animation association */
  onAnimateChange(key: 'spriteAnimateKeyboard' | 'spriteAnimateMouse' | 'spriteAnimateMidi' | 'spriteAnimateMic' | 'spriteAnimateSerial', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked });
  }
}
