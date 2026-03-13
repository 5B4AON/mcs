/**
 * Morse Code Studio
 */

import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, MidiInputMapping, DecoderSource } from '../../../../services/settings.service';
import { MidiInputService, midiNoteName } from '../../../../services/midi-input.service';
import { MidiInputEditModalComponent, MidiInputEditSaveEvent } from '../../../midi-input-edit-modal/midi-input-edit-modal.component';

/**
 * Settings card — MIDI Input.
 *
 * Displays a table of MIDI input mappings (straight key / paddle),
 * with add/edit/delete support via the MIDI input edit modal.
 * Each mapping has its own device, channel, source, mode, and
 * note assignments — modelled after the Emojis card pattern.
 */
@Component({
  selector: 'app-midi-input-card',
  standalone: true,
  imports: [FormsModule, MidiInputEditModalComponent],
  templateUrl: './midi-input-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiInputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: MidiInputMapping = {
    enabled: true, deviceId: '', channel: 0, source: 'rx',
    mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false,
    name: '', color: '',
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  /** Unique source badges from all enabled mappings */
  readonly sourceBadges = computed(() => {
    const mappings = this.settings.settings().midiInputMappings;
    const sources = new Set<DecoderSource>();
    for (const m of mappings) {
      if (m.enabled) sources.add(m.source);
    }
    return [...sources];
  });

  constructor(
    public settings: SettingsService,
    public midiInput: MidiInputService,
  ) {}

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

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().midiInputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ midiInputMappings: mappings });
    this.midiInput.reattach();
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.settings.settings().midiInputMappings[index];
    this.editIndex = index;
    this.editMapping = { ...m };
    this.showEditModal = true;
    this.ensureDevicesEnumerated();
  }

  /** Open the edit modal for a new mapping */
  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = {
      enabled: true, deviceId: '', channel: 0, source: 'rx',
      mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false,
      name: '', color: '',
    };
    this.showEditModal = true;
    this.ensureDevicesEnumerated();
  }

  /** Ensure MIDI devices are enumerated for the edit modal dropdown */
  private ensureDevicesEnumerated(): void {
    if (this.midiInput.midiInputs().length === 0) {
      this.midiInput.enumerateDevices();
    }
  }

  /** Handle save from the edit modal */
  onEditSaved(event: MidiInputEditSaveEvent): void {
    const mappings = [...this.settings.settings().midiInputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        deviceId: event.deviceId,
        channel: event.channel,
        source: event.source,
        mode: event.mode,
        value: event.value,
        dahValue: event.dahValue,
        reversePaddles: event.reversePaddles,
        name: event.name,
        color: event.color,
      };
    } else {
      mappings.push({
        enabled: true,
        deviceId: event.deviceId,
        channel: event.channel,
        source: event.source,
        mode: event.mode,
        value: event.value,
        dahValue: event.dahValue,
        reversePaddles: event.reversePaddles,
        name: event.name,
        color: event.color,
      });
    }
    this.settings.update({ midiInputMappings: mappings });
    this.showEditModal = false;
    this.midiInput.reattach();
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.settings.settings().midiInputMappings.filter((_, i) => i !== this.editIndex);
      this.settings.update({ midiInputMappings: mappings });
      this.midiInput.reattach();
    }
    this.showEditModal = false;
  }

  /** Display a MIDI note as human-readable name */
  noteDisplay(note: number): string {
    if (note < 0) return '—';
    return `${midiNoteName(note)}(${note})`;
  }

  /** Get a short summary for a mapping row */
  mappingSummary(m: MidiInputMapping): string {
    const ch = m.channel === 0 ? '*' : String(m.channel);
    if (m.mode === 'straightKey') {
      return `${ch}/${this.noteDisplay(m.value)}`;
    }
    return `${ch}/${this.noteDisplay(m.value)}/${this.noteDisplay(m.dahValue)}`;
  }

  /** Get a device display name for a mapping */
  deviceDisplay(m: MidiInputMapping): string {
    if (!m.deviceId) return 'Any';
    const dev = this.midiInput.midiInputs().find(d => d.id === m.deviceId);
    return dev ? dev.name : 'Disconnected';
  }

  /** Get channel display */
  channelDisplay(m: MidiInputMapping): string {
    return m.channel === 0 ? 'Omni' : `Ch ${m.channel}`;
  }

  /** Get the display color for a mapping's name label */
  nameColor(m: MidiInputMapping): string {
    if (m.color) return m.color;
    return m.source === 'rx' ? '#8cf' : '#fc8';
  }

  /** Check whether a mapping's MIDI device is currently connected */
  isMappingConnected(m: MidiInputMapping): boolean {
    const devices = this.midiInput.midiInputs();
    if (!m.deviceId) return devices.length > 0;
    return devices.some(d => d.id === m.deviceId);
  }
}
