/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SerialOutputMapping, SerialPin, OutputForward } from '../../services/settings.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';

/**
 * Result payload emitted when the user saves a serial output mapping.
 */
export interface SerialOutputEditSaveEvent {
  portIndex: number;
  pin: SerialPin;
  invert: boolean;
  forward: OutputForward;
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
    enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: SerialOutputMapping[] = [];

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

  /** Validation error message */
  error = '';

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
    this.error = '';
  }

  /** Whether the selected port is currently connected */
  get isConnected(): boolean {
    return this.serialOutput?.isPortConnected(this.editPortIndex) ?? false;
  }

  /** Handle port selection change */
  onPortChange(event: Event): void {
    this.editPortIndex = parseInt((event.target as HTMLSelectElement).value, 10);
  }

  /** Prompt user to add a serial port */
  async addPort(): Promise<void> {
    await this.serialOutput.requestPort();
  }

  /** Save the edited mapping after validation */
  save(): void {
    // Duplicate detection: same port + same pin on another mapping
    const dupError = this.checkDuplicates();
    if (dupError) {
      this.error = dupError;
      return;
    }

    this.saved.emit({
      portIndex: this.editPortIndex,
      pin: this.editPin,
      invert: this.editInvert,
      forward: this.editForward,
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

  /** Check for duplicate port+pin combinations */
  private checkDuplicates(): string | null {
    if (this.editPortIndex < 0) return null;
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const m = this.allMappings[i];
      if (m.portIndex === this.editPortIndex && m.pin === this.editPin) {
        return `Another mapping already uses ${this.editPin.toUpperCase()} on this port.`;
      }
    }
    return null;
  }

  /** Test: toggles the current mapping's pin for 1 second */
  async testOutput(): Promise<void> {
    if (this.editIndex < 0 || !this.isConnected) return;
    await this.serialOutput.test(this.editIndex);
  }
}
