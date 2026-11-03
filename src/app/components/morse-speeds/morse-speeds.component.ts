/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SettingsService, AppSettings } from '../../services/settings.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { MorseDecoderService } from '../../services/morse-decoder.service';

/**
 * The Morse Speeds block of both kebab menus (main screen and full screen). RX and TX show the
 * speed the decoder currently estimates and can only be reset to the default start speed (which
 * also restarts the adaptive calibration); the encoder and keyer speeds have round − / + buttons.
 * Row styles (`kebab-step-*`) are global in `src/styles.css`, shared with the fullscreen Styling block.
 */
@Component({
  selector: 'app-morse-speeds',
  standalone: true,
  templateUrl: './morse-speeds.component.html',
  styles: [':host { display: flex; flex-direction: column; align-items: stretch; gap: .85rem; }'],
})
export class MorseSpeedsComponent {
  readonly MIN_WPM = 5;
  readonly MAX_WPM = 50;

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    private devices: AudioDeviceService,
  ) {}

  /** Move the encoder or keyer speed by one WPM, clamped to 5–50, and save it */
  nudge(key: 'encoderWpm' | 'keyerWpm', delta: number): void {
    const v = Math.max(this.MIN_WPM, Math.min(this.MAX_WPM, this.settings.settings()[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    this.save();
  }

  /** Back to the app default start speed (saved), restarting the adaptive calibration */
  resetDecoderSpeed(source: 'rx' | 'tx'): void {
    const defaults = this.settings.getDefaults();
    if (source === 'rx') {
      this.settings.update({ rxDecoderWpm: defaults.rxDecoderWpm });
      this.decoder.resetRxCalibration();
    } else {
      this.settings.update({ txDecoderWpm: defaults.txDecoderWpm });
      this.decoder.resetTxCalibration();
    }
    this.save();
  }

  private save(): void {
    this.settings.save(this.devices.inputDevices(), this.devices.outputDevices());
  }
}
