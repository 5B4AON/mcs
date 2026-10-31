/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MidiOutputMapping } from '../../settings-items/midi-output/midi-output-item.model';
import { MidiInputMapping } from '../../settings-items/midi-input/midi-input-item.model';
import { MappingEditDialogComponent } from '../../settings-items/mapping/mapping-edit-dialog/mapping-edit-dialog.component';
import {
  MidiOutputEditSaveEvent, MidiOutputMappingEditorComponent,
} from '../../settings-items/mapping/midi-output-mapping-editor/midi-output-mapping-editor.component';

export type { MidiOutputEditSaveEvent };

/**
 * Popup used by the MIDI Output settings card to add or edit one mapping.
 * It only frames the shared editor (`app-midi-output-mapping-editor`) in the
 * common mapping dialog; all fields and validation live in the editor.
 */
@Component({
  selector: 'app-midi-output-edit-modal',
  standalone: true,
  imports: [MappingEditDialogComponent, MidiOutputMappingEditorComponent],
  templateUrl: './midi-output-edit-modal.component.html',
})
export class MidiOutputEditModalComponent {
  @ViewChild(MidiOutputMappingEditorComponent) private editor?: MidiOutputMappingEditorComponent;

  /** The mapping being edited (initial values) */
  @Input() mapping: MidiOutputMapping = {
    enabled: true, deviceId: '', channel: 1,
    forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** Available MIDI output devices */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All existing mappings, for the overlap warning */
  @Input() allMappings: MidiOutputMapping[] = [];

  /** MIDI input mappings available for relay */
  @Input() midiInputMappings: MidiInputMapping[] = [];

  @Output() saved = new EventEmitter<MidiOutputEditSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();

  /** OK: save only when the editor accepts its fields. */
  save(): void {
    const result = this.editor?.build();
    if (result) this.saved.emit(result);
  }
}
