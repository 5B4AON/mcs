/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SerialOutputMapping, SerialInputMapping, SerialPin, OutputForward } from '../../services/settings.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';

/**
 * Result payload emitted when the user saves a serial output mapping.
 */
export interface SerialOutputEditSaveEvent {
  portIndex: number;
  pin: SerialPin;
  invert: boolean;
  forward: OutputForward;
  relayInputIndices: number[];
  relaySuppressOtherInputs: boolean;
}

/**
 * Serial Output Edit Modal Component
 *
 * A modal dialog for creating or editing a single serial output mapping.
 * Contains fields for serial port, output pin (DTR/RTS), invert, and
 * forward direction (RX/TX/Both).
 */
@Component({
  selector: 'app-serial-output-edit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './serial-output-edit-modal.component.html',
  styleUrls: ['./serial-output-edit-modal.component.css'],
})
export class SerialOutputEditModalComponent implements OnInit {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: SerialOutputMapping = {
    enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: SerialOutputMapping[] = [];

  /** All serial input mappings — used for relay source selection */
  @Input() serialInputMappings: SerialInputMapping[] = [];

  /** Reference to the serial output service (for ports, connected state) */
  @Input() serialOutput!: SerialKeyOutputService;

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<SerialOutputEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Editable fields */
  editPortIndex = -1;
  editPin: SerialPin = 'dtr';
  editInvert = false;
  editForward: OutputForward = 'tx';

  /** Relay: indices of serial input mappings to relay through this output */
  editRelayInputIndices: number[] = [];

  /** When true, only relay sources drive this output */
  editRelaySuppressOtherInputs = false;

  /** Validation error message */
  error = '';

  /** Non-blocking warning (e.g. duplicate port+pin) */
  warning = '';

  /** Available output pins */
  readonly pins: { value: SerialPin; label: string }[] = [
    { value: 'dtr', label: 'DTR (Data Terminal Ready)' },
    { value: 'rts', label: 'RTS (Request To Send)' },
  ];

  ngOnInit(): void {
    this.editPortIndex = this.mapping.portIndex;
    this.editPin = this.mapping.pin;
    this.editInvert = this.mapping.invert;
    this.editForward = this.mapping.forward;
    this.editRelayInputIndices = [...(this.mapping.relayInputIndices || [])];
    this.editRelaySuppressOtherInputs = this.mapping.relaySuppressOtherInputs ?? false;
    this.error = '';
    this.warning = '';
    this.updateWarning();
  }

  /** Whether the selected port is currently connected */
  get isConnected(): boolean {
    return this.serialOutput?.isPortConnected(this.editPortIndex) ?? false;
  }

  /** Handle port selection change */
  onPortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value === '-2') {
      select.value = String(this.editPortIndex);
      this.serialOutput.requestPort();
      return;
    }
    this.editPortIndex = parseInt(select.value, 10);
    this.updateWarning();
  }

  /** Save the edited mapping after validation */
  save(): void {
    this.saved.emit({
      portIndex: this.editPortIndex,
      pin: this.editPin,
      invert: this.editInvert,
      forward: this.editForward,
      relayInputIndices: this.editRelayInputIndices,
      relaySuppressOtherInputs: this.editRelaySuppressOtherInputs,
    });
  }

  /** Cancel editing */
  cancel(): void {
    this.cancelled.emit();
  }

  /** Delete this mapping */
  delete(): void {
    this.deleted.emit();
  }

  /** Check for duplicate port+pin combinations (non-blocking warning) */
  private checkDuplicates(): string | null {
    if (this.editPortIndex < 0) return null;
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const m = this.allMappings[i];
      if (m.portIndex === this.editPortIndex && m.pin === this.editPin) {
        return `Another mapping (#${i + 1}) also uses ${this.editPin.toUpperCase()} on this port. This is allowed but may cause unexpected behaviour if both mappings fire simultaneously.`;
      }
    }
    return null;
  }

  /** Test: toggles the current mapping's pin for 1 second */
  async testOutput(): Promise<void> {
    if (this.editIndex < 0 || !this.isConnected) return;
    await this.serialOutput.test(this.editIndex);
  }

  /** Recompute the non-blocking duplicate warning */
  updateWarning(): void {
    this.warning = this.checkDuplicates() ?? '';
  }

  /** Whether a serial input mapping's source is compatible with the output forward setting */
  isInputCompatible(input: SerialInputMapping): boolean {
    return this.editForward === 'both' || input.source === this.editForward;
  }

  /** Toggle a serial input mapping index in the relay list */
  toggleRelayInput(index: number): void {
    const pos = this.editRelayInputIndices.indexOf(index);
    if (pos >= 0) {
      this.editRelayInputIndices.splice(pos, 1);
    } else {
      this.editRelayInputIndices.push(index);
    }
  }

  /** Short label for a serial input mapping */
  inputMappingLabel(m: SerialInputMapping, index: number): string {
    const mode = m.mode === 'straightKey' ? 'Straight' : 'Paddle';
    const pin = m.pin.toUpperCase();
    const src = m.source.toUpperCase();
    const name = m.name ? ` (${m.name})` : '';
    return `#${index + 1} ${mode} ${pin} [${src}]${name}`;
  }
}
