/**
 * Morse Code Studio
 */

import { Injectable, computed } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * Tells the decoder and the output forwarding when keying must stay on this
 * device. While Send practice is the active mode with the "This device only"
 * pipeline, practice keying drives only the sidetone and vibration: nothing
 * reaches the serial, MIDI, WinKeyer or RTDB outputs. A key wired straight to
 * a transmitter is outside the app's control and still transmits.
 */
@Injectable({ providedIn: 'root' })
export class SendPracticeGateService {
  /** True while external outputs must not receive keyed characters */
  readonly blocked = computed(() => {
    const s = this.settings.settings();
    return s.encoderMode === 'send-practice' && s.sendPracticePipeline === 'local';
  });

  constructor(private settings: SettingsService) {}
}
