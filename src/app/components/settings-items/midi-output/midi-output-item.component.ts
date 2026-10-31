/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { MidiOutputMapping } from './midi-output-item.model';
import { MidiOutputService } from '../../../services/midi-output.service';
import { MidiOutputEditModalComponent, MidiOutputEditSaveEvent } from '../../settings-modal/midi-output-edit-modal/midi-output-edit-modal.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { MappingListComponent } from '../mapping/mapping-list/mapping-list.component';

/**
 * Settings item — MIDI Output (key events as MIDI note-on/off).
 *
 * Displays a table of MIDI output mappings (straight key / paddle),
 * with add/edit/delete support via the MIDI output edit modal.
 * Each mapping has its own device, channel, mode, and note assignments.
 * The override-WPM option is at the item level. In a wizard step only the
 * master switch and the override option are shown: the mappings are edited
 * on their own pages (repeat step). Starting/stopping MIDI output and
 * reattaching mappings only happens in live Settings.
 */
@Component({
  selector: 'app-midi-output-item',
  standalone: true,
  imports: [ItemShellComponent, MappingListComponent, MidiOutputEditModalComponent],
  templateUrl: './midi-output-item.component.html',
  styles: [':host { display: contents; }'],
})
export class MidiOutputItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: MidiOutputMapping = {
    enabled: true, deviceId: '', channel: 1,
    forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  readonly midiOutput = inject(MidiOutputService);

  /** Handle MIDI output enabled toggle — starts/stops MIDI output access */
  async onMidiOutputEnabledChange(checked: boolean): Promise<void> {
    if (checked && this.scope.isLive && !this.midiOutput.supported) return;
    this.scope.update({ midiOutputEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) {
      await this.midiOutput.start();
    } else {
      this.midiOutput.shutdown();
    }
  }

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, checked: boolean): void {
    const mappings = this.s().midiOutputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ midiOutputMappings: mappings });
    this.reattach();
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.s().midiOutputMappings[index];
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
      forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
      relaySuppressOtherInputs: false,
    };
    this.showEditModal = true;
    this.ensureDevicesEnumerated();
  }

  /** Handle save from the edit modal */
  onEditSaved(event: MidiOutputEditSaveEvent): void {
    const mappings = [...this.s().midiOutputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        deviceId: event.deviceId,
        channel: event.channel,
        forward: event.forward,
        mode: event.mode,
        value: event.value,
        dahValue: event.dahValue,
        relayInputIndices: event.relayInputIndices,
        relaySuppressOtherInputs: event.relaySuppressOtherInputs,
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
        relayInputIndices: event.relayInputIndices,
        relaySuppressOtherInputs: event.relaySuppressOtherInputs,
      });
    }
    this.scope.update({ midiOutputMappings: mappings });
    this.showEditModal = false;
    this.reattach();
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Delete a mapping from its row (the list has already asked for confirmation) */
  removeMapping(index: number): void {
    if (index >= 0 && index < this.s().midiOutputMappings.length) {
      const mappings = this.s().midiOutputMappings.filter((_, i) => i !== index);
      this.scope.update({ midiOutputMappings: mappings });
      this.reattach();
    }
  }

  /** Short row summary: the MIDI note number, or dit|dah for a paddle (device and channel are in the editor) */
  mappingSummary(m: MidiOutputMapping): string {
    return m.mode === 'straightKey' ? String(m.value) : `${m.value}|${m.dahValue}`;
  }

  /** Get a device display name for a mapping */
  deviceDisplay(m: MidiOutputMapping): string {
    if (!m.deviceId) return 'Any';
    const dev = this.midiOutput.midiOutputs().find(d => d.id === m.deviceId);
    return dev ? dev.name : 'Disconnected';
  }

  /** Re-read the mappings in the running MIDI output service (live Settings only) */
  private reattach(): void {
    if (this.scope.isLive) this.midiOutput.reattach();
  }

  /** Ensure MIDI devices are enumerated for the edit modal dropdown */
  private ensureDevicesEnumerated(): void {
    if (this.midiOutput.midiOutputs().length === 0) {
      this.midiOutput.enumerateDevices();
    }
  }

  /** Check whether a mapping's MIDI device is currently connected */
  isMappingConnected(m: MidiOutputMapping): boolean {
    const devices = this.midiOutput.midiOutputs();
    if (!m.deviceId) return devices.length > 0;
    return devices.some(d => d.id === m.deviceId);
  }
}
