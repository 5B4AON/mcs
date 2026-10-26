/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { AudioOutputService } from '../../../services/audio-output.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Audio Key Output (optocoupler keying via sound card).
 *
 * Drives an opto-isolator from a sound card channel with a DC level or an AC
 * tone. Card in Settings, flat block in wizard steps. The output test only
 * runs in live Settings: a wizard keeps a draft and never keys hardware.
 */
@Component({
  selector: 'app-audio-output-item',
  standalone: true,
  imports: [ItemShellComponent],
  templateUrl: './audio-output-item.component.html',
  styles: [':host { display: contents; }'],
})
export class AudioOutputItemComponent {
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

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }
}
