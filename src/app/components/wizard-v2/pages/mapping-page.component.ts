/**
 * Morse Code Studio
 */

import { Component, Input, OnInit, ViewChild, inject } from '@angular/core';
import { KeyboardInputMapping, MidiInputMapping, MidiOutputMapping, SerialInputMapping, SerialOutputMapping } from '../../../services/settings.service';
import { SerialInputMappingEditorComponent } from '../../settings-items/mapping/serial-input-mapping-editor/serial-input-mapping-editor.component';
import { SerialOutputMappingEditorComponent } from '../../settings-items/mapping/serial-output-mapping-editor/serial-output-mapping-editor.component';
import { MidiInputService } from '../../../services/midi-input.service';
import { MidiOutputService } from '../../../services/midi-output.service';
import { SETTINGS_SCOPE } from '../../settings-items/settings-scope';
import { KeyboardMappingEditorComponent } from '../../settings-items/mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';
import { MidiInputMappingEditorComponent } from '../../settings-items/mapping/midi-input-mapping-editor/midi-input-mapping-editor.component';
import { MidiOutputMappingEditorComponent } from '../../settings-items/mapping/midi-output-mapping-editor/midi-output-mapping-editor.component';

/**
 * One wizard page for one mapping: the same field editor Settings uses, shown
 * flat. It only hosts the editor of the right kind; the shell asks it to
 * `commit()` (validate and read the fields), to tell whether the fields
 * differ from the stored mapping (`isDirty()`, for the Revert button) and to
 * `reset()` them.
 */
@Component({
  selector: 'app-mapping-page',
  standalone: true,
  imports: [KeyboardMappingEditorComponent, MidiInputMappingEditorComponent, MidiOutputMappingEditorComponent, SerialInputMappingEditorComponent, SerialOutputMappingEditorComponent],
  template: `
    @switch (kind) {
      @case ('keyboard-mapping-editor') {
        <app-keyboard-mapping-editor [mapping]="asKeyboard()" [editIndex]="index"
                                     [allMappings]="asKeyboardList()" idPrefix="wzKb" />
      }
      @case ('midi-input-mapping-editor') {
        <app-midi-input-mapping-editor [mapping]="asMidi()" [editIndex]="index"
                                       [allMappings]="asMidiList()"
                                       [midiDevices]="midiInput.midiInputs()" idPrefix="wzMidi" />
      }
      @case ('serial-input-mapping-editor') {
        <app-serial-input-mapping-editor [mapping]="asSerial()" [editIndex]="index"
                                         [allMappings]="asSerialList()" idPrefix="wzSerial" />
      }
      @case ('serial-output-mapping-editor') {
        <app-serial-output-mapping-editor [mapping]="asSerialOut()" [editIndex]="index"
                                          [allMappings]="asSerialOutList()"
                                          [serialInputMappings]="scope.value().serialInputMappings"
                                          idPrefix="wzSerialOut" />
      }
      @case ('midi-output-mapping-editor') {
        <app-midi-output-mapping-editor [mapping]="asMidiOut()" [editIndex]="index"
                                        [allMappings]="asMidiOutList()"
                                        [midiInputMappings]="scope.value().midiInputMappings"
                                        [midiDevices]="midiOutput.midiOutputs()" idPrefix="wzMidiOut"
                                        [showTestButton]="false" />
      }
    }
  `,
  styles: [':host { display: block; }'],
})
export class MappingPageComponent implements OnInit {
  readonly midiInput = inject(MidiInputService);
  readonly midiOutput = inject(MidiOutputService);
  readonly scope = inject(SETTINGS_SCOPE);

  /** Mapping kind id (`keyboard-mapping-editor`, `midi-input-mapping-editor`, `midi-output-mapping-editor`) */
  @Input({ required: true }) kind = '';

  /** The mapping as stored in the draft */
  @Input({ required: true }) mapping: unknown;

  /** Position of the mapping in its list */
  @Input() index = 0;

  /** The whole list, for duplicate detection */
  @Input() allMappings: readonly unknown[] = [];

  @ViewChild(KeyboardMappingEditorComponent) private keyboard?: KeyboardMappingEditorComponent;
  @ViewChild(MidiInputMappingEditorComponent) private midi?: MidiInputMappingEditorComponent;
  @ViewChild(MidiOutputMappingEditorComponent) private midiOut?: MidiOutputMappingEditorComponent;

  @ViewChild(SerialInputMappingEditorComponent) private serial?: SerialInputMappingEditorComponent;

  @ViewChild(SerialOutputMappingEditorComponent) private serialOut?: SerialOutputMappingEditorComponent;

  private editor() { return this.keyboard ?? this.midi ?? this.midiOut ?? this.serial ?? this.serialOut; }

  /** Like the Settings popup: fill the MIDI device list when a MIDI page opens. */
  ngOnInit(): void {
    if (this.kind === 'midi-input-mapping-editor' && this.midiInput.midiInputs().length === 0) {
      void this.midiInput.enumerateDevices();
    }
    if (this.kind === 'midi-output-mapping-editor' && this.midiOutput.midiOutputs().length === 0) {
      void this.midiOutput.enumerateDevices();
    }
  }

  asKeyboard(): KeyboardInputMapping { return this.mapping as KeyboardInputMapping; }
  asKeyboardList(): KeyboardInputMapping[] { return this.allMappings as KeyboardInputMapping[]; }
  asMidi(): MidiInputMapping { return this.mapping as MidiInputMapping; }
  asMidiList(): MidiInputMapping[] { return this.allMappings as MidiInputMapping[]; }
  asSerial(): SerialInputMapping { return this.mapping as SerialInputMapping; }
  asSerialList(): SerialInputMapping[] { return this.allMappings as SerialInputMapping[]; }
  asSerialOut(): SerialOutputMapping { return this.mapping as SerialOutputMapping; }
  asSerialOutList(): SerialOutputMapping[] { return this.allMappings as SerialOutputMapping[]; }
  asMidiOut(): MidiOutputMapping { return this.mapping as MidiOutputMapping; }
  asMidiOutList(): MidiOutputMapping[] { return this.allMappings as MidiOutputMapping[]; }

  /** Validate the editor; returns the whole mapping to store, or null (the editor shows why). */
  commit(): unknown | null {
    const built = this.editor()?.build();
    return built ? { ...(this.mapping as object), ...built } : null;
  }

  /** True when the fields differ from the stored mapping (nothing validated, nothing stored). */
  isDirty(): boolean {
    const fields = this.editor()?.fields() as Record<string, unknown> | undefined;
    if (!fields) return false;
    const stored = this.mapping as Record<string, unknown>;
    return Object.keys(fields).some(key => JSON.stringify(fields[key] ?? '') !== JSON.stringify(stored[key] ?? ''));
  }

  /** Put the editor's fields back to the stored mapping. */
  reset(): void {
    this.editor()?.reset();
  }
}
