/**
 * Morse Code Studio
 */

/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';
import { DecoderSource } from '../../../services/settings-common';
import { MidiInputMapping } from './midi-input-item.model';
import { MidiInputService, midiNoteName } from '../../../services/midi-input.service';
import { MidiInputEditModalComponent, MidiInputEditSaveEvent } from '../../settings-modal/midi-input-edit-modal/midi-input-edit-modal.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { MappingListComponent } from '../mapping/mapping-list/mapping-list.component';

/**
 * Settings item — MIDI Input.
 *
 * Displays a table of MIDI input mappings (straight key / paddle),
 * with add/edit/delete support via the MIDI input edit modal.
 * Each mapping has its own device, channel, source, mode, and
 * note assignments. In a wizard step only the master switch is shown:
 * the mappings are edited on their own pages (repeat step). Starting and
 * stopping the MIDI service only happens in live Settings.
 */
@Component({
  selector: 'app-midi-input-item',
  standalone: true,
  imports: [ItemShellComponent, MappingListComponent, MidiInputEditModalComponent],
  templateUrl: './midi-input-item.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiInputItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

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
    const mappings = this.s().midiInputMappings;
    const sources = new Set<DecoderSource>();
    for (const m of mappings) {
      if (m.enabled) sources.add(m.source);
    }
    return [...sources];
  });

  readonly settings = inject(SettingsService);
  readonly midiInput = inject(MidiInputService);

  /** Handle MIDI input enabled toggle */
  async onMidiEnabledChange(checked: boolean): Promise<void> {
    if (checked && this.scope.isLive && !this.midiInput.supported) return;
    this.scope.update({ midiInputEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) {
      await this.midiInput.start();
    } else {
      this.midiInput.shutdown();
    }
  }

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, checked: boolean): void {
    const mappings = this.s().midiInputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ midiInputMappings: mappings });
    this.reattach();
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.s().midiInputMappings[index];
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

  /** Re-read the mappings in the running MIDI service (live Settings only) */
  private reattach(): void {
    if (this.scope.isLive) this.midiInput.reattach();
  }

  /** Ensure MIDI devices are enumerated for the edit modal dropdown */
  private ensureDevicesEnumerated(): void {
    if (this.midiInput.midiInputs().length === 0) {
      this.midiInput.enumerateDevices();
    }
  }

  /** Handle save from the edit modal */
  onEditSaved(event: MidiInputEditSaveEvent): void {
    const mappings = [...this.s().midiInputMappings];
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
    this.scope.update({ midiInputMappings: mappings });
    this.showEditModal = false;
    this.reattach();
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.s().midiInputMappings.filter((_, i) => i !== this.editIndex);
      // Clean up relay references in output mappings: remove the deleted index
      // and decrement any index greater than the deleted one.
      const outputMappings = this.s().midiOutputMappings.map(om => ({
        ...om,
        relayInputIndices: (om.relayInputIndices || [])
          .filter(idx => idx !== this.editIndex)
          .map(idx => idx > this.editIndex ? idx - 1 : idx),
      }));
      this.scope.update({ midiInputMappings: mappings, midiOutputMappings: outputMappings });
      this.reattach();
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

  /** Get the display colour for a mapping's name label */
  nameColor(m: MidiInputMapping): string {
    if (m.color) return m.color;
    const md = this.settings.modalDisplay();
    return m.source === 'rx' ? md.rxForeground : md.txForeground;
  }

  /** Check whether a mapping's MIDI device is currently connected */
  isMappingConnected(m: MidiInputMapping): boolean {
    const devices = this.midiInput.midiInputs();
    if (!m.deviceId) return devices.length > 0;
    return devices.some(d => d.id === m.deviceId);
  }
}
