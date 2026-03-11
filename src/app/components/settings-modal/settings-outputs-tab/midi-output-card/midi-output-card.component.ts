/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings, MidiOutputMapping } from '../../../../services/settings.service';
import { MidiOutputService, midiOutputNoteName } from '../../../../services/midi-output.service';
import { MidiOutputEditModalComponent, MidiOutputEditSaveEvent } from '../../../midi-output-edit-modal/midi-output-edit-modal.component';

/**
 * Settings card — MIDI Output (key events as MIDI note-on/off).
 *
 * Displays a table of MIDI output mappings (straight key / paddle),
 * with add/edit/delete support via the MIDI output edit modal.
 * Each mapping has its own device, channel, mode, and note assignments.
 * Global settings (forward mode, override WPM) are at the card level.
 */
@Component({
  selector: 'app-midi-output-card',
  standalone: true,
  imports: [FormsModule, MidiOutputEditModalComponent],
  templateUrl: './midi-output-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiOutputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: MidiOutputMapping = {
    enabled: true, deviceId: '', channel: 1,
    forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1,
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  constructor(
    public settings: SettingsService,
    public midiOutput: MidiOutputService,
  ) {}

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

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().midiOutputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ midiOutputMappings: mappings });
    this.midiOutput.reattach();
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.settings.settings().midiOutputMappings[index];
    this.editIndex = index;
    this.editMapping = { ...m };
    this.showEditModal = true;
    this.ensureDevicesEnumerated();
  }

  /** Open the edit modal for a new mapping */
  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = {
      enabled: true, deviceId: '', channel: 1,
      forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1,
    };
    this.showEditModal = true;
    this.ensureDevicesEnumerated();
  }

  /** Handle save from the edit modal */
  onEditSaved(event: MidiOutputEditSaveEvent): void {
    const mappings = [...this.settings.settings().midiOutputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        deviceId: event.deviceId,
        channel: event.channel,
        forward: event.forward,
        mode: event.mode,
        value: event.value,
        dahValue: event.dahValue,
      };
    } else {
      mappings.push({
        enabled: true,
        deviceId: event.deviceId,
        channel: event.channel,
        forward: event.forward,
        mode: event.mode,
        value: event.value,
        dahValue: event.dahValue,
      });
    }
    this.settings.update({ midiOutputMappings: mappings });
    this.showEditModal = false;
    this.midiOutput.reattach();
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.settings.settings().midiOutputMappings.filter((_, i) => i !== this.editIndex);
      this.settings.update({ midiOutputMappings: mappings });
      this.midiOutput.reattach();
    }
    this.showEditModal = false;
  }

  /** Display a MIDI note as human-readable name */
  noteDisplay(note: number): string {
    if (note < 0) return '—';
    return `${midiOutputNoteName(note)}(${note})`;
  }

  /** Get a short summary for a mapping row */
  mappingSummary(m: MidiOutputMapping): string {
    if (m.mode === 'straightKey') {
      return `${m.channel}/${this.noteDisplay(m.value)}`;
    }
    return `${m.channel}/${this.noteDisplay(m.value)}/${this.noteDisplay(m.dahValue)}`;
  }

  /** Get a device display name for a mapping */
  deviceDisplay(m: MidiOutputMapping): string {
    if (!m.deviceId) return 'Any';
    const dev = this.midiOutput.midiOutputs().find(d => d.id === m.deviceId);
    return dev ? dev.name : 'Disconnected';
  }

  /** Ensure MIDI devices are enumerated for the edit modal dropdown */
  private ensureDevicesEnumerated(): void {
    if (this.midiOutput.midiOutputs().length === 0) {
      this.midiOutput.enumerateDevices();
    }
  }
}
