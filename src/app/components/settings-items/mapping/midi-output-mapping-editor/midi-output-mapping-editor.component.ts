/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MidiInputMapping } from '../../midi-input/midi-input-item.model';
import { MidiOutputMapping, MidiOutputMode } from '../../midi-output/midi-output-item.model';
import { OutputForward } from '../../../../services/settings-common';
import { MidiOutputService, midiOutputNoteName } from '../../../../services/midi-output.service';
import { NoteField } from '../midi-input-mapping-editor/midi-input-mapping-editor.component';

/** Result of a validated MIDI output mapping edit (one mapping, ready to store). */
export interface MidiOutputEditSaveEvent {
  deviceId: string;
  channel: number;
  forward: OutputForward;
  mode: MidiOutputMode;
  value: number;
  dahValue: number;
  relayInputIndices: number[];
  relaySuppressOtherInputs: boolean;
}

/**
 * The fields of one MIDI output mapping: device, channel, RX/TX forwarding,
 * mode, note pickers, relay from MIDI inputs and a test button. Frameless, so
 * Settings shows it in a popup and the wizard flat on a step. The host calls
 * `build()` to validate and get the mapping values (null if invalid).
 * Overlapping notes are only a warning, as before.
 */
@Component({
  selector: 'app-midi-output-mapping-editor',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './midi-output-mapping-editor.component.html',
  styles: [':host { display: block; }'],
})
export class MidiOutputMappingEditorComponent implements OnChanges {
  /** The mapping to start from */
  @Input() mapping: MidiOutputMapping = {
    enabled: true, deviceId: '', channel: 1,
    forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for a new one) */
  @Input() editIndex = -1;

  /** Available MIDI output devices */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All output mappings, for the overlap warning */
  @Input() allMappings: MidiOutputMapping[] = [];

  /** MIDI input mappings that can be relayed through this output */
  @Input() midiInputMappings: MidiInputMapping[] = [];

  /** Prefix that keeps element ids unique when two editors exist at once */
  @Input() idPrefix = 'midiOut';

  /** Settings can test a live output; the wizard edits a draft that is not active yet. */
  @Input() showTestButton = true;

  editDeviceId = '';
  editChannel = 1;
  editForward: OutputForward = 'tx';
  editMode: MidiOutputMode = 'straightKey';
  editRelayInputIndices: number[] = [];
  editRelaySuppressOtherInputs = false;

  readonly dit = new NoteField(80);
  readonly dah = new NoteField(84);

  error = '';

  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  constructor(public midiOutput: MidiOutputService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapping']) this.load();
  }

  private load(): void {
    const m = this.mapping;
    this.editDeviceId = m.deviceId;
    this.editChannel = m.channel;
    this.editForward = m.forward;
    this.editMode = m.mode;
    this.editRelayInputIndices = [...(m.relayInputIndices || [])];
    this.editRelaySuppressOtherInputs = m.relaySuppressOtherInputs ?? false;
    this.dit.set(m.value >= 0 ? m.value : 80);
    this.dah.set(m.dahValue >= 0 ? m.dahValue : 84);
    this.error = '';
  }

  /** The fields as they stand now (no validation), to tell whether anything was changed. */
  fields(): MidiOutputEditSaveEvent {
    const paddle = this.editMode === 'paddle';
    return {
      deviceId: this.editDeviceId, channel: this.editChannel, forward: this.editForward,
      mode: this.editMode, value: this.dit.value, dahValue: paddle ? this.dah.value : -1,
      relayInputIndices: [...this.editRelayInputIndices],
      relaySuppressOtherInputs: this.editRelaySuppressOtherInputs,
    };
  }

  /** Put the fields back to the `mapping` input. */
  reset(): void {
    this.load();
  }

  /** Human-readable note */
  noteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiOutputNoteName(note)} (${note})`;
  }

  /** Send a 1-second pulse on the dit/straight-key note (needs a connected device). */
  async testMapping(): Promise<void> {
    await this.midiOutput.testMapping(this.dit.value, this.editChannel, this.editDeviceId);
  }

  /** Validate the fields; returns the mapping values, or null with `error` set. */
  build(): MidiOutputEditSaveEvent | null {
    const paddle = this.editMode === 'paddle';
    const value = this.dit.value;
    const dahValue = paddle ? this.dah.value : -1;
    if (value < 0 || value > 127) {
      this.error = 'MIDI note value must be 0–127.';
      return null;
    }
    if (paddle && (dahValue < 0 || dahValue > 127)) {
      this.error = 'Dah paddle MIDI note value must be 0–127.';
      return null;
    }
    this.error = '';
    return this.fields();
  }

  /** Non-blocking warning for equal paddle notes or notes shared with another mapping. */
  get warning(): string {
    const paddle = this.editMode === 'paddle';
    const value = this.dit.value;
    const dahValue = paddle ? this.dah.value : -1;
    if (paddle && value === dahValue) {
      return 'Dit and dah paddle notes are the same. This is allowed but both elements will be indistinguishable on the MIDI bus.';
    }
    const myNotes = dahValue >= 0 ? [value, dahValue] : [value];
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      const deviceOverlap = !this.editDeviceId || !other.deviceId || this.editDeviceId === other.deviceId;
      if (!deviceOverlap || this.editChannel !== other.channel) continue;
      const otherNotes = [other.value];
      if (other.mode === 'paddle' && other.dahValue >= 0) otherNotes.push(other.dahValue);
      for (const n of myNotes) {
        if (otherNotes.includes(n)) {
          return `Note ${midiOutputNoteName(n)} (${n}) overlaps with mapping #${i + 1} on the same device and channel. This is allowed but may cause unexpected behaviour if both mappings fire simultaneously.`;
        }
      }
    }
    return '';
  }

  /** Whether a MIDI input mapping's source is compatible with the forward setting */
  isInputCompatible(input: MidiInputMapping): boolean {
    return this.editForward === 'both' || input.source === this.editForward;
  }

  /** Add or remove a MIDI input mapping index in the relay list */
  toggleRelayInput(index: number): void {
    const pos = this.editRelayInputIndices.indexOf(index);
    if (pos >= 0) this.editRelayInputIndices.splice(pos, 1);
    else this.editRelayInputIndices.push(index);
  }

  /** Short label for a MIDI input mapping */
  inputMappingLabel(m: MidiInputMapping, index: number): string {
    const mode = m.mode === 'straightKey' ? 'Straight' : 'Paddle';
    const note = m.value >= 0 ? midiOutputNoteName(m.value) : '—';
    return `#${index + 1} ${mode} ${note} [${m.source.toUpperCase()}]`;
  }
}
