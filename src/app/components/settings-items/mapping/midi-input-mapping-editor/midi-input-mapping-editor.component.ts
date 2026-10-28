/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, OnDestroy, SimpleChanges, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MidiInputMapping, MidiInputMode, DecoderSource } from '../../../../services/settings.service';
import { MidiInputService, MidiLearnResult, midiNoteName } from '../../../../services/midi-input.service';
import { CaptureSlot } from '../capture-slot';
import { DetectButtonComponent } from '../detect-button/detect-button.component';
import { MappingIdentityFieldsComponent } from '../identity-fields/mapping-identity-fields.component';

/** Result of a validated MIDI input mapping edit (one mapping, ready to store). */
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
 * One MIDI note as the editor shows it: the note number plus the three ways
 * to change it (note name, octave, raw number), kept in sync with each other.
 */
export class NoteField {
  value: number;
  raw: string;
  note: number;
  octave: number;

  constructor(value: number) {
    this.value = value;
    this.raw = String(value);
    this.note = value % 12;
    this.octave = Math.floor(value / 12) - 1;
  }

  /** The note name or octave dropdown changed. */
  fromPickers(): void {
    this.value = Math.max(0, Math.min(127, (this.octave + 1) * 12 + this.note));
    this.raw = String(this.value);
  }

  /** The raw number box changed; ignored while it is not a valid 0–127 number. */
  fromRaw(): void {
    const v = parseInt(this.raw, 10);
    if (isNaN(v) || v < 0 || v > 127) return;
    this.set(v);
  }

  /** Set a note number and refresh every representation. */
  set(v: number): void {
    this.value = v;
    this.raw = String(v);
    this.note = v % 12;
    this.octave = Math.floor(v / 12) - 1;
  }
}

/**
 * The fields of one MIDI input mapping: device, channel, RX/TX use, mode,
 * note pickers with MIDI-learn "Detect", name and colour. Frameless, so
 * Settings shows it in a popup and the wizard flat on a step. The host calls
 * `build()` to validate and get the mapping values (null if invalid).
 */
@Component({
  selector: 'app-midi-input-mapping-editor',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, DetectButtonComponent, MappingIdentityFieldsComponent],
  templateUrl: './midi-input-mapping-editor.component.html',
  styles: [':host { display: block; }'],
})
export class MidiInputMappingEditorComponent implements OnChanges, OnDestroy {
  /** The mapping to start from */
  @Input() mapping: MidiInputMapping = {
    enabled: true, deviceId: '', channel: 0, source: 'rx',
    mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false,
    name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for a new one) */
  @Input() editIndex = -1;

  /** Available MIDI input devices */
  @Input() midiDevices: { id: string; name: string }[] = [];

  /** All mappings, for duplicate detection */
  @Input() allMappings: MidiInputMapping[] = [];

  /** Prefix that keeps element ids unique when two editors exist at once */
  @Input() idPrefix = 'midiIn';

  editDeviceId = '';
  editChannel = 0;
  editSource: DecoderSource = 'rx';
  editMode: MidiInputMode = 'straightKey';
  editReversePaddles = false;
  editName = '';
  editColor = '';

  readonly dit = new NoteField(60);
  readonly dah = new NoteField(64);

  /** Which note field is waiting for a MIDI key press */
  readonly capture = new CaptureSlot<'value' | 'dahValue'>();

  error = '';

  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  constructor(private midiInput: MidiInputService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapping']) this.load();
  }

  ngOnDestroy(): void {
    this.capture.cancel();
  }

  private load(): void {
    const m = this.mapping;
    this.editDeviceId = m.deviceId;
    this.editChannel = m.channel;
    this.editSource = m.source;
    this.editMode = m.mode;
    this.editReversePaddles = m.reversePaddles;
    this.editName = m.name || '';
    this.editColor = m.color || '';
    this.dit.set(m.value >= 0 ? m.value : 60);
    this.dah.set(m.dahValue >= 0 ? m.dahValue : 64);
    this.error = '';
  }

  /** The fields as they stand now (no validation), to tell whether anything was changed. */
  fields(): MidiInputEditSaveEvent {
    const paddle = this.editMode === 'paddle';
    return {
      deviceId: this.editDeviceId, channel: this.editChannel, source: this.editSource,
      mode: this.editMode, value: this.dit.value, dahValue: paddle ? this.dah.value : -1,
      reversePaddles: this.editReversePaddles, name: this.editName.trim(), color: this.editColor,
    };
  }

  /** Put the fields back to the `mapping` input. */
  reset(): void {
    this.capture.cancel();
    this.load();
  }

  /** Human-readable note, with the channel when one is selected. */
  noteDisplay(note: number): string {
    if (note < 0) return '(none)';
    const ch = this.editChannel > 0 ? `Ch ${this.editChannel} / ` : '';
    return `${ch}${midiNoteName(note)} (${note})`;
  }

  /**
   * Listen for the next MIDI note and put it in `field`. A first detection also
   * fills the device (when still "Any") and the channel (when the message had one).
   */
  detect(field: 'value' | 'dahValue'): void {
    this.capture.toggle(field, () => {
      this.midiInput.startLearn((result: MidiLearnResult) => {
        (field === 'value' ? this.dit : this.dah).set(result.note);
        if (!this.editDeviceId && result.deviceId) this.editDeviceId = result.deviceId;
        if (result.channel > 0) this.editChannel = result.channel;
        this.capture.finish();
      });
      return () => this.midiInput.cancelLearn();
    });
  }

  /** Validate the fields; returns the mapping values, or null with `error` set. */
  build(): MidiInputEditSaveEvent | null {
    this.capture.cancel();
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
    if (paddle && value === dahValue) {
      this.error = 'Dit and dah paddle notes must be different.';
      return null;
    }
    const dupError = this.checkDuplicates(value, dahValue);
    if (dupError) {
      this.error = dupError;
      return null;
    }
    this.error = '';
    return {
      deviceId: this.editDeviceId,
      channel: this.editChannel,
      source: this.editSource,
      mode: this.editMode,
      value,
      dahValue,
      reversePaddles: paddle ? this.editReversePaddles : false,
      name: this.editName.trim(),
      color: this.editColor,
    };
  }

  /**
   * Error text when a note clashes with another mapping. Notes clash when the
   * number is equal and the device filters overlap (either is "Any" or both
   * are the same) and the channel filters overlap (either is omni or equal).
   */
  private checkDuplicates(value: number, dahValue: number): string {
    const myNotes = dahValue >= 0 ? [value, dahValue] : [value];
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      const deviceOverlap = !this.editDeviceId || !other.deviceId || this.editDeviceId === other.deviceId;
      if (!deviceOverlap) continue;
      const channelOverlap = this.editChannel === 0 || other.channel === 0 || this.editChannel === other.channel;
      if (!channelOverlap) continue;
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
}
