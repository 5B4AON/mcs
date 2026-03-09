/**
 * Morse Code Studio
 */

import { Component, Input, OnInit, OnDestroy, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings } from '../../../../services/settings.service';
import { AudioDeviceService } from '../../../../services/audio-device.service';
import { CwInputService, CwLevelEvent } from '../../../../services/cw-input.service';

/**
 * Settings card — CW Tone Detector.
 *
 * Configures the Goertzel-based CW audio tone detector, including
 * device/channel selection, frequency/bandwidth tuning, auto or manual
 * threshold, and debounce controls.
 */
@Component({
  selector: 'app-cw-detector-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cw-detector-card.component.html',
  styles: [':host { display: contents; }'],
})
export class CwDetectorCardComponent implements OnInit, OnDestroy {
  /** Whether audio contexts are running */
  @Input() audioRunning = false;

  /** Whether this card's body is expanded */
  expanded = false;

  // ---- CW level tracking ----
  cwNoiseFloor = 0;
  cwSignalPeak = 0;
  cwThreshold = 0;

  private subs: Subscription[] = [];

  /**
   * Conflict: CW audio input uses the same mic device as pilot tone detection.
   */
  readonly cwInputConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    if (!s.micInputEnabled) return null;
    const norm = (id: string) => id || 'default';
    if (norm(s.cwInputDeviceId) === norm(s.inputDeviceId)) {
      return 'CW audio input and Pilot tone detection both use the same mic device. Use a different device for CW input, or disable one.';
    }
    return null;
  });

  constructor(
    public settings: SettingsService,
    public devices: AudioDeviceService,
    public cwInput: CwInputService,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwNoiseFloor = lvl.noiseFloor;
        this.cwSignalPeak = lvl.signalPeak;
        this.cwThreshold = lvl.threshold;
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

  /** Handle CW input enabled toggle */
  async onCwEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ cwInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.cwInput.start();
      } else {
        await this.cwInput.stop();
      }
    }
  }

  /** Handle CW detector parameter changes */
  onCwParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: any;
    if (el.type === 'checkbox') {
      value = (el as any).checked;
    } else if (el.tagName === 'SELECT' || isNaN(parseFloat(el.value))) {
      value = el.value;
    } else {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.cwInput.updateParams();
  }
}
