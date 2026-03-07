/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { MidiOutputService, midiOutputNoteName } from '../../../../services/midi-output.service';

/**
 * Settings card — MIDI Output (key events as MIDI note-on/off).
 *
 * Sends decoded morse elements as MIDI notes to an external device (e.g.
 * Arduino Pro Micro). Includes device/channel selection, velocity,
 * note assignment with picker/raw toggle, and WPM override option.
 */
@Component({
  selector: 'app-midi-output-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './midi-output-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiOutputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** MIDI channel numbers 1–16 for the channel select dropdown */
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);
  /** Note names for the MIDI output note picker dropdowns */
  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  /** Octave range for MIDI output picker (-1 to 9) */
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  /** Whether to show the raw 0–127 input for each MIDI output note (vs note/octave picker) */
  midiOutputRawMode: Record<string, boolean> = {};

  constructor(
    public settings: SettingsService,
    public midiOutput: MidiOutputService,
  ) {}

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked } as Partial<AppSettings>);
  }

  /** Handle MIDI output enabled toggle — starts/stops MIDI output access */
  async onMidiOutputEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !this.midiOutput.supported) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ midiOutputEnabled: checked });
    if (checked) {
      await this.midiOutput.start();
    } else {
      this.midiOutput.shutdown();
    }
  }

  /** Handle MIDI output device selection change */
  onMidiOutputDeviceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ midiOutputDeviceId: value });
    this.midiOutput.reattach();
  }

  /** Display a MIDI output note number as a human-readable name (e.g. "C4 (60)") */
  midiOutputNoteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiOutputNoteName(note)} (${note})`;
  }

  /** Get note name index (0–11) from a MIDI note number */
  midiOutputNoteNameIndex(note: number): number {
    return note >= 0 ? note % 12 : 0;
  }

  /** Get octave from a MIDI note number */
  midiOutputNoteOctave(note: number): number {
    return note >= 0 ? Math.floor(note / 12) - 1 : 4;
  }

  /** Update a MIDI output note from the note name picker dropdown */
  onMidiOutputNoteNameChange(settingKey: string, event: Event): void {
    const nameIdx = parseInt((event.target as HTMLSelectElement).value, 10);
    const current = (this.settings.settings() as any)[settingKey] as number;
    const octave = current >= 0 ? Math.floor(current / 12) - 1 : 4;
    const note = (octave + 1) * 12 + nameIdx;
    if (note >= 0 && note <= 127) {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
    }
  }

  /** Update a MIDI output note from the octave picker dropdown */
  onMidiOutputOctaveChange(settingKey: string, event: Event): void {
    const octave = parseInt((event.target as HTMLSelectElement).value, 10);
    const current = (this.settings.settings() as any)[settingKey] as number;
    const nameIdx = current >= 0 ? current % 12 : 0;
    const note = (octave + 1) * 12 + nameIdx;
    if (note >= 0 && note <= 127) {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
    }
  }

  /** Update a MIDI output note from raw 0–127 numeric input */
  onMidiOutputRawNoteChange(settingKey: string, event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 127) {
      this.settings.update({ [settingKey]: value } as Partial<AppSettings>);
    }
  }

  /** Toggle between note/octave picker and raw MIDI value entry */
  toggleMidiOutputRawMode(key: string): void {
    this.midiOutputRawMode[key] = !this.midiOutputRawMode[key];
  }
}
