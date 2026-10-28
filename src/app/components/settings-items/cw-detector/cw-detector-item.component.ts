/**
 * Morse Code Studio
 */

import { Component, Input, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { CwInputService, CwLevelEvent } from '../../../services/cw-input.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — CW Tone Detector.
 *
 * Goertzel-based CW audio tone detector: device/channel, tone frequency and
 * bandwidth, auto or manual threshold, debounce, name and colour. The detector
 * is only started, stopped or retuned in live Settings; a wizard draft just
 * holds the values.
 */
@Component({
  selector: 'app-cw-detector-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './cw-detector-item.component.html',
  styles: [':host { display: contents; }'],
})
export class CwDetectorItemComponent implements OnInit, OnDestroy {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';
  /** Wizard only: hide the on/off tick and always show the tuning fields (the wizard never switches the detector on by itself) */
  @Input() tuneOnly = false;

  /** Whether audio contexts are running (the detector starts at once only if so) */
  @Input() audioRunning = false;

  readonly scope = inject(SETTINGS_SCOPE);
  readonly devices = inject(AudioDeviceService);
  readonly cwInput = inject(CwInputService);

  /** Current values from the scope */
  readonly s = this.scope.value;

  cwNoiseFloor = 0;
  cwSignalPeak = 0;
  cwThreshold = 0;

  private subs: Subscription[] = [];

  /** The CW input and the pilot-tone mic key must not share one mic device */
  readonly cwInputConflict = computed<string | null>(() => {
    const s = this.s();
    if (!s.micInputEnabled) return null;
    const norm = (id: string) => id || 'default';
    return norm(s.cwInputDeviceId) === norm(s.inputDeviceId)
      ? 'CW audio input and Pilot tone detection both use the same mic device. Use a different device for CW input, or disable one.'
      : null;
  });

  ngOnInit(): void {
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwNoiseFloor = lvl.noiseFloor;
        this.cwSignalPeak = lvl.signalPeak;
        this.cwThreshold = lvl.threshold;
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

  /** Master switch; the detector starts or stops only in live Settings with audio running */
  async onCwEnabledChange(checked: boolean): Promise<void> {
    this.scope.update({ cwInputEnabled: checked });
    if (!this.scope.isLive || !this.audioRunning) return;
    if (checked) await this.cwInput.start();
    else await this.cwInput.stop();
  }

  /** Detector parameter changes (select, checkbox, number or range) */
  onCwParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number | boolean;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.tagName === 'SELECT' || isNaN(parseFloat(el.value))) value = el.value;
    else value = parseFloat(el.value);
    this.scope.update({ [key]: value } as Partial<AppSettings>);
    if (this.scope.isLive) this.cwInput.updateParams();
  }
}
