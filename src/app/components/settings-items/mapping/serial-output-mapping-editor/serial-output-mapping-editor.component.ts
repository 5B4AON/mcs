/**
 * Morse Code Studio
 */

import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SerialOutputMapping, SerialPin } from '../../serial-output/serial-output-item.model';
import { SerialInputMapping } from '../../serial-input/serial-input-item.model';
import { OutputForward } from '../../../../services/settings-common';
import { SerialKeyOutputService } from '../../../../services/serial-key-output.service';
import { SETTINGS_SCOPE } from '../../settings-scope';

/** Result of a validated serial output mapping edit (one mapping, ready to store). */
export interface SerialOutputEditSaveEvent {
  portIndex: number;
  pin: SerialPin;
  invert: boolean;
  forward: OutputForward;
  relayInputIndices: number[];
  relaySuppressOtherInputs: boolean;
}

/**
 * The fields of one serial output mapping: port (with an explicit "Add
 * serial port" request), output pin (DTR/RTS), invert, forward direction,
 * relay from serial inputs and a test button. Frameless, so Settings shows
 * it in a popup and the wizard flat on a step. The host calls `build()` to
 * get the mapping values. A duplicate port+pin is only a warning. The test
 * button pulses the saved mapping, so it exists only in live Settings for
 * an already stored mapping (never in a wizard draft).
 */
@Component({
  selector: 'app-serial-output-mapping-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './serial-output-mapping-editor.component.html',
  styles: [':host { display: block; }'],
})
export class SerialOutputMappingEditorComponent implements OnChanges {
  /** The mapping to start from */
  @Input() mapping: SerialOutputMapping = {
    enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
    relaySuppressOtherInputs: false,
  };

  /** Index of the mapping being edited (-1 for a new one) */
  @Input() editIndex = -1;

  /** All output mappings, for the duplicate warning */
  @Input() allMappings: SerialOutputMapping[] = [];

  /** Serial input mappings that can be relayed through this output */
  @Input() serialInputMappings: SerialInputMapping[] = [];

  /** Prefix that keeps element ids unique when two editors exist at once */
  @Input() idPrefix = 'serialOut';

  editPortIndex = -1;
  editPin: SerialPin = 'dtr';
  editInvert = false;
  editForward: OutputForward = 'tx';
  editRelayInputIndices: number[] = [];
  editRelaySuppressOtherInputs = false;

  readonly pins: { value: SerialPin; label: string }[] = [
    { value: 'dtr', label: 'DTR (Data Terminal Ready)' },
    { value: 'rts', label: 'RTS (Request To Send)' },
  ];

  readonly scope = inject(SETTINGS_SCOPE);

  constructor(public serialOutput: SerialKeyOutputService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapping']) this.load();
  }

  private load(): void {
    const m = this.mapping;
    this.editPortIndex = m.portIndex;
    this.editPin = m.pin;
    this.editInvert = m.invert;
    this.editForward = m.forward;
    this.editRelayInputIndices = [...(m.relayInputIndices || [])];
    this.editRelaySuppressOtherInputs = m.relaySuppressOtherInputs ?? false;
  }

  /** The fields as they stand now, to tell whether anything was changed. */
  fields(): SerialOutputEditSaveEvent {
    return {
      portIndex: this.editPortIndex,
      pin: this.editPin,
      invert: this.editInvert,
      forward: this.editForward,
      relayInputIndices: [...this.editRelayInputIndices],
      relaySuppressOtherInputs: this.editRelaySuppressOtherInputs,
    };
  }

  /** Put the fields back to the `mapping` input. */
  reset(): void {
    this.load();
  }

  /** Nothing here can be invalid; the method exists so all editors share one host contract. */
  build(): SerialOutputEditSaveEvent | null {
    return this.fields();
  }

  get isConnected(): boolean {
    return this.serialOutput.isPortConnected(this.editPortIndex);
  }

  /** The test pulses the stored mapping, so only live Settings can offer it. */
  get canTest(): boolean {
    return this.scope.isLive && this.editIndex >= 0 && this.isConnected;
  }

  /** Port choice; "+ Add serial port" asks the browser for a port (explicit user action). */
  onPortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value === '-2') {
      select.value = String(this.editPortIndex);
      this.serialOutput.requestPort();
      return;
    }
    this.editPortIndex = parseInt(select.value, 10);
  }

  /** Non-blocking warning when another mapping uses the same port and pin. */
  get warning(): string {
    if (this.editPortIndex < 0) return '';
    for (let i = 0; i < this.allMappings.length; i++) {
      if (i === this.editIndex) continue;
      const m = this.allMappings[i];
      if (m.portIndex === this.editPortIndex && m.pin === this.editPin) {
        return `Another mapping (#${i + 1}) also uses ${this.editPin.toUpperCase()} on this port. This is allowed but may cause unexpected behaviour if both mappings fire simultaneously.`;
      }
    }
    return '';
  }

  /** Toggle the selected pin for 1 second (explicit click, live Settings only). */
  async testOutput(): Promise<void> {
    if (this.canTest) await this.serialOutput.test(this.editIndex);
  }

  /** Whether a serial input mapping's source matches the forward setting */
  isInputCompatible(input: SerialInputMapping): boolean {
    return this.editForward === 'both' || input.source === this.editForward;
  }

  /** Add or remove a serial input mapping index in the relay list */
  toggleRelayInput(index: number): void {
    const pos = this.editRelayInputIndices.indexOf(index);
    if (pos >= 0) this.editRelayInputIndices.splice(pos, 1);
    else this.editRelayInputIndices.push(index);
  }

  /** Short label for a serial input mapping */
  inputMappingLabel(m: SerialInputMapping, index: number): string {
    const mode = m.mode === 'straightKey' ? 'Straight' : 'Paddle';
    const name = m.name ? ` (${m.name})` : '';
    return `#${index + 1} ${mode} ${m.pin.toUpperCase()} [${m.source.toUpperCase()}]${name}`;
  }
}
