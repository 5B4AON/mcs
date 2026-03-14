/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SerialInputMapping, KeyInputMode, SerialInputPin,
  DecoderSource, PaddleMode,
} from '../../services/settings.service';
import { SerialKeyInputService } from '../../services/serial-key-input.service';

/**
 * Result payload emitted when the user saves a serial input mapping.
 */
export interface SerialInputEditSaveEvent {
  mode: KeyInputMode;
  pin: SerialInputPin;
  dahPin: SerialInputPin;
  invert: boolean;
  source: DecoderSource;
  reversePaddles: boolean;
  paddleMode: PaddleMode;
  portIndex: number;
  pollInterval: number;
  debounceMs: number;
  name: string;
  color: string;
}

/**
 * Serial Input Edit Modal Component
 *
 * A modal dialog for creating or editing a single serial input mapping.
 * Contains fields for serial port, poll interval, debounce, signal LEDs,
 * mode (straight key vs paddle), pin assignment(s), invert, decoder source,
 * reverse paddles, paddle mode, name and colour.
 */
@Component({
  selector: 'app-serial-input-edit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './serial-input-edit-modal.component.html',
  styleUrls: ['./serial-input-edit-modal.component.css'],
})
export class SerialInputEditModalComponent implements OnInit, OnDestroy {
  /** The mapping being edited (used to populate initial values) */
  @Input() mapping: SerialInputMapping = {
    enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
    invert: false, source: 'rx', reversePaddles: false,
    paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
    debounceMs: 5, name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for new) */
  @Input() editIndex = -1;

  /** All existing mappings — used for duplicate detection */
  @Input() allMappings: SerialInputMapping[] = [];

  /** Reference to the serial input service (for ports, signals, connected state) */
  @Input() serialInput!: SerialKeyInputService;

  /** Emitted when the user saves the mapping */
  @Output() saved = new EventEmitter<SerialInputEditSaveEvent>();

  /** Emitted when the user cancels the edit */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when the user deletes the mapping */
  @Output() deleted = new EventEmitter<void>();

  /** Editable fields */
  editMode: KeyInputMode = 'straightKey';
  editPin: SerialInputPin = 'dsr';
  editDahPin: SerialInputPin = 'cts';
  editInvert = false;
  editSource: DecoderSource = 'rx';
  editReversePaddles = false;
  editPaddleMode: PaddleMode = 'iambic-b';
  editPortIndex = -1;
  editPollInterval = 10;
  editDebounceMs = 5;
  editName = '';
  editColor = '';

  /** Validation error message */
  error = '';

  /** Signal LED refresh interval */
  private signalRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Cached signal values for display (refreshed via timer) */
  signalDsr = false;
  signalCts = false;
  signalDcd = false;
  signalRi = false;

  /** Available serial input pins */
  readonly pins: { value: SerialInputPin; label: string }[] = [
    { value: 'dsr', label: 'DSR (Data Set Ready)' },
    { value: 'cts', label: 'CTS (Clear To Send)' },
    { value: 'dcd', label: 'DCD (Data Carrier Detect)' },
    { value: 'ri', label: 'RI (Ring Indicator)' },
  ];

  ngOnInit(): void {
    this.editMode = this.mapping.mode;
    this.editPin = this.mapping.pin;
    this.editDahPin = this.mapping.dahPin;
    this.editInvert = this.mapping.invert;
    this.editSource = this.mapping.source;
    this.editReversePaddles = this.mapping.reversePaddles;
    this.editPaddleMode = this.mapping.paddleMode;
    this.editPortIndex = this.mapping.portIndex;
    this.editPollInterval = this.mapping.pollInterval;
    this.editDebounceMs = this.mapping.debounceMs;
    this.editName = this.mapping.name || '';
    this.editColor = this.mapping.color || '';
    this.error = '';

    // Start refreshing signal LEDs
    this.refreshSignals();
    this.signalRefreshTimer = setInterval(() => this.refreshSignals(), 100);
  }

  ngOnDestroy(): void {
    if (this.signalRefreshTimer) {
      clearInterval(this.signalRefreshTimer);
      this.signalRefreshTimer = null;
    }
  }

