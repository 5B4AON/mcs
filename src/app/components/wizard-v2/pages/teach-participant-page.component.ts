/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyboardInputMapping, MidiInputMapping, SerialInputMapping } from '../../../services/settings.service';
import { MidiInputService } from '../../../services/midi-input.service';
import { SerialKeyInputService } from '../../../services/serial-key-input.service';
import { KeyboardMappingEditorComponent } from '../../settings-items/mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';
import { MidiInputMappingEditorComponent } from '../../settings-items/mapping/midi-input-mapping-editor/midi-input-mapping-editor.component';
import { SerialInputMappingEditorComponent } from '../../settings-items/mapping/serial-input-mapping-editor/serial-input-mapping-editor.component';
import { SETTINGS_SCOPE } from '../../settings-items/settings-scope';
import { TeachInputType, TeachParticipantProfile } from '../flows/teach-participant.model';

/**
 * One classroom participant page. It hosts the same mapping editors used by
 * Settings, while keeping each profile in wizard answers until Apply.
 */
@Component({
  selector: 'app-teach-participant-page',
  standalone: true,
  imports: [
    FormsModule,
    KeyboardMappingEditorComponent,
    MidiInputMappingEditorComponent,
    SerialInputMappingEditorComponent,
  ],
  templateUrl: './teach-participant-page.component.html',
  styles: [`
    :host { display: block; }
    .wizard-field {
      display: flex;
      flex-direction: column;
      gap: .3rem;
      margin: .6rem 0;
      font-size: .9rem;
    }
    .wizard-field select {
      padding: .45rem .6rem;
      font: inherit;
      color: #eef;
      background: #232a45;
      border: 1px solid #3f4d78;
      border-radius: 6px;
    }
  `],
})
export class TeachParticipantPageComponent implements OnInit, OnChanges {
  @Input({ required: true }) profile!: TeachParticipantProfile;
  @Input() profiles: TeachParticipantProfile[] = [];
  @Input() index = 0;

  @ViewChild(KeyboardMappingEditorComponent) private keyboard?: KeyboardMappingEditorComponent;
  @ViewChild(MidiInputMappingEditorComponent) private midi?: MidiInputMappingEditorComponent;
  @ViewChild(SerialInputMappingEditorComponent) private serial?: SerialInputMappingEditorComponent;

  readonly midiInput = inject(MidiInputService);
  readonly serialInput = inject(SerialKeyInputService);
  readonly scope = inject(SETTINGS_SCOPE);
  readonly midiSupported = this.midiInput.supported;
  readonly serialSupported = 'serial' in navigator && !/android/i.test(navigator.userAgent);

  inputType: TeachInputType = 'keyboard';
  private startingProfile!: TeachParticipantProfile;
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profile']) this.reset();
  }

  ngOnInit(): void {
    if (this.midiInput.midiInputs().length === 0) void this.midiInput.enumerateDevices();
    if (this.serialSupported) void this.serialInput.refreshPorts();
  }

  /** Current mappings plus other unsaved profiles, for editor conflict checks. */
  keyboardMappings(): KeyboardInputMapping[] {
    return [
      ...this.scope.value().keyboardInputMappings,
      ...this.profiles.filter(profile => profile !== this.profile && profile.inputType === 'keyboard')
        .map(profile => profile.keyboard),
    ];
  }

  midiMappings(): MidiInputMapping[] {
    return [
      ...this.scope.value().midiInputMappings,
      ...this.profiles.filter(profile => profile !== this.profile && profile.inputType === 'midi')
        .map(profile => profile.midi),
    ];
  }

  serialMappings(): SerialInputMapping[] {
    return [
      ...this.scope.value().serialInputMappings,
      ...this.profiles.filter(profile => profile !== this.profile && profile.inputType === 'serial')
        .map(profile => profile.serial),
    ];
  }

  /** Save and validate the active shared editor. */
  build(): TeachParticipantProfile | null {
    const result = structuredClone(this.profile);
    result.inputType = this.inputType;
    if (this.inputType === 'keyboard') {
      const fields = this.keyboard?.build();
      if (!fields) return null;
      result.keyboard = { ...result.keyboard, ...fields };
      if (!result.keyboard.name.trim()) return this.fail('Enter a display name for this participant.');
    } else if (this.inputType === 'midi') {
      const fields = this.midi?.build();
      if (!fields) return null;
      result.midi = { ...result.midi, ...fields };
      if (!result.midi.name.trim()) return this.fail('Enter a display name for this participant.');
    } else if (this.inputType === 'serial') {
      const fields = this.serial?.build();
      if (!fields) return null;
      result.serial = { ...result.serial, ...fields };
      if (!result.serial.name.trim()) return this.fail('Enter a display name for this participant.');
      if (result.serial.portIndex < 0) return this.fail('Choose a serial device for this participant.');
    }
    this.error = '';
    return result;
  }

  /** Keep incomplete edits when navigating backward; validation happens on Next. */
  fields(): TeachParticipantProfile {
    const result = structuredClone(this.profile);
    result.inputType = this.inputType;
    if (this.inputType === 'keyboard' && this.keyboard) {
      result.keyboard = { ...result.keyboard, ...this.keyboard.fields() };
    } else if (this.inputType === 'midi' && this.midi) {
      result.midi = { ...result.midi, ...this.midi.fields() };
    } else if (this.inputType === 'serial' && this.serial) {
      result.serial = { ...result.serial, ...this.serial.fields() };
    }
    return result;
  }

  /** Whether the active editor contains unsaved wizard-answer changes. */
  isDirty(): boolean {
    return JSON.stringify(this.fields()) !== JSON.stringify(this.startingProfile);
  }

  /** Restore the profile supplied by the workflow engine. */
  reset(): void {
    if (!this.profile) return;
    this.startingProfile = structuredClone(this.profile);
    this.inputType = this.profile.inputType;
    this.error = '';
    this.keyboard?.reset();
    this.midi?.reset();
    this.serial?.reset();
  }

  private fail(message: string): null {
    this.error = message;
    return null;
  }
}
