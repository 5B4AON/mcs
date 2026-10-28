/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { SerialInputMapping } from '../../../services/settings.service';
import { MappingEditDialogComponent } from '../../settings-items/mapping/mapping-edit-dialog/mapping-edit-dialog.component';
import {
  SerialInputEditSaveEvent, SerialInputMappingEditorComponent,
} from '../../settings-items/mapping/serial-input-mapping-editor/serial-input-mapping-editor.component';

export type { SerialInputEditSaveEvent };

/**
 * Popup used by the Serial Input settings card to add or edit one mapping.
 * It only frames the shared editor (`app-serial-input-mapping-editor`) in the
 * common mapping dialog; all fields and validation live in the editor.
 */
@Component({
  selector: 'app-serial-input-edit-modal',
  standalone: true,
  imports: [MappingEditDialogComponent, SerialInputMappingEditorComponent],
  templateUrl: './serial-input-edit-modal.component.html',
})
export class SerialInputEditModalComponent {
  @ViewChild(SerialInputMappingEditorComponent) private editor?: SerialInputMappingEditorComponent;

  /** The mapping being edited (initial values) */
  @Input() mapping: SerialInputMapping = {
    enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
    invert: false, source: 'rx', reversePaddles: false,
    paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
    debounceMs: 5, name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings, for pin conflict detection */
  @Input() allMappings: SerialInputMapping[] = [];

  @Output() saved = new EventEmitter<SerialInputEditSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  /** OK: save only when the editor accepts its fields. */
  save(): void {
    const result = this.editor?.build();
    if (result) this.saved.emit(result);
  }
}
