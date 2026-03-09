/**
 * Morse Code Studio
 */

import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { AudioDeviceService } from '../../../../services/audio-device.service';
import { AudioInputService } from '../../../../services/audio-input.service';
import { AudioOutputService } from '../../../../services/audio-output.service';

/**
 * Settings card — Straight Key via Mic (pilot tone detection).
 *
 * Configures pilot-tone-based keying where an ultrasonic tone is
 * routed through an external hardware key. The card provides device
 * selection, threshold/calibration controls, debounce, and invert.
 */
@Component({
  selector: 'app-mic-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mic-card.component.html',
  styles: [':host { display: contents; }'],
})
export class MicCardComponent implements OnInit, OnDestroy {
  /** Whether audio contexts are running (controls test/calibration buttons) */
  @Input() audioRunning = false;

  /** Whether this card's body is expanded */
  expanded = false;

  // ---- Calibration state ----
  /** Which calibration phase is active (`null` = idle) */
  calibrating: 'open' | 'closed' | null = null;
  /** RMS level measured during "key open" calibration */
  calibOpenRms: number | null = null;
  /** RMS level measured during "key closed" calibration */
  calibClosedRms: number | null = null;

  private subs: Subscription[] = [];

  constructor(
    public settings: SettingsService,
    public devices: AudioDeviceService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.audioInput.calibration$.subscribe(result => {
        if (result.state === 'open') {
          this.calibOpenRms = result.rms;
        } else if (result.state === 'closed') {
          this.calibClosedRms = result.rms;
        }
        this.calibrating = null;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Handle mic input enabled toggle */
  async onMicEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ micInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.audioInput.start();
        await this.audioOutput.startPilot();
      } else {
        await this.audioInput.stop();
        await this.audioOutput.stopPilot();
      }
    }
  }

  /** Handle pilot tone / threshold numeric parameter changes */
  onInputParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    const value = parseFloat(el.value);
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.audioInput.updateParams();
  }

  /** Handle mic input invert toggle */
  onInputInvertChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ inputInvert: checked });
    this.audioInput.updateParams();
  }

  /** Start the "key open" calibration measurement */
  calibrateOpen(): void {
    this.calibrating = 'open';
    this.audioInput.calibrate('open');
  }

  /** Start the "key closed" calibration measurement */
  calibrateClosed(): void {
    this.calibrating = 'closed';
    this.audioInput.calibrate('closed');
  }

  /** Apply the midpoint of open/closed calibration values as the threshold */
  applyCalibration(): void {
    if (this.calibOpenRms !== null && this.calibClosedRms !== null) {
      const threshold = (this.calibOpenRms + this.calibClosedRms) / 2;
      this.settings.update({ inputThreshold: Math.round(threshold * 10000) / 10000 });
      this.audioInput.updateParams();
    }
  }
}
