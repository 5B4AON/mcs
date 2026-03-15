/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MidiInputMapping, MidiInputMode, DecoderSource } from '../../services/settings.service';
import { MidiInputService, MidiLearnResult, midiNoteName } from '../../services/midi-input.service';

/**
 * Result payload emitted when the user saves a MIDI input mapping.
 */
export interface MidiInputEditSaveEvent {
  deviceId: string;
  channel: number;
  source: DecoderSource;
  mode: MidiInputMode;
  value: number;
  dahValue: number;
  reversePaddles: boolean;
  name: string;
  color: string;
}

/**
 * MIDI Input Edit Modal Component
 *
 * A modal dialog for creating or editing a single MIDI input mapping.
 * Contains fields for device, channel, decoder source, mode (straight
 * key vs paddle), MIDI note values with note/octave pickers and raw
 * value input, an auto-detect button that captures via MIDI learn,
 * and a reverse paddles checkbox for paddle mode.
 */
@Component({
  selector: 'app-midi-input-edit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './midi-input-edit-modal.component.html',
  styleUrls: ['./midi-input-edit-modal.component.css'],
})
export class MidiInputEditModalComponent implements OnInit, OnDestroy {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: MidiInputMapping = {
    enabled: true, deviceId: '', channel: 0, source: 'rx',
    mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false,
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** Available MIDI input devices (passed from parent which has the service) */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: MidiInputMapping[] = [];

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<MidiInputEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Editable fields */
  editDeviceId = '';
  editChannel = 0;
  editSource: DecoderSource = 'rx';
  editMode: MidiInputMode = 'straightKey';
  editValue = 60;
  editDahValue = 64;
  editReversePaddles = false;
  editName = '';
  editColor = '';

  /** Raw MIDI value inputs (string for binding) */
  editValueRaw = '60';
  editDahValueRaw = '64';

  /** Tracked note-name index and octave for dropdowns */
  editValueNote = 0;
  editValueOctave = 4;
  editDahNote = 0;
  editDahOctave = 4;

  /** Which field is currently in auto-detect/learn mode */
  capturing: 'value' | 'dahValue' | null = null;

  /** Validation error message */
  error = '';

  /** Note names for dropdown */
  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  /** Octave range for dropdown (-1 to 9) */
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** MIDI channel numbers 1–16 for the channel select dropdown */
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  constructor(private midiInput: MidiInputService) {}

  ngOnInit(): void {
    this.editDeviceId = this.mapping.deviceId;
    this.editChannel = this.mapping.channel;
    this.editSource = this.mapping.source;
    this.editMode = this.mapping.mode;
    this.editValue = this.mapping.value >= 0 ? this.mapping.value : 60;
    this.editDahValue = this.mapping.dahValue >= 0 ? this.mapping.dahValue : 64;
    this.editReversePaddles = this.mapping.reversePaddles;
    this.editName = this.mapping.name || '';
    this.editColor = this.mapping.color || '';
    this.editValueRaw = String(this.editValue);
    this.editDahValueRaw = String(this.editDahValue);
    this.editValueNote = this.getNoteIndex(this.editValue);
    this.editValueOctave = this.getOctave(this.editValue);
    this.editDahNote = this.getNoteIndex(this.editDahValue);
    this.editDahOctave = this.getOctave(this.editDahValue);
    this.error = '';
  }

