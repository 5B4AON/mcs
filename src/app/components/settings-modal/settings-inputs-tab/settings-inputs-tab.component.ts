/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MicItemComponent } from '../../settings-items/mic/mic-item.component';
import { CwDetectorItemComponent } from '../../settings-items/cw-detector/cw-detector-item.component';
import { KeyboardKeyerItemComponent } from '../../settings-items/keyboard-keyer/keyboard-keyer-item.component';
import { EncoderItemComponent } from '../../settings-items/encoder/encoder-item.component';
import { MouseKeyerItemComponent } from '../../settings-items/mouse-keyer/mouse-keyer-item.component';
import { TouchKeyerItemComponent } from '../../settings-items/touch-keyer/touch-keyer-item.component';
import { SpriteKeyItemComponent } from '../../settings-items/sprite-key/sprite-key-item.component';
import { MidiInputItemComponent } from '../../settings-items/midi-input/midi-input-item.component';
import { SerialInputItemComponent } from '../../settings-items/serial-input/serial-input-item.component';
import { RtdbInputItemComponent } from '../../settings-items/rtdb-input/rtdb-input-item.component';

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
    MicItemComponent,
    CwDetectorItemComponent,
    KeyboardKeyerItemComponent,
    EncoderItemComponent,
    MouseKeyerItemComponent,
    TouchKeyerItemComponent,
    SpriteKeyItemComponent,
    MidiInputItemComponent,
    SerialInputItemComponent,
    RtdbInputItemComponent,
  ],
  templateUrl: './settings-inputs-tab.component.html',
})
export class SettingsInputsTabComponent {
  /** Whether audio contexts are running (passed to child cards that need it) */
  @Input() audioRunning = false;

  /** Emitted with the requested Help section ID from a child card. */
  @Output() readonly helpRequested = new EventEmitter<string>();
}
