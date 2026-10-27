/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MicCardComponent } from './mic-card/mic-card.component';
import { CwDetectorCardComponent } from './cw-detector-card/cw-detector-card.component';
import { KeyboardKeyerItemComponent } from '../../settings-items/keyboard-keyer/keyboard-keyer-item.component';
import { EncoderItemComponent } from '../../settings-items/encoder/encoder-item.component';
import { MouseKeyerItemComponent } from '../../settings-items/mouse-keyer/mouse-keyer-item.component';
import { TouchKeyerItemComponent } from '../../settings-items/touch-keyer/touch-keyer-item.component';
import { SpriteKeyItemComponent } from '../../settings-items/sprite-key/sprite-key-item.component';
import { MidiInputItemComponent } from '../../settings-items/midi-input/midi-input-item.component';
import { SerialInputItemComponent } from '../../settings-items/serial-input/serial-input-item.component';
import { RtdbInputCardComponent } from './rtdb-input-card/rtdb-input-card.component';

/**
 * Settings — Inputs tab.
 *
 * Thin shell that renders the ten input settings cards as independent
 * child components. Each card encapsulates its own expand/collapse state,
 * service injections, subscriptions, and event handlers.
 */
@Component({
  selector: 'app-settings-inputs-tab',
  standalone: true,
  imports: [
    MicCardComponent,
    CwDetectorCardComponent,
    KeyboardKeyerItemComponent,
    EncoderItemComponent,
    MouseKeyerItemComponent,
    TouchKeyerItemComponent,
    SpriteKeyItemComponent,
    MidiInputItemComponent,
    SerialInputItemComponent,
    RtdbInputCardComponent,
  ],
  templateUrl: './settings-inputs-tab.component.html',
})
export class SettingsInputsTabComponent {
  /** Whether audio contexts are running (passed to child cards that need it) */
  @Input() audioRunning = false;

  /** Emitted with the requested Help section ID from a child card. */
  @Output() readonly helpRequested = new EventEmitter<string>();
}
