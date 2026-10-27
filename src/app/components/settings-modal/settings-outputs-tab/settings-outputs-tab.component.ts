/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AudioOutputItemComponent } from '../../settings-items/audio-output/audio-output-item.component';
import { SerialOutputItemComponent } from '../../settings-items/serial-output/serial-output-item.component';
import { WinkeyerItemComponent } from '../../settings-items/winkeyer/winkeyer-item.component';
import { RtdbOutputCardComponent } from './rtdb-output-card/rtdb-output-card.component';
import { MidiOutputItemComponent } from '../../settings-items/midi-output/midi-output-item.component';
import { SidetoneItemComponent } from '../../settings-items/sidetone/sidetone-item.component';
import { VibrationItemComponent } from '../../settings-items/vibration/vibration-item.component';

/**
 * Settings — Outputs tab.
 *
 * Thin shell that renders the seven output settings cards as independent
 * child components. Each card encapsulates its own expand/collapse state,
 * service injections, and event handlers.
 */
@Component({
  selector: 'app-settings-outputs-tab',
  standalone: true,
  imports: [
    AudioOutputItemComponent,
    SerialOutputItemComponent,
    WinkeyerItemComponent,
    RtdbOutputCardComponent,
    MidiOutputItemComponent,
    SidetoneItemComponent,
    VibrationItemComponent,
  ],
  templateUrl: './settings-outputs-tab.component.html',
})
export class SettingsOutputsTabComponent {
  /** Whether audio contexts are running (passed to child cards that need it) */
  @Input() audioRunning = false;

  /** Emitted with the requested Help section ID from a child card. */
  @Output() readonly helpRequested = new EventEmitter<string>();
}
