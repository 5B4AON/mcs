/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmojiMapping } from './emojis-item.model';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { EmojiEditModalComponent, EmojiEditSaveEvent } from '../../settings-modal/emoji-edit-modal/emoji-edit-modal.component';

/**
 * Settings item — Emojis.
 *
 * Maps character sequences to emoji graphics in the fullscreen conversation
 * logs. Hosts the emoji edit modal for adding/editing individual mappings.
 */
@Component({
  selector: 'app-emojis-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, EmojiEditModalComponent],
  templateUrl: './emojis-item.component.html',
  styles: [':host { display: contents; }'],
})
export class EmojisItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Index of the emoji mapping currently being edited, or -1 for new */
  emojiEditIndex = -1;

  /** Scratch copy of the mapping passed to the emoji edit modal */
  emojiEditMapping: EmojiMapping = { enabled: true, match: '', emoji: '', meaning: '' };

  /** Whether the emoji edit modal is visible */
  showEmojiEditModal = false;

  /** Toggle an individual emoji mapping on/off */
  onEmojiEntryEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.s().emojiMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ emojiMappings: mappings });
  }

  /** Open the emoji edit modal for an existing mapping */
  emojiStartEdit(index: number): void {
    const m = this.s().emojiMappings[index];
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
    const mappings = [...this.s().emojiMappings];
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
    this.scope.update({ emojiMappings: mappings });
    this.showEmojiEditModal = false;
  }

  /** Handle cancel from the emoji edit modal */
  onEmojiEditCancelled(): void {
    this.showEmojiEditModal = false;
  }

  /** Handle delete from the emoji edit modal */
  onEmojiEditDeleted(): void {
    if (this.emojiEditIndex >= 0) {
      const mappings = this.s().emojiMappings.filter((_, i) => i !== this.emojiEditIndex);
      this.scope.update({ emojiMappings: mappings });
    }
    this.showEmojiEditModal = false;
  }

  /** Master switch */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ emojisEnabled: enabled });
  }
}
