/**
 * Morse Code Studio
 */

import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, SerialOutputMapping, OutputForward } from '../../../../services/settings.service';
import { SerialKeyOutputService } from '../../../../services/serial-key-output.service';
import { SerialOutputEditModalComponent, SerialOutputEditSaveEvent } from '../../../serial-output-edit-modal/serial-output-edit-modal.component';

/**
 * Settings card — Serial Output (DTR/RTS keying via USB-serial adapter).
 *
 * Displays a table of serial output mappings (one per port+pin),
 * with add/edit/delete support via the serial output edit modal.
 * Each mapping specifies its own port, pin, invert, and forward direction.
 */
@Component({
  selector: 'app-serial-output-card',
  standalone: true,
  imports: [FormsModule, SerialOutputEditModalComponent],
  templateUrl: './serial-output-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialOutputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: SerialOutputMapping = {
    enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  /** Unique forward badges from all enabled mappings */
  readonly forwardBadges = computed(() => {
    const mappings = this.settings.settings().serialOutputMappings;
    const forwards = new Set<OutputForward>();
    for (const m of mappings) {
      if (m.enabled) forwards.add(m.forward);
    }
    return [...forwards];
  });

  constructor(
    public settings: SettingsService,
    public serialOutput: SerialKeyOutputService,
  ) {}

  /** Toggle card expansion; refresh port list when opening */
  toggleExpand(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.serialOutput.refreshPorts();
    }
  }

  /** Handle serial output enabled toggle */
  async onSerialEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialEnabled: checked });
    if (checked) {
      await this.serialOutput.connectAllEnabled();
    } else {
      await this.serialOutput.closeAll();
    }
  }

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().serialOutputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ serialOutputMappings: mappings });
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.settings.settings().serialOutputMappings[index];
    this.editIndex = index;
    this.editMapping = { ...m };
    this.showEditModal = true;
    this.serialOutput.refreshPorts();
  }

  /** Open the edit modal for a new mapping */
  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = {
      enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
      relaySuppressOtherInputs: false,
    };
    this.showEditModal = true;
    this.serialOutput.refreshPorts();
  }

  /** Handle save from the edit modal */
  onEditSaved(event: SerialOutputEditSaveEvent): void {
    const mappings = [...this.settings.settings().serialOutputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        portIndex: event.portIndex,
        pin: event.pin,
        invert: event.invert,
        forward: event.forward,
        relayInputIndices: event.relayInputIndices,
        relaySuppressOtherInputs: event.relaySuppressOtherInputs,
      };
    } else {
      mappings.push({
        enabled: true,
        portIndex: event.portIndex,
        pin: event.pin,
        invert: event.invert,
        forward: event.forward,
        relayInputIndices: event.relayInputIndices,
        relaySuppressOtherInputs: event.relaySuppressOtherInputs,
      });
    }
    this.settings.update({ serialOutputMappings: mappings });
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.settings.settings().serialOutputMappings.filter((_, i) => i !== this.editIndex);
      this.settings.update({ serialOutputMappings: mappings });
    }
    this.showEditModal = false;
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Whether a specific mapping's port is connected */
  isMappingConnected(mapping: SerialOutputMapping): boolean {
    return mapping.portIndex >= 0 && this.serialOutput.isPortConnected(mapping.portIndex);
  }

  /** Forward label for badge display */
  forwardLabel(forward: OutputForward): string {
    return forward === 'rx' ? 'RX' : forward === 'tx' ? 'TX' : 'RX/TX';
  }
}
