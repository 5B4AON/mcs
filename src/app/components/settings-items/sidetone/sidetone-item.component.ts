/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { AudioOutputService } from '../../../services/audio-output.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { StepperComponent } from '../stepper/stepper.component';
import { playTestTone } from '../test-tone';

/**
 * Settings item — Sidetone (audio feedback tone during keying).
 *
 * Device/channel selection, frequency, amplitude and a test button.
 * Used as a card in Settings and as a flat block in setup wizards; values go
 * through the injected settings scope, so a wizard keeps them as a draft.
 */
@Component({
  selector: 'app-sidetone-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, StepperComponent],
  templateUrl: './sidetone-item.component.html',
  styles: [':host { display: contents; } .amplitude-value { font-weight: 600; margin-top: .6rem; }'],
})
export class SidetoneItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** Whether audio contexts are running (enables the test button) */
  @Input() audioRunning = false;

  readonly scope = inject(SETTINGS_SCOPE);
  readonly devices = inject(AudioDeviceService);
  readonly audioOutput = inject(AudioOutputService);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Amplitude is stored from 0 to 1 and shown as 0 to 100 percent */
  get amplitudePercent(): number {
    return Math.round(this.s().sidetoneAmplitude * 100);
  }

  setAmplitudePercent(percent: number): void {
    this.scope.update({ sidetoneAmplitude: percent / 100 });
  }

  /** Wizard test: play the draft values through a throwaway audio context, leaving live audio alone */
  testDraft(): void {
    const v = this.s();
    void playTestTone({
      frequency: v.sidetoneFrequency,
      amplitude: v.sidetoneAmplitude,
      channel: v.sidetoneOutputChannel,
      deviceId: v.sidetoneOutputDeviceId,
    });
  }
}
