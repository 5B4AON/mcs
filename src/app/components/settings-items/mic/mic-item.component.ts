/**
 * Morse Code Studio
 */

import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { AudioInputService } from '../../../services/audio-input.service';
import { AudioOutputService } from '../../../services/audio-output.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Straight Key via Mic (pilot tone detection).
 *
 * An ultrasonic pilot tone is routed through an external hardware key into the
 * microphone input. Device selection, threshold, debounce and invert live here.
 * Starting or stopping the capture, retuning the detector and the calibration
 * buttons only act in live Settings; a wizard draft just holds the values.
 */
@Component({
  selector: 'app-mic-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './mic-item.component.html',
  styles: [':host { display: contents; }'],
})
export class MicItemComponent implements OnInit, OnDestroy {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** Whether audio contexts are running (controls the calibration buttons) */
  @Input() audioRunning = false;

  readonly scope = inject(SETTINGS_SCOPE);
  readonly devices = inject(AudioDeviceService);
  readonly audioInput = inject(AudioInputService);
  readonly audioOutput = inject(AudioOutputService);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Which calibration phase is active (`null` = idle) */
  calibrating: 'open' | 'closed' | null = null;
  /** RMS level measured during "key open" calibration */
  calibOpenRms: number | null = null;
  /** RMS level measured during "key closed" calibration */
  calibClosedRms: number | null = null;

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.audioInput.calibration$.subscribe(result => {
        if (result.state === 'open') this.calibOpenRms = result.rms;
        else if (result.state === 'closed') this.calibClosedRms = result.rms;
        this.calibrating = null;
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') value = parseFloat(el.value);
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Master switch; the capture and pilot tone start or stop only in live Settings with audio running */
  async onMicEnabledChange(checked: boolean): Promise<void> {
    this.scope.update({ micInputEnabled: checked });
    if (!this.scope.isLive || !this.audioRunning) return;
    if (checked) {
      await this.audioInput.start();
      await this.audioOutput.startPilot();
    } else {
      await this.audioInput.stop();
      await this.audioOutput.stopPilot();
    }
  }

  /** Pilot tone / threshold numeric parameter changes */
  onInputParamChange(key: keyof AppSettings, event: Event): void {
    this.scope.update({ [key]: parseFloat((event.target as HTMLInputElement).value) } as Partial<AppSettings>);
    if (this.scope.isLive) this.audioInput.updateParams();
  }

  /** Invert key sense toggle */
  onInputInvertChange(event: Event): void {
    this.scope.update({ inputInvert: (event.target as HTMLInputElement).checked });
    if (this.scope.isLive) this.audioInput.updateParams();
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
    if (this.calibOpenRms === null || this.calibClosedRms === null) return;
    const threshold = (this.calibOpenRms + this.calibClosedRms) / 2;
    this.scope.update({ inputThreshold: Math.round(threshold * 10000) / 10000 });
    this.audioInput.updateParams();
  }
}
