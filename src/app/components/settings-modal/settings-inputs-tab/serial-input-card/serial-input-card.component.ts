/**
 * Morse Code Studio
 */

import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, SerialInputMapping, DecoderSource, SerialInputPin } from '../../../../services/settings.service';
import { SerialKeyInputService } from '../../../../services/serial-key-input.service';
import { SerialInputEditModalComponent, SerialInputEditSaveEvent } from '../../../serial-input-edit-modal/serial-input-edit-modal.component';

/** Human-readable labels for serial input pins */
const PIN_LABELS: Record<SerialInputPin, string> = {
  dsr: 'DSR',
  cts: 'CTS',
  dcd: 'DCD',
  ri:  'RI',
};

/**
 * Settings card — Serial Input.
 *
 * Displays a table of serial input mappings (straight key / paddle),
 * with add/edit/delete support via the serial input edit modal.
 * Each mapping specifies its own serial port, poll interval, debounce,
 * pin assignment(s), invert, decoder source, and paddle settings.
 */
@Component({
  selector: 'app-serial-input-card',
  standalone: true,
  imports: [FormsModule, SerialInputEditModalComponent],
  templateUrl: './serial-input-card.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialInputCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: SerialInputMapping = {
    enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
    invert: false, source: 'rx', reversePaddles: false,
    paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
    debounceMs: 5, name: '', color: '',
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  /** Unique source badges from all enabled mappings */
  readonly sourceBadges = computed(() => {
    const mappings = this.settings.settings().serialInputMappings;
    const sources = new Set<DecoderSource>();
    for (const m of mappings) {
      if (m.enabled) sources.add(m.source);
    }
    return [...sources];
  });

  constructor(
    public settings: SettingsService,
    public serialInput: SerialKeyInputService,
  ) {}

  /** Toggle card expansion; refresh port list when opening */
  toggleExpand(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.serialInput.refreshPorts();
    }
  }

  /** Handle serial input enabled toggle */
  onSerialInputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialInputEnabled: checked });
    // The effect() in the service handles connecting/disconnecting
  }

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().serialInputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ serialInputMappings: mappings });
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.settings.settings().serialInputMappings[index];
    this.editIndex = index;
    this.editMapping = { ...m };
    this.showEditModal = true;
    this.serialInput.refreshPorts();
  }

  /** Open the edit modal for a new mapping */
  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = {
      enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
      invert: false, source: 'rx', reversePaddles: false,
      paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
      debounceMs: 5, name: '', color: '',
    };
    this.showEditModal = true;
    this.serialInput.refreshPorts();
  }

  /** Handle save from the edit modal */
  onEditSaved(event: SerialInputEditSaveEvent): void {
    const mappings = [...this.settings.settings().serialInputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        mode: event.mode,
        pin: event.pin,
        dahPin: event.dahPin,
        invert: event.invert,
        source: event.source,
        reversePaddles: event.reversePaddles,
        paddleMode: event.paddleMode,
        portIndex: event.portIndex,
        pollInterval: event.pollInterval,
        debounceMs: event.debounceMs,
        name: event.name,
        color: event.color,
      };
    } else {
      mappings.push({
        enabled: true,
        mode: event.mode,
        pin: event.pin,
        dahPin: event.dahPin,
        invert: event.invert,
        source: event.source,
        reversePaddles: event.reversePaddles,
        paddleMode: event.paddleMode,
        portIndex: event.portIndex,
        pollInterval: event.pollInterval,
        debounceMs: event.debounceMs,
        name: event.name,
        color: event.color,
      });
    }
    this.settings.update({ serialInputMappings: mappings });
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.settings.settings().serialInputMappings.filter((_, i) => i !== this.editIndex);
      this.settings.update({ serialInputMappings: mappings });
    }
    this.showEditModal = false;
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Get a short label for a pin */
  pinLabel(pin: SerialInputPin): string {
    return PIN_LABELS[pin] || pin;
  }

  /** Whether a specific mapping's port is connected */
  isMappingConnected(mapping: SerialInputMapping): boolean {
    return mapping.portIndex >= 0 && this.serialInput.isPortConnected(mapping.portIndex);
  }
}