  ngOnDestroy(): void {
    if (this.capturing) {
      this.midiInput.cancelLearn();
      this.capturing = null;
    }
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

  /** Display a MIDI note as human-readable name with channel prefix */
  noteDisplay(note: number): string {
    if (note < 0) return '(none)';
    const ch = this.editChannel > 0 ? `Ch ${this.editChannel} / ` : '';
    return `${ch}${midiNoteName(note)} (${note})`;
  }

  /** Handle note name dropdown change for value field */
  onValueNoteChange(): void {
    this.editValue = this.clampMidi(this.toMidiNote(this.editValueNote, this.editValueOctave));
    this.editValueRaw = String(this.editValue);
  }

  /** Handle octave dropdown change for value field */
  onValueOctaveChange(): void {
    this.editValue = this.clampMidi(this.toMidiNote(this.editValueNote, this.editValueOctave));
    this.editValueRaw = String(this.editValue);
  }

  /** Handle raw MIDI value input for value field */
  onValueRawChange(): void {
    const v = parseInt(this.editValueRaw, 10);
    if (!isNaN(v) && v >= 0 && v <= 127) {
      this.editValue = v;
      this.editValueNote = this.getNoteIndex(v);
      this.editValueOctave = this.getOctave(v);
    }
  }

  /** Handle note name dropdown change for dah value field */
  onDahNoteChange(): void {
    this.editDahValue = this.clampMidi(this.toMidiNote(this.editDahNote, this.editDahOctave));
    this.editDahValueRaw = String(this.editDahValue);
  }

  /** Handle octave dropdown change for dah value field */
  onDahOctaveChange(): void {
    this.editDahValue = this.clampMidi(this.toMidiNote(this.editDahNote, this.editDahOctave));
    this.editDahValueRaw = String(this.editDahValue);
  }

  /** Handle raw MIDI value input for dah value field */
  onDahRawChange(): void {
    const v = parseInt(this.editDahValueRaw, 10);
    if (!isNaN(v) && v >= 0 && v <= 127) {
      this.editDahValue = v;
      this.editDahNote = this.getNoteIndex(v);
      this.editDahOctave = this.getOctave(v);
    }
  }

  /** Start auto-detect (MIDI learn) for a field */
  onAutoDetect(field: 'value' | 'dahValue'): void {
    if (this.capturing === field) {
      this.midiInput.cancelLearn();
      this.capturing = null;
      return;
    }
    this.capturing = field;
    this.midiInput.startLearn((result: MidiLearnResult) => {
      if (field === 'value') {
        this.editValue = result.note;
        this.editValueRaw = String(result.note);
        this.editValueNote = this.getNoteIndex(result.note);
        this.editValueOctave = this.getOctave(result.note);
      } else {
        this.editDahValue = result.note;
        this.editDahValueRaw = String(result.note);
        this.editDahNote = this.getNoteIndex(result.note);
        this.editDahOctave = this.getOctave(result.note);
      }
      // Auto-fill device if not yet set; always update channel
      if (!this.editDeviceId && result.deviceId) {
        this.editDeviceId = result.deviceId;
      }
      if (result.channel > 0) {
        this.editChannel = result.channel;
      }
      this.capturing = null;
    });
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

    // Duplicate detection: device + channel + note must be unique
    const dupError = this.checkDuplicates(value, dahValue);
    if (dupError) {
      this.error = dupError;
      return;
    }

    this.saved.emit({
      deviceId: this.editDeviceId,
      channel: this.editChannel,
      source: this.editSource,
      mode: this.editMode,
      value,
      dahValue,
      reversePaddles: this.editMode === 'paddle' ? this.editReversePaddles : false,
      name: this.editName.trim(),
      color: this.editColor,
    });
  }

  /**
   * Check whether any note in this mapping conflicts with an existing mapping's
   * notes on the same device + channel combination. Returns an error message
   * if a conflict is found, or empty string if clear.
   *
   * Two notes conflict when they share the same MIDI note number AND their
   * device/channel filters overlap (both 'any', or same specific device; both
   * omni, or same specific channel).
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

      // Channel overlap: both omni, or either is omni, or same channel
      const channelOverlap = this.editChannel === 0 || other.channel === 0
        || this.editChannel === other.channel;
      if (!channelOverlap) continue;

      // Collect the other mapping's notes
      const otherNotes = [other.value];
      if (other.mode === 'paddle' && other.dahValue >= 0) otherNotes.push(other.dahValue);

      for (const n of myNotes) {
        if (otherNotes.includes(n)) {
          return `Note ${midiNoteName(n)} (${n}) conflicts with mapping #${i + 1}. Use a different device, channel, or note.`;
        }
      }
    }
    return '';
  }

  /** Cancel without saving */
  cancel(): void {
    if (this.capturing) {
      this.midiInput.cancelLearn();
      this.capturing = null;
    }
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
}
