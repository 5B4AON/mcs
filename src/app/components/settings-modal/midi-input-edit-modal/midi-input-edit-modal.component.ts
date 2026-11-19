/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MidiInputMapping } from '../../settings-items/midi-input/midi-input-item.model';
import { mappingFieldsDirty } from '../../settings-items/mapping/mapping-dirty';
import { MappingEditDialogComponent } from '../../settings-items/mapping/mapping-edit-dialog/mapping-edit-dialog.component';
import {
  MidiInputEditSaveEvent, MidiInputMappingEditorComponent,
} from '../../settings-items/mapping/midi-input-mapping-editor/midi-input-mapping-editor.component';

export type { MidiInputEditSaveEvent };

/**
 * Popup used by the MIDI Input settings card to add or edit one mapping.
 * It only frames the shared editor (`app-midi-input-mapping-editor`) in the
 * common mapping dialog; all fields, MIDI learn and validation live in the editor.
 */
@Component({
  selector: 'app-midi-input-edit-modal',
  standalone: true,
  imports: [MappingEditDialogComponent, MidiInputMappingEditorComponent],
  templateUrl: './midi-input-edit-modal.component.html',
})
export class MidiInputEditModalComponent {
  @ViewChild(MidiInputMappingEditorComponent) private editor?: MidiInputMappingEditorComponent;

  /** True while the editor's fields differ from the mapping it opened with (asks before the popup is discarded) */
  readonly dirty = (): boolean => mappingFieldsDirty(this.editor?.fields(), this.mapping);

  /** The mapping being edited (initial values) */
  @Input() mapping: MidiInputMapping = {
    enabled: true, deviceId: '', channel: 0, source: 'rx',
    mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false,
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** Available MIDI input devices */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All existing mappings, for duplicate detection */
  @Input() allMappings: MidiInputMapping[] = [];

  @Output() saved = new EventEmitter<MidiInputEditSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();

  /** OK: save only when the editor accepts its fields. */
  save(): void {
    const result = this.editor?.build();
    if (result) this.saved.emit(result);
  }
}
