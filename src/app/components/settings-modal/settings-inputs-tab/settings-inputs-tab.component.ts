/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, Input } from '@angular/core';
import { MicCardComponent } from './mic-card/mic-card.component';
import { CwDetectorCardComponent } from './cw-detector-card/cw-detector-card.component';
import { KeyboardKeyerCardComponent } from './keyboard-keyer-card/keyboard-keyer-card.component';
import { MouseKeyerCardComponent } from './mouse-keyer-card/mouse-keyer-card.component';
import { TouchKeyerCardComponent } from './touch-keyer-card/touch-keyer-card.component';
import { MidiInputCardComponent } from './midi-input-card/midi-input-card.component';
import { RtdbInputCardComponent } from './rtdb-input-card/rtdb-input-card.component';

/**
 * Settings — Inputs tab.
 *
 * Thin shell that renders the seven input settings cards as independent
 * child components. Each card encapsulates its own expand/collapse state,
 * service injections, subscriptions, and event handlers.
 */
@Component({
  selector: 'app-settings-inputs-tab',
  standalone: true,
  imports: [
    MicCardComponent,
    CwDetectorCardComponent,
    KeyboardKeyerCardComponent,
    MouseKeyerCardComponent,
    TouchKeyerCardComponent,
    MidiInputCardComponent,
    RtdbInputCardComponent,
  ],
  templateUrl: './settings-inputs-tab.component.html',
})
export class SettingsInputsTabComponent {
  /** Whether audio contexts are running (passed to child cards that need it) */
  @Input() audioRunning = false;
}
