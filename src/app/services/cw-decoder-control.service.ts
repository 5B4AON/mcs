/**
 * Morse Code Studio
 */

import { Injectable, inject } from '@angular/core';
import { ClearService } from './clear.service';
import { ConfirmService } from './confirm.service';
import { CwInputService } from './cw-input.service';
import { cwDecoderOn } from './cw-decoder-state';
import { erasingProsigns, joinPhrases } from './prosign-erase';
import { isMobileDevice } from './settings-common';
import { SettingsService } from './settings.service';
import { WakeLockService } from './wake-lock.service';

/**
 * Starts and stops the CW tone decoder when the user picks it in (or leaves it through) the main screen's Mode list.
 * Setting it up in Settings only makes it available there; it listens only once chosen. Choosing it asks the
 * questions that used to come with the Settings switch (prosigns that erase text, muting a sidetone that would
 * echo into the microphone, keeping the screen on); leaving it offers to turn a muted sidetone back on and to stop keeping the screen on (phones and tablets).
 * The typing mode (Send on Enter or Live) is never changed by it, except that a practice mode is left for Send on Enter.
 */
@Injectable({ providedIn: 'root' })
export class CwDecoderControlService {
  private readonly settings = inject(SettingsService);
  private readonly confirm = inject(ConfirmService);
  private readonly cwInput = inject(CwInputService);
  private readonly clear = inject(ClearService);
  private readonly wakeLock = inject(WakeLockService);

  /**
   * Choose the decoder. Returns false when the user declined a question (nothing changed).
   * `audioRunning`: the decoder starts at once only if the audio contexts run.
   */
  async activate(audioRunning: boolean): Promise<boolean> {
    const s = this.settings.settings();
    if (!s.cwInputEnabled || cwDecoderOn(s)) return false;

    const erasing = erasingProsigns(s);
    if (erasing.length) {
      const proceed = await this.confirm.ask({
        title: 'Prosigns can erase decoded text',
        message: `Your prosign actions are set so that ${joinPhrases(erasing)}. The decoder decodes what it hears, so if those `
          + 'prosigns are received (or misheard in noise), decoded text will be erased from the screen and from the text Save keeps. '
          + 'You can change this in Settings → Other → Prosign Actions.',
        confirmLabel: 'Turn decoder on',
        cancelLabel: 'Not now',
        danger: true,
      });
      if (!proceed) return false;
    }

    const now = this.settings.settings();
    if (now.sidetoneEnabled && (now.sidetoneForward === 'both' || now.sidetoneForward === now.cwInputSource)) {
      const mute = await this.confirm.ask({
        title: 'Mute the sidetone?',
        message: 'The sidetone would play every tone the CW decoder hears. If the microphone can hear the '
          + 'speaker, the decoder hears its own echo and decodes it again. Mute the sidetone? '
          + 'You can turn it back on in Settings → Outputs → Sidetone.',
        confirmLabel: 'Mute sidetone',
        cancelLabel: 'Keep sidetone',
      });
      if (mute) this.settings.updateAndPersist({ sidetoneEnabled: false });
    }

    if (this.wakeLock.supported && !this.settings.settings().wakeLockEnabled && isMobileDevice()) {
      const keepOn = await this.confirm.ask({
        title: 'Keep the screen on?',
        message: 'The CW decoder listens through the microphone. When the screen dims or locks, a phone or tablet '
          + 'usually pauses the page and stops listening, so decoding would stop. Keep the screen on while the app is open? '
          + 'You can change this in Settings → Other → Screen Settings.',
        confirmLabel: 'Keep screen on',
        cancelLabel: 'Not now',
      });
      if (keepOn) {
        this.settings.updateAndPersist({ wakeLockEnabled: true });
        void this.wakeLock.onSettingChanged(true);
      }
    }

    // The decoder never runs in the practice modes: leave one for Send on Enter
    const mode = this.settings.settings().encoderMode;
    if (mode === 'practice' || mode === 'send-practice') {
      this.clear.clearInput();
      this.settings.updateAndPersist({ cwDecoderActive: true, encoderMode: 'enter' });
    } else {
      this.settings.updateAndPersist({ cwDecoderActive: true });
    }
    if (audioRunning) await this.cwInput.start();
    return true;
  }

  /**
   * Stop listening; the decoder stays set up in Settings. Offers to give back what the decoder asked for: to turn a
   * muted sidetone back on (`offerSidetone` is false when entering a practice mode, which asks its own sidetone
   * question) and, on a phone or tablet, to stop keeping the screen on when nothing else needs it.
   */
  async deactivate(audioRunning: boolean, offerSidetone = true): Promise<void> {
    if (!cwDecoderOn(this.settings.settings())) return;
    this.settings.updateAndPersist({ cwDecoderActive: false });
    if (audioRunning) await this.cwInput.stop();
    if (offerSidetone && !this.settings.settings().sidetoneEnabled) {
      const unmute = await this.confirm.ask({
        title: 'Turn the sidetone back on?',
        message: 'The sidetone is off. Turn it back on now that the CW decoder has stopped? '
          + 'You can also change it later in Settings → Outputs → Sidetone.',
        confirmLabel: 'Turn sidetone on',
        cancelLabel: 'Keep it off',
      });
      if (unmute) this.settings.updateAndPersist({ sidetoneEnabled: true });
    }
    await this.offerScreenOff();
  }

  /**
   * After the decoder has stopped for any reason: on a phone or tablet with Keep screen on, ask whether to stop keeping
   * the screen on. Not asked while the decoder listens again or while a relay (RTDB) connection, which the screen
   * lock would also cut, is switched on.
   */
  async offerScreenOff(): Promise<void> {
    const s = this.settings.settings();
    if (!this.wakeLock.supported || !s.wakeLockEnabled || !isMobileDevice()) return;
    if (cwDecoderOn(s) || s.rtdbInputEnabled || s.rtdbOutputEnabled) return;
    const release = await this.confirm.ask({
      title: 'Stop keeping the screen on?',
      message: 'The screen was kept on so the CW decoder could keep listening. The decoder has stopped, so the screen can '
        + 'sleep again and save battery. Turn off Keep screen on? '
        + 'You can also change it later in Settings → Other → Screen Settings.',
      confirmLabel: 'Turn off',
      cancelLabel: 'Keep it on',
    });
    if (release && this.settings.settings().wakeLockEnabled) {
      this.settings.updateAndPersist({ wakeLockEnabled: false });
      void this.wakeLock.onSettingChanged(false);
    }
  }
}
