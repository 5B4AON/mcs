/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';
import { AudioOutputCardComponent } from './audio-output-card/audio-output-card.component';
import { SerialOutputCardComponent } from './serial-output-card/serial-output-card.component';
import { WinkeyerCardComponent } from './winkeyer-card/winkeyer-card.component';
import { RtdbOutputCardComponent } from './rtdb-output-card/rtdb-output-card.component';
import { MidiOutputCardComponent } from './midi-output-card/midi-output-card.component';
import { SidetoneCardComponent } from './sidetone-card/sidetone-card.component';
import { VibrationCardComponent } from './vibration-card/vibration-card.component';

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
    AudioOutputCardComponent,
    SerialOutputCardComponent,
    WinkeyerCardComponent,
    RtdbOutputCardComponent,
    MidiOutputCardComponent,
    SidetoneCardComponent,
    VibrationCardComponent,
  ],
  templateUrl: './settings-outputs-tab.component.html',
})
export class SettingsOutputsTabComponent {
  /** Whether audio contexts are running (passed to child cards that need it) */
  @Input() audioRunning = false;
}
