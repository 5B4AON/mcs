/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyboardInputMapping, KeyInputMode, DecoderSource, PaddleMode } from '../../services/settings.service';

/**
 * Result payload emitted when the user saves a keyboard input mapping.
 */
export interface KeyboardInputEditSaveEvent {
  mode: KeyInputMode;
  keyCode: string;
  dahKeyCode: string;
  source: DecoderSource;
  reversePaddles: boolean;
  paddleMode: PaddleMode;
  name: string;
  color: string;
}

/**
 * Keyboard Input Edit Modal Component
 *
 * A modal dialog for creating or editing a single keyboard key input mapping.
 * Contains fields for mode (straight key vs paddle), key capture buttons,
 * decoder source, paddle mode, reverse paddles, name and colour.
 */
@Component({
  selector: 'app-keyboard-input-edit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './keyboard-input-edit-modal.component.html',
  styleUrls: ['./keyboard-input-edit-modal.component.css'],
})
export class KeyboardInputEditModalComponent implements OnInit, OnDestroy {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: KeyboardInputMapping = {
    enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
    source: 'tx', reversePaddles: false, paddleMode: 'iambic-b',
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: KeyboardInputMapping[] = [];

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<KeyboardInputEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Editable fields */
  editMode: KeyInputMode = 'straightKey';
  editKeyCode = '';
  editDahKeyCode = '';
  editSource: DecoderSource = 'tx';
  editReversePaddles = false;
  editPaddleMode: PaddleMode = 'iambic-b';
  editName = '';
  editColor = '';

  /** Which field is currently capturing a key press */
  capturing: 'keyCode' | 'dahKeyCode' | null = null;

  /** Validation error message */
  error = '';

  /** Key event handlers for capture mode */
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  ngOnInit(): void {
    this.editMode = this.mapping.mode;
    this.editKeyCode = this.mapping.keyCode;
    this.editDahKeyCode = this.mapping.dahKeyCode || '';
    this.editSource = this.mapping.source;
    this.editReversePaddles = this.mapping.reversePaddles;
    this.editPaddleMode = this.mapping.paddleMode;
    this.editName = this.mapping.name || '';
    this.editColor = this.mapping.color || '';
    this.error = '';
  }

  ngOnDestroy(): void {
    this.stopCapture();
  }

  /** Format a key code for display (make it more human-readable) */
  formatKeyCode(code: string): string {
    if (!code) return '(none)';
    // Strip common prefixes for readability
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
      .replace(/^Arrow/, '↕ ')
      .replace(/^BracketLeft$/, '[')
      .replace(/^BracketRight$/, ']')
      .replace(/^Semicolon$/, ';')
      .replace(/^Quote$/, "'")
      .replace(/^Backquote$/, '`')
      .replace(/^Backslash$/, '\\')
      .replace(/^Slash$/, '/')
      .replace(/^Period$/, '.')
      .replace(/^Comma$/, ',')
      .replace(/^Minus$/, '-')
      .replace(/^Equal$/, '=');
  }

  /** Start capturing a key press for a field */
  onStartCapture(field: 'keyCode' | 'dahKeyCode'): void {
    if (this.capturing === field) {
      this.stopCapture();
      return;
    }
    this.stopCapture();
    this.capturing = field;
    this.boundKeyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;
      if (field === 'keyCode') {
        this.editKeyCode = code;
      } else {
        this.editDahKeyCode = code;
      }
      this.stopCapture();
    };
    window.addEventListener('keydown', this.boundKeyHandler, true);
  }

  /** Stop key capture mode */
  private stopCapture(): void {
    if (this.boundKeyHandler) {
      window.removeEventListener('keydown', this.boundKeyHandler, true);
      this.boundKeyHandler = null;
    }
    this.capturing = null;
  }

  /** Save the edited mapping after validation */
  save(): void {
    const keyCode = this.editKeyCode;
    const dahKeyCode = this.editMode === 'paddle' ? this.editDahKeyCode : '';

    if (!keyCode) {
      this.error = this.editMode === 'paddle'
        ? 'A dit paddle key must be assigned.'
        : 'A straight key must be assigned.';
      return;
    }
    if (this.editMode === 'paddle' && !dahKeyCode) {
      this.error = 'A dah paddle key must be assigned.';
      return;
    }
    if (this.editMode === 'paddle' && keyCode === dahKeyCode) {
      this.error = 'Dit and dah paddle keys must be different.';
      return;
    }

    // Duplicate detection
    const dupError = this.checkDuplicates(keyCode, dahKeyCode);
    if (dupError) {
      this.error = dupError;
      return;
    }

    this.saved.emit({
      mode: this.editMode,
      keyCode,
      dahKeyCode,
      source: this.editSource,
      reversePaddles: this.editMode === 'paddle' ? this.editReversePaddles : false,
      paddleMode: this.editMode === 'paddle' ? this.editPaddleMode : 'iambic-b',
      name: this.editName.trim(),
      color: this.editColor,
    });
  }

  /**
   * Check whether any key code in this mapping conflicts with an existing
   * mapping's key codes. Returns an error message if a conflict is found.
   */
  private checkDuplicates(keyCode: string, dahKeyCode: string): string {
    const myKeys = [keyCode];
    if (dahKeyCode) myKeys.push(dahKeyCode);

    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      const otherKeys = [other.keyCode];
      if (other.mode === 'paddle' && other.dahKeyCode) otherKeys.push(other.dahKeyCode);

      for (const k of myKeys) {
        if (otherKeys.includes(k)) {
          return `Key "${this.formatKeyCode(k)}" is already used by mapping #${i + 1}. Use a different key.`;
        }
      }
    }
    return '';
  }

  /** Cancel without saving */
  cancel(): void {
    this.stopCapture();
    this.cancelled.emit();
  }

  /** Delete this mapping */
  delete(): void {
    this.deleted.emit();
  }
}
