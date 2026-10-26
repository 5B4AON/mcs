/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { KeyboardInputMapping } from '../../../services/settings.service';
import { MappingEditDialogComponent } from '../../settings-items/mapping/mapping-edit-dialog/mapping-edit-dialog.component';
import {
  KeyboardInputEditSaveEvent, KeyboardMappingEditorComponent,
} from '../../settings-items/mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';

export type { KeyboardInputEditSaveEvent };

/**
 * Popup used by the Keyboard Keyer settings card to add or edit one mapping.
 * It only frames the shared editor (`app-keyboard-mapping-editor`) in the
 * common mapping dialog; all fields and validation live in the editor.
 */
@Component({
  selector: 'app-keyboard-input-edit-modal',
  standalone: true,
  imports: [MappingEditDialogComponent, KeyboardMappingEditorComponent],
  templateUrl: './keyboard-input-edit-modal.component.html',
})
export class KeyboardInputEditModalComponent {
  @ViewChild(KeyboardMappingEditorComponent) private editor?: KeyboardMappingEditorComponent;

  /** The mapping being edited (initial values) */
  @Input() mapping: KeyboardInputMapping = {
    enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
    source: 'tx', reversePaddles: false, paddleMode: 'iambic-b',
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings, for duplicate detection */
  @Input() allMappings: KeyboardInputMapping[] = [];

  @Output() saved = new EventEmitter<KeyboardInputEditSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  /** OK: save only when the editor accepts its fields. */
  save(): void {
    const result = this.editor?.build();
    if (result) this.saved.emit(result);
  }
}
