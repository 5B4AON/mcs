/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { MidiInputService, midiNoteName } from '../../../../services/midi-input.service';

/**
 * Settings card — MIDI Input.
 *
 * Configures MIDI note-on/off as a keying source. Supports straight
 * key and paddle modes with independent note assignments via MIDI
 * learn (capture). Shows device selection, channel filter, connection
 * status badge, and reverse paddles / paddle mode.
 */
@Component({
  selector: 'app-midi-input-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './midi-input-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiInputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Which MIDI setting is currently being captured (`null` = not capturing) */
  midiCapturing: string | null = null;

  /** MIDI channel numbers 1–16 for the channel select dropdown */
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  constructor(
    public settings: SettingsService,
    public midiInput: MidiInputService,
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

  /** Handle MIDI input enabled toggle */
  async onMidiEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !this.midiInput.supported) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ midiInputEnabled: checked });
    if (checked) {
      await this.midiInput.start();
    } else {
      this.midiInput.shutdown();
    }
  }

  /** Handle MIDI device selection change */
  onMidiDeviceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ midiInputDeviceId: value });
    this.midiInput.reattach();
  }

  /** Start MIDI learn/capture mode for the given setting key */
  onMidiCapture(settingKey: string): void {
    if (this.midiCapturing === settingKey) {
      this.midiInput.cancelLearn();
      this.midiCapturing = null;
      return;
    }
    if (!this.midiInput.connected()) {
      this.midiInput.start().then(() => this.beginCapture(settingKey));
    } else {
      this.beginCapture(settingKey);
    }
  }

  /** Internal: activate MIDI learn callback */
  private beginCapture(settingKey: string): void {
    this.midiCapturing = settingKey;
    this.midiInput.startLearn((note: number) => {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
      this.midiCapturing = null;
    });
  }

  /** Clear a MIDI note assignment (set to -1 = unassigned) */
  clearMidiNote(settingKey: string): void {
    this.settings.update({ [settingKey]: -1 } as Partial<AppSettings>);
  }

  /** Display a MIDI note number as a human-readable name */
  midiNoteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiNoteName(note)} (${note})`;
  }
}
