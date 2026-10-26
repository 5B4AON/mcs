/**
 * Morse Code Studio
 */

import { Component, Input, OnInit, ViewChild, inject } from '@angular/core';
import { KeyboardInputMapping, MidiInputMapping } from '../../../services/settings.service';
import { MidiInputService } from '../../../services/midi-input.service';
import { KeyboardMappingEditorComponent } from '../../settings-items/mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';
import { MidiInputMappingEditorComponent } from '../../settings-items/mapping/midi-input-mapping-editor/midi-input-mapping-editor.component';

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
  imports: [KeyboardMappingEditorComponent, MidiInputMappingEditorComponent],
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
    }
  `,
  styles: [':host { display: block; }'],
})
export class MappingPageComponent implements OnInit {
  readonly midiInput = inject(MidiInputService);

  /** Mapping kind id (`keyboard-mapping-editor`, `midi-input-mapping-editor`) */
  @Input({ required: true }) kind = '';

  /** The mapping as stored in the draft */
  @Input({ required: true }) mapping: unknown;

  /** Position of the mapping in its list */
  @Input() index = 0;

  /** The whole list, for duplicate detection */
  @Input() allMappings: readonly unknown[] = [];

  @ViewChild(KeyboardMappingEditorComponent) private keyboard?: KeyboardMappingEditorComponent;
  @ViewChild(MidiInputMappingEditorComponent) private midi?: MidiInputMappingEditorComponent;

  /** Like the Settings popup: fill the MIDI device list when a MIDI page opens. */
  ngOnInit(): void {
    if (this.kind === 'midi-input-mapping-editor' && this.midiInput.midiInputs().length === 0) {
      void this.midiInput.enumerateDevices();
    }
  }

  asKeyboard(): KeyboardInputMapping { return this.mapping as KeyboardInputMapping; }
  asKeyboardList(): KeyboardInputMapping[] { return this.allMappings as KeyboardInputMapping[]; }
  asMidi(): MidiInputMapping { return this.mapping as MidiInputMapping; }
  asMidiList(): MidiInputMapping[] { return this.allMappings as MidiInputMapping[]; }

  /** Validate the editor; returns the whole mapping to store, or null (the editor shows why). */
  commit(): unknown | null {
    const built = (this.keyboard ?? this.midi)?.build();
    return built ? { ...(this.mapping as object), ...built } : null;
  }

  /** True when the fields differ from the stored mapping (nothing validated, nothing stored). */
  isDirty(): boolean {
    const fields = (this.keyboard ?? this.midi)?.fields() as Record<string, unknown> | undefined;
    if (!fields) return false;
    const stored = this.mapping as Record<string, unknown>;
    return Object.keys(fields).some(key => (fields[key] ?? '') !== (stored[key] ?? ''));
  }

  /** Put the editor's fields back to the stored mapping. */
  reset(): void {
    (this.keyboard ?? this.midi)?.reset();
  }
}
