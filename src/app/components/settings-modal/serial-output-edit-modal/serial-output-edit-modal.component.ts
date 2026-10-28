/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { SerialOutputMapping, SerialInputMapping } from '../../../services/settings.service';
import { MappingEditDialogComponent } from '../../settings-items/mapping/mapping-edit-dialog/mapping-edit-dialog.component';
import {
  SerialOutputEditSaveEvent, SerialOutputMappingEditorComponent,
} from '../../settings-items/mapping/serial-output-mapping-editor/serial-output-mapping-editor.component';

export type { SerialOutputEditSaveEvent };

/**
 * Popup used by the Serial Output settings card to add or edit one mapping.
 * It only frames the shared editor (`app-serial-output-mapping-editor`) in
 * the common mapping dialog; all fields live in the editor.
 */
@Component({
  selector: 'app-serial-output-edit-modal',
  standalone: true,
  imports: [MappingEditDialogComponent, SerialOutputMappingEditorComponent],
  templateUrl: './serial-output-edit-modal.component.html',
})
export class SerialOutputEditModalComponent {
  @ViewChild(SerialOutputMappingEditorComponent) private editor?: SerialOutputMappingEditorComponent;

  /** The mapping being edited (initial values) */
  @Input() mapping: SerialOutputMapping = {
    enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing output mappings, for the duplicate warning */
  @Input() allMappings: SerialOutputMapping[] = [];

  /** Serial input mappings that can be relayed */
  @Input() serialInputMappings: SerialInputMapping[] = [];

  @Output() saved = new EventEmitter<SerialOutputEditSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  /** OK: save the editor's values. */
  save(): void {
    const result = this.editor?.build();
    if (result) this.saved.emit(result);
  }
}
