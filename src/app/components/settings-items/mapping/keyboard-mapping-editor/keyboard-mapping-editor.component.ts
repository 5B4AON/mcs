/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyboardInputMapping, KeyInputMode, DecoderSource, PaddleMode } from '../../../../services/settings.service';
import { CaptureSlot } from '../capture-slot';
import { DetectButtonComponent } from '../detect-button/detect-button.component';
import { MappingIdentityFieldsComponent } from '../identity-fields/mapping-identity-fields.component';

/** Result of a validated keyboard mapping edit (one mapping, ready to store). */
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

/** Human-readable form of a KeyboardEvent.code ("KeyA" -> "A", "ArrowUp" -> "↕ Up"). */
export function formatKeyCode(code: string): string {
  if (!code) return '(none)';
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

/**
 * The fields of one keyboard key mapping: mode, key capture, paddle options,
 * RX/TX use, name and colour. It has no frame of its own, so Settings shows it
 * inside a popup (`app-mapping-edit-dialog`) and the wizard shows it flat on a
 * step. The host calls `build()` when the user confirms: it validates and
 * returns the mapping values, or null after showing the problem.
 */
@Component({
  selector: 'app-keyboard-mapping-editor',
  standalone: true,
  imports: [FormsModule, DetectButtonComponent, MappingIdentityFieldsComponent],
  templateUrl: './keyboard-mapping-editor.component.html',
  styles: [':host { display: block; }'],
})
export class KeyboardMappingEditorComponent implements OnChanges, OnDestroy {
  /** The mapping to start from */
  @Input() mapping: KeyboardInputMapping = {
    enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
    source: 'tx', reversePaddles: false, paddleMode: 'iambic-b',
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for a new one) */
  @Input() editIndex = -1;

  /** All mappings, for duplicate key detection */
  @Input() allMappings: KeyboardInputMapping[] = [];

  /** Prefix that keeps element ids unique when two editors exist at once */
  @Input() idPrefix = 'kb';

  readonly formatKeyCode = formatKeyCode;

  editMode: KeyInputMode = 'straightKey';
  editKeyCode = '';
  editDahKeyCode = '';
  editSource: DecoderSource = 'tx';
  editReversePaddles = false;
  editPaddleMode: PaddleMode = 'iambic-b';
  editName = '';
  editColor = '';

  /** Which key field is waiting for a key press */
  readonly capture = new CaptureSlot<'keyCode' | 'dahKeyCode'>();

  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapping']) this.load();
  }

  ngOnDestroy(): void {
    this.capture.cancel();
  }

  private load(): void {
    const m = this.mapping;
    this.editMode = m.mode;
    this.editKeyCode = m.keyCode;
    this.editDahKeyCode = m.dahKeyCode || '';
    this.editSource = m.source;
    this.editReversePaddles = m.reversePaddles;
    this.editPaddleMode = m.paddleMode;
    this.editName = m.name || '';
    this.editColor = m.color || '';
    this.error = '';
  }

  /** Wait for the next key press and store its code in `field`; Escape cancels. */
  startCapture(field: 'keyCode' | 'dahKeyCode'): void {
    this.capture.toggle(field, () => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.capture.cancel();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (field === 'keyCode') this.editKeyCode = e.code;
        else this.editDahKeyCode = e.code;
        this.capture.cancel();
      };
      window.addEventListener('keydown', handler, true);
      return () => window.removeEventListener('keydown', handler, true);
    });
  }

  /** Validate the fields; returns the mapping values, or null with `error` set. */
  build(): KeyboardInputEditSaveEvent | null {
    this.capture.cancel();
    const paddle = this.editMode === 'paddle';
    const keyCode = this.editKeyCode;
    const dahKeyCode = paddle ? this.editDahKeyCode : '';

    if (!keyCode) {
      this.error = paddle ? 'A dit paddle key must be assigned.' : 'A straight key must be assigned.';
      return null;
    }
    if (paddle && !dahKeyCode) {
      this.error = 'A dah paddle key must be assigned.';
      return null;
    }
    if (paddle && keyCode === dahKeyCode) {
      this.error = 'Dit and dah paddle keys must be different.';
      return null;
    }
    const dupError = this.checkDuplicates(keyCode, dahKeyCode);
    if (dupError) {
      this.error = dupError;
      return null;
    }
    this.error = '';
    return {
      mode: this.editMode,
      keyCode,
      dahKeyCode,
      source: this.editSource,
      reversePaddles: paddle ? this.editReversePaddles : false,
      paddleMode: paddle ? this.editPaddleMode : 'iambic-b',
      name: this.editName.trim(),
      color: this.editColor,
    };
  }

  /** Error text when one of this mapping's keys is already used by another mapping. */
  private checkDuplicates(keyCode: string, dahKeyCode: string): string {
    const myKeys = dahKeyCode ? [keyCode, dahKeyCode] : [keyCode];
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      const otherKeys = [other.keyCode];
      if (other.mode === 'paddle' && other.dahKeyCode) otherKeys.push(other.dahKeyCode);
      for (const k of myKeys) {
        if (otherKeys.includes(k)) {
          return `Key "${formatKeyCode(k)}" is already used by mapping #${i + 1}. Use a different key.`;
        }
      }
    }
    return '';
  }
}
