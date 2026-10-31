/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { OutputForward } from '../../../services/settings-common';
import { SerialOutputMapping } from './serial-output-item.model';
import { SerialKeyOutputService } from '../../../services/serial-key-output.service';
import { SerialOutputEditModalComponent, SerialOutputEditSaveEvent } from '../../settings-modal/serial-output-edit-modal/serial-output-edit-modal.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { MappingListComponent } from '../mapping/mapping-list/mapping-list.component';

/**
 * Settings item — Serial Output (DTR/RTS keying via a USB-serial adapter).
 *
 * A list of output mappings (port + pin + forward direction), edited in a
 * popup. In a wizard step only the master switch is shown; the mappings are
 * repeat pages. Ports are only opened or closed in live Settings, and a new
 * port is only requested from "+ Add serial port" in the mapping editor.
 */
@Component({
  selector: 'app-serial-output-item',
  standalone: true,
  imports: [ItemShellComponent, MappingListComponent, SerialOutputEditModalComponent],
  templateUrl: './serial-output-item.component.html',
  styles: [':host { display: contents; }'],
})
export class SerialOutputItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  readonly serialOutput = inject(SerialKeyOutputService);

  /** Index of the mapping being edited, or -1 for a new one */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: SerialOutputMapping = this.blankMapping();

  showEditModal = false;

  readonly webSerialSupported = 'serial' in navigator;
  readonly isAndroid = /android/i.test(navigator.userAgent);

  /** Unique forward badges from all enabled mappings */
  readonly forwardBadges = computed(() => {
    const forwards = new Set<OutputForward>();
    for (const m of this.s().serialOutputMappings) {
      if (m.enabled) forwards.add(m.forward);
    }
    return [...forwards];
  });

  constructor() {
    // Only lists ports the user has already granted; it never shows a prompt
    if (this.webSerialSupported) this.serialOutput.refreshPorts();
  }

  /** Serial is unavailable in this browser or on Android */
  get unavailable(): boolean {
    return !this.webSerialSupported || this.isAndroid;
  }

  /** Master switch; in live Settings also connects or closes the granted ports. */
  async onEnabledChange(checked: boolean): Promise<void> {
    if (checked && this.unavailable) return;
    this.scope.update({ serialEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) {
      await this.serialOutput.connectAllEnabled();
    } else {
      await this.serialOutput.closeAll();
    }
  }

  onMappingEnabledChange(index: number, checked: boolean): void {
    const mappings = this.s().serialOutputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ serialOutputMappings: mappings });
  }

  startEdit(index: number): void {
    this.editIndex = index;
    this.editMapping = { ...this.s().serialOutputMappings[index] };
    this.showEditModal = true;
    this.serialOutput.refreshPorts();
  }

  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = this.blankMapping();
    this.showEditModal = true;
    this.serialOutput.refreshPorts();
  }

  onEditSaved(event: SerialOutputEditSaveEvent): void {
    const mappings = [...this.s().serialOutputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = { ...mappings[this.editIndex], ...event };
    } else {
      mappings.push({ enabled: true, ...event });
    }
    this.scope.update({ serialOutputMappings: mappings });
    this.showEditModal = false;
  }

  /** Delete a mapping from its row (the list has already asked for confirmation) */
  removeMapping(index: number): void {
    if (index >= 0 && index < this.s().serialOutputMappings.length) {
      this.scope.update({
        serialOutputMappings: this.s().serialOutputMappings.filter((_, i) => i !== index),
      });
    }
  }

  onEditCancelled(): void {
    this.showEditModal = false;
  }

  isMappingConnected(m: SerialOutputMapping): boolean {
    return m.portIndex >= 0 && this.serialOutput.isPortConnected(m.portIndex);
  }

  forwardLabel(forward: OutputForward): string {
    return forward === 'rx' ? 'RX' : forward === 'tx' ? 'TX' : 'RX/TX';
  }

  private blankMapping(): SerialOutputMapping {
    return {
      enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
      relaySuppressOtherInputs: false,
    };
  }
}
