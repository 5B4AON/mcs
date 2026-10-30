/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SerialInputMapping, SerialInputPin } from '../../serial-input/serial-input-item.model';
import { KeyInputMode, DecoderSource, PaddleMode } from '../../../../services/settings-common';
import { SerialKeyInputService } from '../../../../services/serial-key-input.service';
import { HelpLinkButtonComponent } from '../../help-link-button/help-link-button.component';
import { MappingIdentityFieldsComponent } from '../identity-fields/mapping-identity-fields.component';

/** Result of a validated serial input mapping edit (one mapping, ready to store). */
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
 * The fields of one serial input mapping: port (with an explicit "Add serial
 * port" request), live signal LEDs, poll interval and debounce, mode, pins,
 * invert, RX/TX use, paddle options, name and colour. Frameless, so Settings
 * shows it in a popup and the wizard flat on a step. No port is opened here:
 * choosing "+ Add serial port" asks the browser's permission prompt, and
 * the service opens ports itself once the item is enabled.
 * The host calls `build()` to validate and get the mapping values (null if invalid).
 */
@Component({
  selector: 'app-serial-input-mapping-editor',
  standalone: true,
  imports: [FormsModule, HelpLinkButtonComponent, MappingIdentityFieldsComponent],
  templateUrl: './serial-input-mapping-editor.component.html',
  styles: [':host { display: block; }'],
})
export class SerialInputMappingEditorComponent implements OnInit, OnChanges, OnDestroy {
  /** The mapping to start from */
  @Input() mapping: SerialInputMapping = {
    enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
    invert: false, source: 'rx', reversePaddles: false,
    paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
    debounceMs: 5, name: '', color: '',
  };

  /** Index of the mapping being edited (-1 for a new one) */
  @Input() editIndex = -1;

  /** All mappings, for pin conflict detection */
  @Input() allMappings: SerialInputMapping[] = [];

  /** Prefix that keeps element ids unique when two editors exist at once */
  @Input() idPrefix = 'serialIn';

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

  error = '';

  /** Cached signal values for the LEDs (refreshed by a timer) */
  signalDsr = false;
  signalCts = false;
  signalDcd = false;
  signalRi = false;

  private signalRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly pins: { value: SerialInputPin; label: string }[] = [
    { value: 'dsr', label: 'DSR (Data Set Ready)' },
    { value: 'cts', label: 'CTS (Clear To Send)' },
    { value: 'dcd', label: 'DCD (Data Carrier Detect)' },
    { value: 'ri', label: 'RI (Ring Indicator)' },
  ];

  constructor(public serialInput: SerialKeyInputService) {}

  ngOnInit(): void {
    this.refreshSignals();
    this.signalRefreshTimer = setInterval(() => this.refreshSignals(), 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapping']) this.load();
  }

  ngOnDestroy(): void {
    if (this.signalRefreshTimer) clearInterval(this.signalRefreshTimer);
  }

  private load(): void {
    const m = this.mapping;
    this.editMode = m.mode;
    this.editPin = m.pin;
    this.editDahPin = m.dahPin;
    this.editInvert = m.invert;
    this.editSource = m.source;
    this.editReversePaddles = m.reversePaddles;
    this.editPaddleMode = m.paddleMode;
    this.editPortIndex = m.portIndex;
    this.editPollInterval = m.pollInterval;
    this.editDebounceMs = m.debounceMs;
    this.editName = m.name || '';
    this.editColor = m.color || '';
    this.error = '';
  }

  /** The fields as they stand now (no validation), to tell whether anything was changed. */
  fields(): SerialInputEditSaveEvent {
    const paddle = this.editMode === 'paddle';
    return {
      mode: this.editMode,
      pin: this.editPin,
      dahPin: paddle ? this.editDahPin : this.editPin,
      invert: this.editInvert,
      source: this.editSource,
      reversePaddles: paddle ? this.editReversePaddles : false,
      paddleMode: this.editPaddleMode,
      portIndex: this.editPortIndex,
      pollInterval: this.editPollInterval,
      debounceMs: this.editDebounceMs,
      name: this.editName.trim(),
      color: this.editColor,
    };
  }

  /** Put the fields back to the `mapping` input. */
  reset(): void {
    this.load();
  }

  /** Whether the selected port is currently connected */
  get isConnected(): boolean {
    return this.serialInput.isPortConnected(this.editPortIndex);
  }

  /** Whether the selected port is shared with serial output */
  get isSharing(): boolean {
    return this.serialInput.portStates().get(this.editPortIndex)?.sharing ?? false;
  }

  /** Approximate max WPM for the current poll interval and debounce */
  get maxWpm(): number {
    return Math.floor(Math.min(600 / this.editPollInterval, 1200 / this.editDebounceMs));
  }

  private refreshSignals(): void {
    if (this.editPortIndex < 0) return;
    const s = this.serialInput.getPortSignals(this.editPortIndex);
    if (!s) return;
    this.signalDsr = s.dsr;
    this.signalCts = s.cts;
    this.signalDcd = s.dcd;
    this.signalRi = s.ri;
  }

  /** Poll interval change, clamped to the valid range */
  onPollIntervalChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 10;
    val = Math.max(SerialKeyInputService.MIN_POLL_INTERVAL, Math.min(SerialKeyInputService.MAX_POLL_INTERVAL, val));
    el.value = String(val);
    this.editPollInterval = val;
  }

  /** Debounce change, clamped to the valid range */
  onDebounceChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    let val = Math.round(parseFloat(el.value));
    if (isNaN(val)) val = 5;
    val = Math.max(SerialKeyInputService.MIN_DEBOUNCE, Math.min(SerialKeyInputService.MAX_DEBOUNCE, val));
    el.value = String(val);
    this.editDebounceMs = val;
  }

  /** Port choice; "+ Add serial port" asks the browser for a port (explicit user action). */
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

  /** Validate the fields; returns the mapping values, or null with `error` set. */
  build(): SerialInputEditSaveEvent | null {
    if (this.editMode === 'paddle' && this.editPin === this.editDahPin) {
      this.error = 'Dit and dah pins must be different.';
      return null;
    }
    const dupError = this.checkDuplicates();
    if (dupError) {
      this.error = dupError;
      return null;
    }
    this.error = '';
    return this.fields();
  }

  /** Error text when a pin is already used by another enabled mapping on the same port. */
  private checkDuplicates(): string {
    if (this.editPortIndex < 0) return '';
    const myPins = new Set<SerialInputPin>([this.editPin]);
    if (this.editMode === 'paddle') myPins.add(this.editDahPin);
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const other = this.allMappings[i];
      if (!other.enabled || other.portIndex !== this.editPortIndex) continue;
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
}
