/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { ConfirmService } from '../../../services/confirm.service';
import { CwInputService, CwStatus, cwStatusText } from '../../../services/cw-input.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — CW Tone Detector.
 *
 * CW audio tone detector: RX/TX, device, channel (left, right or both mixed),
 * name and colour. Tone, speed and levels are found by the detector itself.
 * Switching it on offers to mute a sidetone that would play along, and
 * switching it off offers to turn a muted sidetone back on. The
 * detector is only started, stopped or restarted in live Settings; a wizard
 * draft just holds the values.
 */
@Component({
  selector: 'app-cw-detector-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './cw-detector-item.component.html',
  styles: [':host { display: contents; }'],
})
export class CwDetectorItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';
  /** Wizard only: hide the on/off tick and always show the tuning fields (the wizard never switches the detector on by itself) */
  @Input() tuneOnly = false;

  /** Whether audio contexts are running (the detector starts at once only if so) */
  @Input() audioRunning = false;

  readonly scope = inject(SETTINGS_SCOPE);
  readonly devices = inject(AudioDeviceService);
  readonly cwInput = inject(CwInputService);
  private readonly confirm = inject(ConfirmService);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** The CW input and the pilot-tone mic key must not share one mic device */
  readonly cwInputConflict = computed<string | null>(() => {
    const s = this.s();
    if (!s.micInputEnabled) return null;
    const norm = (id: string) => id || 'default';
    return norm(s.cwInputDeviceId) === norm(s.inputDeviceId)
      ? 'CW audio input and Pilot tone detection both use the same mic device. Use a different device for CW input, or disable one.'
      : null;
  });

  /** One-line detector state, the same wording as the scope's status line */
  statusText(st: CwStatus): string {
    return cwStatusText(st);
  }

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') value = parseFloat(el.value);
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  /**
   * Master switch; the detector starts or stops only in live Settings with
   * audio running. Switching it on first offers to mute a sidetone that would
   * play every received tone: near a microphone the detector would hear it.
   * Switching it off offers to turn a muted sidetone back on.
   */
  async onCwEnabledChange(checked: boolean): Promise<void> {
    if (checked && this.sidetoneFollowsDetector()) {
      const mute = await this.confirm.ask({
        title: 'Mute the sidetone?',
        message: 'The sidetone would play every tone the CW detector hears. If the microphone can hear the '
          + 'speaker, the detector hears its own echo and decodes it again. Mute the sidetone? '
          + 'You can turn it back on in Settings → Outputs → Sidetone.',
        confirmLabel: 'Mute sidetone',
        cancelLabel: 'Keep sidetone',
      });
      if (mute) this.scope.update({ sidetoneEnabled: false });
    } else if (!checked && !this.s().sidetoneEnabled) {
      const unmute = await this.confirm.ask({
        title: 'Turn the sidetone back on?',
        message: 'The sidetone is off. Turn it back on now that the CW detector is off? '
          + 'You can also change it later in Settings → Outputs → Sidetone.',
        confirmLabel: 'Turn sidetone on',
        cancelLabel: 'Keep it off',
      });
      if (unmute) this.scope.update({ sidetoneEnabled: true });
    }
    this.scope.update({ cwInputEnabled: checked });
    if (!this.scope.isLive || !this.audioRunning) return;
    if (checked) await this.cwInput.start();
    else await this.cwInput.stop();
  }

  /** The sidetone is on and plays the direction (RX or TX) the detector feeds */
  private sidetoneFollowsDetector(): boolean {
    const s = this.s();
    return s.sidetoneEnabled && (s.sidetoneForward === 'both' || s.sidetoneForward === s.cwInputSource);
  }

  /** A new device or channel rewires the audio input, so a running detector restarts */
  async onCwInputChange(key: 'cwInputDeviceId' | 'cwInputChannel', event: Event): Promise<void> {
    this.scope.update({ [key]: (event.target as HTMLSelectElement).value } as Partial<AppSettings>);
    if (this.scope.isLive) await this.cwInput.restart();
  }
}
