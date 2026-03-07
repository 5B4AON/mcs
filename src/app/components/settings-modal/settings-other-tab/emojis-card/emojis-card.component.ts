/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, EmojiMapping } from '../../../../services/settings.service';
import { EmojiEditModalComponent, EmojiEditSaveEvent } from '../../../emoji-edit-modal/emoji-edit-modal.component';

/**
 * Settings card — Emojis.
 *
 * Maps character sequences to emoji graphics in the fullscreen conversation
 * logs. Hosts the emoji edit modal for adding/editing individual mappings.
 */
@Component({
  selector: 'app-emojis-card',
  standalone: true,
  imports: [FormsModule, EmojiEditModalComponent],
  templateUrl: './emojis-card.component.html',
  styles: [':host { display: contents; }'],
})
export class EmojisCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Index of the emoji mapping currently being edited, or -1 for new */
  emojiEditIndex = -1;

  /** Scratch copy of the mapping passed to the emoji edit modal */
  emojiEditMapping: EmojiMapping = { enabled: true, match: '', emoji: '', meaning: '' };

  /** Whether the emoji edit modal is visible */
  showEmojiEditModal = false;

  constructor(public settings: SettingsService) {}

  /** Toggle the master emojis enabled switch */
  onEmojisEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ emojisEnabled: checked });
  }

  /** Toggle an individual emoji mapping on/off */
  onEmojiEntryEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().emojiMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ emojiMappings: mappings });
  }

  /** Open the emoji edit modal for an existing mapping */
  emojiStartEdit(index: number): void {
    const m = this.settings.settings().emojiMappings[index];
    this.emojiEditIndex = index;
    this.emojiEditMapping = { ...m };
    this.showEmojiEditModal = true;
  }

  /** Open the emoji edit modal for a new mapping */
  emojiAdd(): void {
    this.emojiEditIndex = -1;
    this.emojiEditMapping = { enabled: true, match: '', emoji: '😊', meaning: '' };
    this.showEmojiEditModal = true;
  }

  /** Handle save from the emoji edit modal */
  onEmojiEditSaved(event: EmojiEditSaveEvent): void {
    const mappings = [...this.settings.settings().emojiMappings];
    if (this.emojiEditIndex >= 0) {
      mappings[this.emojiEditIndex] = {
        ...mappings[this.emojiEditIndex],
        match: event.match,
        emoji: event.emoji,
        meaning: event.meaning || undefined,
      };
    } else {
      mappings.push({
        enabled: true,
        match: event.match,
        emoji: event.emoji,
        meaning: event.meaning || undefined,
      });
    }
    this.settings.update({ emojiMappings: mappings });
    this.showEmojiEditModal = false;
  }

  /** Handle cancel from the emoji edit modal */
  onEmojiEditCancelled(): void {
    this.showEmojiEditModal = false;
  }

  /** Handle delete from the emoji edit modal */
  onEmojiEditDeleted(): void {
    if (this.emojiEditIndex >= 0) {
      const mappings = this.settings.settings().emojiMappings.filter((_, i) => i !== this.emojiEditIndex);
      this.settings.update({ emojiMappings: mappings });
    }
    this.showEmojiEditModal = false;
  }
}
