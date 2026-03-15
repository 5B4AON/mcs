/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MidiOutputMapping, MidiOutputMode, MidiInputMapping, OutputForward } from '../../services/settings.service';
import { MidiOutputService, midiOutputNoteName } from '../../services/midi-output.service';

/**
 * Result payload emitted when the user saves a MIDI output mapping.
 */
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
 * MIDI Output Edit Modal Component
 *
 * A modal dialog for creating or editing a single MIDI output mapping.
 * Contains fields for device, channel, mode (straight key vs paddle),
 * MIDI note values with note/octave pickers and raw value input,
 * an override-WPM checkbox, and a test output button.
 * Includes duplicate detection that flags device/channel/note clashes
 * with other mappings.
 */
@Component({
  selector: 'app-midi-output-edit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './midi-output-edit-modal.component.html',
  styleUrls: ['./midi-output-edit-modal.component.css'],
})
export class MidiOutputEditModalComponent implements OnInit {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: MidiOutputMapping = {
    enabled: true, deviceId: '', channel: 1,
    forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** Available MIDI output devices (passed from parent) */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: MidiOutputMapping[] = [];

  /** All MIDI input mappings — used for relay source selection */
  @Input() midiInputMappings: MidiInputMapping[] = [];

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<MidiOutputEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Editable fields */
  editDeviceId = '';
  editChannel = 1;
  editForward: OutputForward = 'tx';
  editMode: MidiOutputMode = 'straightKey';
  editValue = 80;
  editDahValue = 84;

  /** Raw MIDI value inputs (string for binding) */
  editValueRaw = '80';
  editDahValueRaw = '84';

  /** Relay: indices of MIDI input mappings to relay through this output */
  editRelayInputIndices: number[] = [];

  /** When true, only relay sources drive this output */
  editRelaySuppressOtherInputs = false;

  /** Tracked note-name index and octave for dropdowns */
  editValueNote = 0;
  editValueOctave = 4;
  editDahNote = 0;
  editDahOctave = 4;

  /** Validation error message */
  error = '';

  /** Non-blocking warning (e.g. duplicate note) */
  warning = '';

  /** Note names for dropdown */
  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  /** Octave range for dropdown (-1 to 9) */
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** MIDI channel numbers 1–16 for the channel select dropdown */
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  constructor(public midiOutput: MidiOutputService) {}

  ngOnInit(): void {
    this.editDeviceId = this.mapping.deviceId;
    this.editChannel = this.mapping.channel;
    this.editForward = this.mapping.forward;
    this.editMode = this.mapping.mode;
    this.editValue = this.mapping.value >= 0 ? this.mapping.value : 80;
    this.editDahValue = this.mapping.dahValue >= 0 ? this.mapping.dahValue : 84;
    this.editValueRaw = String(this.editValue);
    this.editDahValueRaw = String(this.editDahValue);
    this.editValueNote = this.getNoteIndex(this.editValue);
    this.editValueOctave = this.getOctave(this.editValue);
    this.editDahNote = this.getNoteIndex(this.editDahValue);
    this.editDahOctave = this.getOctave(this.editDahValue);
    this.editRelayInputIndices = [...(this.mapping.relayInputIndices || [])];
    this.editRelaySuppressOtherInputs = this.mapping.relaySuppressOtherInputs ?? false;
    this.error = '';
    this.warning = '';
    this.updateWarning();
  }

  /** Get the note name component (0-11) from a MIDI note number */
  getNoteIndex(midiNote: number): number {
    return midiNote % 12;
  }

  /** Get the octave from a MIDI note number */
  getOctave(midiNote: number): number {
    return Math.floor(midiNote / 12) - 1;
  }

  /** Convert note index + octave to MIDI note number */
  toMidiNote(noteIndex: number, octave: number): number {
    return (octave + 1) * 12 + noteIndex;
  }

