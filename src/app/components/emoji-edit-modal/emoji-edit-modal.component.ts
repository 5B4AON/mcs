/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { EmojiMapping } from '../../services/settings.service';

/**
 * Result payload emitted when the user saves an emoji mapping.
 */
export interface EmojiEditSaveEvent {
  match: string;
  emoji: string;
  meaning: string;
}

/**
 * Emoji Edit Modal Component
 *
 * A modal dialog for creating or editing a single emoji mapping.
 * Contains fields for the trigger pattern, replacement text (which may
 * include multiple emojis and/or arbitrary characters), and an optional
 * description. The embedded emoji picker inserts a single emoji at the
 * cursor position within the replacement field. A delete button is
 * provided here instead of on the main emoji list to save space.
 */
@Component({
  selector: 'app-emoji-edit-modal',
  standalone: true,
  imports: [FormsModule, EmojiPickerComponent],
  templateUrl: './emoji-edit-modal.component.html',
  styleUrls: ['./emoji-edit-modal.component.css'],
})
export class EmojiEditModalComponent implements OnInit {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: EmojiMapping = { enabled: true, match: '', emoji: '', meaning: '' };

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: EmojiMapping[] = [];

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<EmojiEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Reference to the emoji/replacement text input */
  @ViewChild('emojiInput') emojiInputRef!: ElementRef<HTMLInputElement>;

  /** Editable match pattern */
  editMatch = '';

  /** Editable replacement text (emojis + characters) */
  editEmoji = '';

  /** Editable description */
  editMeaning = '';

  /** Validation error message */
  error = '';

  /** Whether the emoji picker sub-modal is visible */
  showPicker = false;

  /** Cursor position in the emoji input before opening the picker */
  private cursorPos = 0;

  ngOnInit(): void {
    this.editMatch = this.mapping.match;
    this.editEmoji = this.mapping.emoji;
    this.editMeaning = this.mapping.meaning ?? '';
    this.error = '';
  }

  /** Save the edited mapping after validation */
  save(): void {
    const match = this.editMatch.trim().toUpperCase();
    const emoji = this.editEmoji.trim();
    const meaning = this.editMeaning.trim();
    if (!match || !emoji) {
      this.error = 'Both trigger and replacement are required.';
      return;
    }
    // Duplicate check (exclude current index)
    const dup = this.allMappings.some((m, i) =>
      i !== this.editIndex && m.match.toUpperCase() === match
    );
    if (dup) {
      this.error = 'Duplicate trigger pattern.';
      return;
    }
    this.saved.emit({ match, emoji, meaning });
  }

  /** Cancel without saving */
  cancel(): void {
    this.cancelled.emit();
  }

  /** Delete this mapping */
  delete(): void {
    this.deleted.emit();
  }

  /** Open the emoji picker, remembering cursor position */
  openPicker(): void {
    const el = this.emojiInputRef?.nativeElement;
    this.cursorPos = el ? (el.selectionStart ?? el.value.length) : this.editEmoji.length;
    this.showPicker = true;
  }

  /** Close the emoji picker */
  closePicker(): void {
    this.showPicker = false;
  }

  /**
   * Insert a single emoji at the previously remembered cursor position
   * in the replacement text field.
   */
  onPickerSelected(emoji: string): void {
    const before = this.editEmoji.substring(0, this.cursorPos);
    const after = this.editEmoji.substring(this.cursorPos);
    this.editEmoji = before + emoji + after;
    this.cursorPos = before.length + emoji.length;
    this.showPicker = false;

    // Restore focus to the input at the new cursor position
    setTimeout(() => {
      const el = this.emojiInputRef?.nativeElement;
      if (el) {
        el.focus();
        el.setSelectionRange(this.cursorPos, this.cursorPos);
      }
    });
  }
}
