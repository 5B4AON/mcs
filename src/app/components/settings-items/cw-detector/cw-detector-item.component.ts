/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { CwDecoderControlService } from '../../../services/cw-decoder-control.service';
import { ConfirmService } from '../../../services/confirm.service';
import { CwInputService, CwStatus, cwStatusText } from '../../../services/cw-input.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { CwFilePipeline } from './cw-detector-item.model';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — CW Tone Decoder.
 *
 * CW audio tone detector: RX/TX, device, channel (left, right or both mixed),
 * name and colour. Tone, speed and levels are found by the detector itself.
 * The switch only sets the decoder up: it is then listed in the main screen's
 * Mode list, and choosing it there starts it (see CwDecoderControlService, which
 * asks about prosigns that erase text, muting the sidetone and keeping the screen on).
 * The detector is only restarted (new device or channel) in live Settings; a
 * wizard draft just holds the values.
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
  private readonly control = inject(CwDecoderControlService);

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
   * Master switch. In live Settings it only sets the decoder up (it then appears in the main screen's Mode list;
   * choosing it there starts it, with the questions that go with that). Switching it off while the decoder is
   * listening stops it. In a wizard draft it holds both values: ticking it means "decode now" at Apply.
   */
  async onCwEnabledChange(checked: boolean): Promise<void> {
    if (!this.scope.isLive) {
      this.scope.update({ cwInputEnabled: checked, cwDecoderActive: checked });
      return;
    }
    if (!checked) await this.control.deactivate(this.audioRunning);
    this.scope.update({ cwInputEnabled: checked });
  }

  /**
   * Where text decoded from an audio file goes. Choosing the full pipeline
   * first asks: it makes a loaded file send its text to the switched-on
   * outputs (WinKeyer, MIDI, RTDB). Cancel keeps it on this device.
   */
  async onFilePipelineChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const value = select.value as CwFilePipeline;
    if (value === 'full') {
      const ok = await this.confirm.ask({
        title: 'Send audio file text to your outputs?',
        message: 'With the full pipeline, the text decoded from a loaded audio file is sent to the WinKeyer, MIDI and '
          + 'Firebase RTDB outputs you have switched on, just like text from the microphone. A recording could make a '
          + 'radio transmit. Choose the full pipeline only if that is what you want.',
        confirmLabel: 'Use full pipeline',
        cancelLabel: 'Keep this device only',
        danger: true,
      });
      if (!ok) {
        select.value = this.s().cwFilePipeline;
        return;
      }
    }
    this.scope.update({ cwFilePipeline: value });
  }

  /** A new device or channel rewires the audio input, so a running detector restarts */
  async onCwInputChange(key: 'cwInputDeviceId' | 'cwInputChannel', event: Event): Promise<void> {
    this.scope.update({ [key]: (event.target as HTMLSelectElement).value } as Partial<AppSettings>);
    if (this.scope.isLive) await this.cwInput.restart();
  }
}
