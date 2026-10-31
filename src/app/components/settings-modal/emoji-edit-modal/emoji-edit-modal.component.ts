/**
 * Morse Code Studio
 */

import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { EmojiMapping } from '../../settings-items/emojis/emojis-item.model';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../../modal-accessibility';
import { BackdropClickDirective } from '../../backdrop-click.directive';
import { BackCloseDirective } from '../../back-close.directive';

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
 * cursor position within the replacement field. Deleting is done from the
 * emoji list, not here.
 */
@Component({
  selector: 'app-emoji-edit-modal',
  standalone: true,
  imports: [FormsModule, EmojiPickerComponent, BackdropClickDirective, BackCloseDirective],
  templateUrl: './emoji-edit-modal.component.html',
  styleUrls: ['./emoji-edit-modal.component.css'],
})
export class EmojiEditModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

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
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngOnInit(): void {
    this.editMatch = this.mapping.match;
    this.editEmoji = this.mapping.emoji;
    this.editMeaning = this.mapping.meaning ?? '';
    this.error = '';
  }

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.close-btn');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /** Keep keyboard focus inside the emoji mapping editor. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
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

  /** The browser Back button closes this popup like Cancel */
  readonly backClose = (): void => { this.cancelled.emit(); };

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
