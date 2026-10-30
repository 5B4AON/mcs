/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';
import { DecoderSource } from '../../../services/settings-common';
import { SerialInputMapping, SerialInputPin } from './serial-input-item.model';
import { SerialKeyInputService } from '../../../services/serial-key-input.service';
import { SerialInputEditModalComponent, SerialInputEditSaveEvent } from '../../settings-modal/serial-input-edit-modal/serial-input-edit-modal.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { MappingListComponent } from '../mapping/mapping-list/mapping-list.component';

/** Short labels for serial input pins */
const PIN_LABELS: Record<SerialInputPin, string> = { dsr: 'DSR', cts: 'CTS', dcd: 'DCD', ri: 'RI' };

/**
 * Settings item — Serial Input.
 *
 * A list of serial input mappings (straight key / paddle on the DSR, CTS,
 * DCD or RI pins of a USB-serial adapter), edited in a popup. In a wizard
 * step only the master switch is shown; the mappings are repeat pages.
 * Switching the item on never opens a port by itself: the service connects
 * to ports the user already granted, and new ports are only requested from
 * the "+ Add serial port" choice in the mapping editor.
 */
@Component({
  selector: 'app-serial-input-item',
  standalone: true,
  imports: [ItemShellComponent, MappingListComponent, SerialInputEditModalComponent],
  templateUrl: './serial-input-item.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialInputItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  readonly settings = inject(SettingsService);
  readonly serialInput = inject(SerialKeyInputService);

  /** Index of the mapping being edited, or -1 for a new one */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: SerialInputMapping = this.blankMapping();

  showEditModal = false;

  readonly webSerialSupported = 'serial' in navigator;
  readonly isAndroid = /android/i.test(navigator.userAgent);

  /** Unique source badges from all enabled mappings */
  readonly sourceBadges = computed(() => {
    const sources = new Set<DecoderSource>();
    for (const m of this.s().serialInputMappings) {
      if (m.enabled) sources.add(m.source);
    }
    return [...sources];
  });

  constructor() {
    // Only lists ports the user has already granted; it never shows a prompt
    if (this.webSerialSupported) this.serialInput.refreshPorts();
  }

  /** Serial is unavailable in this browser or on Android */
  get unavailable(): boolean {
    return !this.webSerialSupported || this.isAndroid;
  }

  /** Master switch; the service's own effect connects or disconnects in live Settings. */
  onEnabledChange(checked: boolean): void {
    if (checked && this.unavailable) return;
    this.scope.update({ serialInputEnabled: checked });
  }

  onMappingEnabledChange(index: number, checked: boolean): void {
    const mappings = this.s().serialInputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ serialInputMappings: mappings });
  }

  startEdit(index: number): void {
    this.editIndex = index;
    this.editMapping = { ...this.s().serialInputMappings[index] };
    this.showEditModal = true;
    this.serialInput.refreshPorts();
  }

  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = this.blankMapping();
    this.showEditModal = true;
    this.serialInput.refreshPorts();
  }

  onEditSaved(event: SerialInputEditSaveEvent): void {
    const mappings = [...this.s().serialInputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = { ...mappings[this.editIndex], ...event };
    } else {
      mappings.push({ enabled: true, ...event });
    }
    this.scope.update({ serialInputMappings: mappings });
    this.showEditModal = false;
  }

  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Delete the mapping and fix the relay references that point at later inputs. */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.s().serialInputMappings.filter((_, i) => i !== this.editIndex);
      const outputMappings = this.s().serialOutputMappings.map(om => ({
        ...om,
        relayInputIndices: (om.relayInputIndices || [])
          .filter(idx => idx !== this.editIndex)
          .map(idx => idx > this.editIndex ? idx - 1 : idx),
      }));
      this.scope.update({ serialInputMappings: mappings, serialOutputMappings: outputMappings });
    }
    this.showEditModal = false;
  }

  pinLabel(pin: SerialInputPin): string {
    return PIN_LABELS[pin] || pin;
  }

  /** Colour of a mapping's name label: its own colour, else the RX/TX colour */
  nameColor(m: SerialInputMapping): string {
    if (m.color) return m.color;
    const md = this.settings.modalDisplay();
    return m.source === 'rx' ? md.rxForeground : md.txForeground;
  }

  isMappingConnected(m: SerialInputMapping): boolean {
    return m.portIndex >= 0 && this.serialInput.isPortConnected(m.portIndex);
  }

  private blankMapping(): SerialInputMapping {
    return {
      enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
      invert: false, source: 'rx', reversePaddles: false,
      paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
      debounceMs: 5, name: '', color: '',
    };
  }
}