  /** Whether the selected port is currently connected */
  get isConnected(): boolean {
    return this.serialInput?.isPortConnected(this.editPortIndex) ?? false;
  }

  /** Whether the selected port is shared with serial output */
  get isSharing(): boolean {
    const ps = this.serialInput?.portStates().get(this.editPortIndex);
    return ps?.sharing ?? false;
  }

  /** Approximate max WPM for current poll interval and debounce */
  get maxWpm(): number {
    const fromPoll = 600 / this.editPollInterval;
    const fromDebounce = 1200 / this.editDebounceMs;
    return Math.floor(Math.min(fromPoll, fromDebounce));
  }

  /** Refresh signal LED values from the service */
  private refreshSignals(): void {
    if (this.editPortIndex < 0 || !this.serialInput) return;
    const s = this.serialInput.getPortSignals(this.editPortIndex);
    if (!s) return;
    this.signalDsr = s.dsr;
    this.signalCts = s.cts;
    this.signalDcd = s.dcd;
    this.signalRi = s.ri;
  }

  /** Handle poll interval change — clamp to valid range */
  onPollIntervalChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 10;
    val = Math.max(SerialKeyInputService.MIN_POLL_INTERVAL,
      Math.min(SerialKeyInputService.MAX_POLL_INTERVAL, val));
    el.value = String(val);
    this.editPollInterval = val;
  }

  /** Handle debounce change — clamp to valid range */
  onDebounceChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 5;
    val = Math.max(SerialKeyInputService.MIN_DEBOUNCE,
      Math.min(SerialKeyInputService.MAX_DEBOUNCE, val));
    el.value = String(val);
    this.editDebounceMs = val;
  }

  /** Handle port selection change */
  onPortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value === '-2') {
      select.value = String(this.editPortIndex);
      this.serialInput.requestPort();
      return;
    }
    this.editPortIndex = parseInt(select.value, 10);
    this.refreshSignals();
  }

  /** Save the edited mapping after validation */
  save(): void {
    if (this.editMode === 'paddle' && this.editPin === this.editDahPin) {
      this.error = 'Dit and dah pins must be different.';
      return;
    }

    // Duplicate pin detection: only check mappings on the SAME port
    const dupError = this.checkDuplicates();
    if (dupError) {
      this.error = dupError;
      return;
    }

    this.saved.emit({
      mode: this.editMode,
      pin: this.editPin,
      dahPin: this.editMode === 'paddle' ? this.editDahPin : this.editPin,
      invert: this.editInvert,
      source: this.editSource,
      reversePaddles: this.editMode === 'paddle' ? this.editReversePaddles : false,
      paddleMode: this.editPaddleMode,
      portIndex: this.editPortIndex,
      pollInterval: this.editPollInterval,
      debounceMs: this.editDebounceMs,
      name: this.editName.trim(),
      color: this.editColor,
    });
  }

  /**
   * Check whether any pin in this mapping conflicts with an existing
   * mapping's pins on the SAME port. Returns an error message if a
   * conflict is found, or empty string if clear.
   */
  private checkDuplicates(): string {
    if (this.editPortIndex < 0) return '';

    const myPins = new Set<SerialInputPin>([this.editPin]);
    if (this.editMode === 'paddle') myPins.add(this.editDahPin);

    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      if (!other.enabled) continue;
      if (other.portIndex !== this.editPortIndex) continue;
      const otherPins = new Set<SerialInputPin>([other.pin]);
      if (other.mode === 'paddle') otherPins.add(other.dahPin);

      for (const p of myPins) {
        if (otherPins.has(p)) {
          const label = this.pins.find(x => x.value === p)?.label ?? p;
          return `Pin ${label} conflicts with mapping #${i + 1} on the same port. Each pin can only be used by one mapping per port.`;
        }
      }
    }
    return '';
  }

  /** Cancel without saving */
  cancel(): void {
    this.cancelled.emit();
  }

  /** Delete this mapping */
  delete(): void {
    this.deleted.emit();
  }
}
