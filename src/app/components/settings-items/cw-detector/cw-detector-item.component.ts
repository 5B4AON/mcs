/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isMobileDevice } from '../../../services/settings-common';
import { AppSettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { ClearService } from '../../../services/clear.service';
import { ConfirmService } from '../../../services/confirm.service';
import { erasingProsigns, joinPhrases } from '../../../services/prosign-erase';
import { WakeLockService } from '../../../services/wake-lock.service';
import { CwInputService, CwStatus, cwStatusText } from '../../../services/cw-input.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { CwFilePipeline } from './cw-detector-item.model';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — CW Tone Detector.
 *
 * CW audio tone detector: RX/TX, device, channel (left, right or both mixed),
 * name and colour. Tone, speed and levels are found by the detector itself.
 * Switching it on offers to mute a sidetone that would play along, and
 * switching it off offers to turn a muted sidetone back on. Switching it on
 * on a phone or tablet in live Settings offers to keep the screen on (the page
 * stops listening when the screen locks) and leaves a practice mode for Send
 * on Enter, because the scope does not show in practice modes. The detector is
 * only started, stopped or restarted in live Settings; a wizard draft just
 * holds the values.
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
  private readonly clear = inject(ClearService);
  private readonly wakeLock = inject(WakeLockService);

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
    if (checked && this.scope.isLive) {
      const erasing = erasingProsigns(this.s());
      if (erasing.length) {
        const proceed = await this.confirm.ask({
          title: 'Prosigns can erase decoded text',
          message: `Your prosign actions are set so that ${joinPhrases(erasing)}. The detector decodes what it hears, so if those `
            + 'prosigns are received (or misheard in noise), decoded text will be erased from the screen and from the text Save keeps. '
            + 'You can change this in Settings → Other → Prosign Actions.',
          confirmLabel: 'Turn detector on',
          cancelLabel: 'Not now',
          danger: true,
        });
        if (!proceed) return;
      }
    }
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
    if (checked && this.scope.isLive && this.shouldOfferKeepScreenOn()) {
      const keepOn = await this.confirm.ask({
        title: 'Keep the screen on?',
        message: 'The CW detector listens through the microphone. When the screen dims or locks, a phone or tablet '
          + 'usually pauses the page and stops listening, so decoding would stop. Keep the screen on while the app is open? '
          + 'You can change this in Settings → Other → Screen Settings.',
        confirmLabel: 'Keep screen on',
        cancelLabel: 'Not now',
      });
      if (keepOn) {
        this.scope.update({ wakeLockEnabled: true });
        void this.wakeLock.onSettingChanged(true);
      }
    }
    // The scope takes the typing box's place only outside the practice modes, so leave them (live Settings only; the wizard asks)
    const mode = this.s().encoderMode;
    if (checked && this.scope.isLive && (mode === 'practice' || mode === 'send-practice')) {
      this.clear.clearInput();
      this.scope.update({ cwInputEnabled: checked, encoderMode: 'enter' });
    } else {
      this.scope.update({ cwInputEnabled: checked });
    }
    if (!this.scope.isLive || !this.audioRunning) return;
    if (checked) await this.cwInput.start();
    else await this.cwInput.stop();
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

  /** A phone or tablet (touch main pointer, no hover) that can hold a screen wake lock and does not yet */
  private shouldOfferKeepScreenOn(): boolean {
    return this.wakeLock.supported
      && !this.s().wakeLockEnabled
      && isMobileDevice();
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