  /** Display a MIDI note as human-readable name */
  noteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiOutputNoteName(note)} (${note})`;
  }

  /** Handle note name dropdown change for value field */
  onValueNoteChange(): void {
    this.editValue = this.clampMidi(this.toMidiNote(this.editValueNote, this.editValueOctave));
    this.editValueRaw = String(this.editValue);
    this.updateWarning();
  }

  /** Handle octave dropdown change for value field */
  onValueOctaveChange(): void {
    this.editValue = this.clampMidi(this.toMidiNote(this.editValueNote, this.editValueOctave));
    this.editValueRaw = String(this.editValue);
    this.updateWarning();
  }

  /** Handle raw MIDI value input for value field */
  onValueRawChange(): void {
    const v = parseInt(this.editValueRaw, 10);
    if (!isNaN(v) && v >= 0 && v <= 127) {
      this.editValue = v;
      this.editValueNote = this.getNoteIndex(v);
      this.editValueOctave = this.getOctave(v);
    }
    this.updateWarning();
  }

  /** Handle note name dropdown change for dah value field */
  onDahNoteChange(): void {
    this.editDahValue = this.clampMidi(this.toMidiNote(this.editDahNote, this.editDahOctave));
    this.editDahValueRaw = String(this.editDahValue);
    this.updateWarning();
  }

  /** Handle octave dropdown change for dah value field */
  onDahOctaveChange(): void {
    this.editDahValue = this.clampMidi(this.toMidiNote(this.editDahNote, this.editDahOctave));
    this.editDahValueRaw = String(this.editDahValue);
    this.updateWarning();
  }

  /** Handle raw MIDI value input for dah value field */
  onDahRawChange(): void {
    const v = parseInt(this.editDahValueRaw, 10);
    if (!isNaN(v) && v >= 0 && v <= 127) {
      this.editDahValue = v;
      this.editDahNote = this.getNoteIndex(v);
      this.editDahOctave = this.getOctave(v);
    }
    this.updateWarning();
  }

  /** Test this mapping — sends a 1-second pulse on the configured note(s) */
  async testMapping(): Promise<void> {
    const channel = this.editChannel;
    const deviceId = this.editDeviceId;
    if (this.editMode === 'straightKey') {
      await this.midiOutput.testMapping(this.editValue, channel, deviceId);
    } else {
      await this.midiOutput.testMapping(this.editValue, channel, deviceId);
    }
  }

  /** Save the edited mapping after validation */
  save(): void {
    const value = this.editValue;
    const dahValue = this.editMode === 'paddle' ? this.editDahValue : -1;

    if (value < 0 || value > 127) {
      this.error = 'MIDI note value must be 0–127.';
      return;
    }
    if (this.editMode === 'paddle' && (dahValue < 0 || dahValue > 127)) {
      this.error = 'Dah paddle MIDI note value must be 0–127.';
      return;
    }
    if (this.editMode === 'paddle' && value === dahValue) {
      this.error = 'Dit and dah paddle notes must be different.';
      return;
    }

    this.saved.emit({
      deviceId: this.editDeviceId,
      channel: this.editChannel,
      forward: this.editForward,
      mode: this.editMode,
      value,
      dahValue,
      relayInputIndices: this.editRelayInputIndices,
      relaySuppressOtherInputs: this.editRelaySuppressOtherInputs,
    });
  }

  /**
   * Check whether any note in this mapping conflicts with an existing mapping's
   * notes on the same device + channel combination. Returns an error message
   * if a conflict is found, or empty string if clear.
   *
   * Two notes conflict when they share the same MIDI note number AND their
   * device/channel filters overlap (both 'any', or same specific device; both
   * same channel). Returns a warning message or empty string.
   */
  private checkDuplicates(value: number, dahValue: number): string {
    const myNotes = [value];
    if (dahValue >= 0) myNotes.push(dahValue);

    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue; // skip self
      const other = this.allMappings[i];

      // Device overlap: both 'any', or either is 'any', or same specific ID
      const deviceOverlap = !this.editDeviceId || !other.deviceId
        || this.editDeviceId === other.deviceId;
      if (!deviceOverlap) continue;

      // Channel overlap: same channel (output channels are always 1-16, no omni)
      const channelOverlap = this.editChannel === other.channel;
      if (!channelOverlap) continue;

      // Collect the other mapping's notes
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

  /** Cancel without saving */
  cancel(): void {
    this.cancelled.emit();
  }

  /** Delete this mapping */
  delete(): void {
    this.deleted.emit();
  }

  /** Clamp a MIDI note to valid range */
  private clampMidi(n: number): number {
    return Math.max(0, Math.min(127, n));
  }

  /** Recompute the non-blocking duplicate warning */
  updateWarning(): void {
    const dahValue = this.editMode === 'paddle' ? this.editDahValue : -1;
    this.warning = this.checkDuplicates(this.editValue, dahValue);
  }

  /** Whether a MIDI input mapping's source is compatible with the output forward setting */
  isInputCompatible(input: MidiInputMapping): boolean {
    return this.editForward === 'both' || input.source === this.editForward;
  }

  /** Toggle a MIDI input mapping index in the relay list */
  toggleRelayInput(index: number): void {
    const pos = this.editRelayInputIndices.indexOf(index);
    if (pos >= 0) {
      this.editRelayInputIndices.splice(pos, 1);
    } else {
      this.editRelayInputIndices.push(index);
    }
  }

  /** Short label for a MIDI input mapping */
  inputMappingLabel(m: MidiInputMapping, index: number): string {
    const mode = m.mode === 'straightKey' ? 'Straight' : 'Paddle';
    const note = m.value >= 0 ? midiOutputNoteName(m.value) : '—';
    const src = m.source.toUpperCase();
    return `#${index + 1} ${mode} ${note} [${src}]`;
  }
}
