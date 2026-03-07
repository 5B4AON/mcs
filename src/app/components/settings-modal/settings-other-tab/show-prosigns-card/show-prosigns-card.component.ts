/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings.service';

/**
 * Settings card — Show Prosigns.
 *
 * Toggles prosign name display (e.g. <AR>, <BT>) in the fullscreen
 * conversation logs instead of the underlying punctuation characters.
 * Includes an explanatory table of ambiguous prosign/punctuation pairs.
 */
@Component({
  selector: 'app-show-prosigns-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './show-prosigns-card.component.html',
  styles: [':host { display: contents; }'],
})
export class ShowProsignsCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked } as any);
  }
}
