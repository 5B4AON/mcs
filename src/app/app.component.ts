import { Component, OnInit, OnDestroy, computed, ViewChild, ElementRef, AfterViewInit, HostListener, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings } from './services/settings.service';
import { AudioInputService } from './services/audio-input.service';
import { AudioOutputService } from './services/audio-output.service';
import { CwInputService } from './services/cw-input.service';
import { MorseDecoderService } from './services/morse-decoder.service';
import { MorseEncoderService } from './services/morse-encoder.service';
import { KeyerService } from './services/keyer.service';
import { AudioDeviceService } from './services/audio-device.service';
import { SerialKeyOutputService } from './services/serial-key-output.service';
import { MouseKeyerService } from './services/mouse-keyer.service';
import { MidiInputService } from './services/midi-input.service';
import { WinkeyerOutputService } from './services/winkeyer-output.service';
import { FirebaseRtdbService } from './services/firebase-rtdb.service';
import { DisplayBufferService } from './services/display-buffer.service';
import { LoopDetectionService } from './services/loop-detection.service';
import { HelpComponent } from './help.component';
import { SettingsModalComponent } from './settings-modal.component';
import { FullscreenModalComponent } from './fullscreen-modal.component';

/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

/**
 * Main Application Component � Morse Code Studio.
 *
 * This component orchestrates all the services and provides the UI:
 *  - Controls bar: Start/Stop audio, level meters, WPM adjustments
 *  - Morse Decoder panel: shows received/transmitted morse as text
 *  - Morse Encoder panel: type text to send as morse code
 *  - Settings panel: configure all audio devices, keyer, and outputs
 *  - Fullscreen modal: large-text conversation view for RX/TX
 *
 * Service wiring:
 *  - AudioInputService key events → MorseDecoderService (source per micInputSource setting)
 *  - CwInputService key events → MorseDecoderService (source per cwInputSource setting)
 *  - KeyerService key events → MorseDecoderService (source per input's *KeyerSource setting)
 *    - Paddle mode: perfectTiming = true (no calibration, uses keyer WPM threshold)
 *    - Straight key: perfectTiming = false (auto-calibrates the assigned pool)
 *  - MorseEncoderService ? AudioOutputService + SerialKeyOutputService
 *  - All settings changes ? SettingsService ? auto-persisted profiles
 */
@Component({
  selector: 'app-root',
  imports: [FormsModule, HelpComponent, SettingsModalComponent, FullscreenModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  // ---- Application state ----
  /** Whether audio contexts are running (Start/Stop toggle) */
  audioRunning = false;
  /** True while start/stop is in progress (shows spinner) */
  audioStarting = false;
  /** Current mic input level for the level meter bar */
  micLevel = 0;
  /** True when the mic-based key detector reports key-down */
  micKeyDown = false;
  /** Whether the settings modal is open */
  showSettings = false;
  /** Whether the Help modal is visible */
  showHelp = false;

  // ---- CW audio input state ----
  /** Current CW Goertzel magnitude for the CW level meter */
  cwLevel = 0;
  /** Active detection threshold (auto or manual) */
  cwThreshold = 0;
  /** True when the CW tone detector reports key-down */
  cwKeyDown = false;
  /** Auto-scaling maximum for the CW level meter display */
  cwLevelMax = 0.01;

  /** Auto-scaling maximum for the mic level meter display */
  levelMeterMax = 0.01;

  // ---- Fullscreen modal state ----
  /** Which modal is open: 'decoder' (conversation), 'encoder' (QSO), or null */
  activeModal: 'decoder' | 'encoder' | null = null;

  readonly encoderChars = computed(() => this.encoder.buffer().split(''));

  /** Whether the encoder textarea has text (for TX button state) */
  encoderInputHasText = false;

  // ---- Kebab menu state ----
  controlsKebabOpen = false;

  // ---- Clear context menu state ----
  clearMenuOpen: 'decoder' | 'encoder' | null = null;

  @ViewChild('decoderBox') decoderBoxRef?: ElementRef<HTMLDivElement>;

  private subs: Subscription[] = [];

  /** Tracks how many modal history entries are currently pushed */
  private modalHistoryDepth = 0;

  /** Last known length of taggedOutput — used to detect new decoded chars */
  private lastTaggedLen = 0;

  /** Last known encoder sentIndex — used to detect newly sent chars */
  private lastSentIdx = 0;
  /** Last known encoder buffer — detects when buffer is replaced */
  private lastSentBuf = '';

  constructor(
    public settings: SettingsService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
    public cwInput: CwInputService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    public keyer: KeyerService,
    public devices: AudioDeviceService,
    public serialOutput: SerialKeyOutputService,
    public mouseKeyer: MouseKeyerService,
    public midiInput: MidiInputService,
    public winkeyerOutput: WinkeyerOutputService,
    public rtdbService: FirebaseRtdbService,
    public displayBuffers: DisplayBufferService,
    public loopDetection: LoopDetectionService,
  ) {
    // Watch for new decoded characters and forward to WinKeyer and Firebase RTDB
    // Also push every entry (including RTDB-sourced) into the display buffers.
    // Loop detection: record output chars and check for feedback loops.
    effect(() => {
      const tagged = this.decoder.taggedOutput();
      if (tagged.length > this.lastTaggedLen) {
        // Forward only the newly added characters
        for (let i = this.lastTaggedLen; i < tagged.length; i++) {
          const entry = tagged[i];
          // Push to independent display buffers for all entries
          const userName = this.getDisplayUserName(entry.type, entry.userName);
          this.displayBuffers.pushDecoded(entry.type, entry.char, userName);

          // Record input for loop detection (non-RTDB chars are from local inputs)
          if (!entry.fromRtdb) {
            this.loopDetection.recordInput(entry.char);
          }

          // Skip if loop is suppressed
          if (this.loopDetection.isSuppressed) continue;

          // Record as output for loop detection
          if (!entry.fromRtdb) {
            this.loopDetection.recordOutput(entry.char);
          }

          // Forward to WinKeyer (all entries including RTDB-sourced)
          this.winkeyerOutput.forwardDecodedChar(entry.char, entry.type);

          // Forward to RTDB output only for non-RTDB chars (prevent echo)
          if (!entry.fromRtdb) {
            this.rtdbService.forwardDecodedChar(entry.char, entry.type, entry.wpm);
          }
        }
      }
      this.lastTaggedLen = tagged.length;
    });

    // Watch for encoder sentIndex advancing — push newly sent chars to display buffers
    effect(() => {
      const buf = this.encoder.buffer();
      const idx = this.encoder.sentIndex();
      if (buf !== this.lastSentBuf) {
        // Buffer replaced (new text submitted or cleared) — reset tracking
        this.lastSentBuf = buf;
        this.lastSentIdx = idx;
      } else if (idx > this.lastSentIdx) {
        const userName = this.getDisplayUserName('tx');
        for (let i = this.lastSentIdx; i < idx; i++) {
          this.displayBuffers.pushSent(buf[i], userName);
        }
        this.lastSentIdx = idx;
      }
    });
  }

  ngOnInit(): void {
    this.refreshDeviceConfig();

    // Wire mic key events into decoder — use configured source (RX or TX)
    this.subs.push(
      this.audioInput.keyEvent$.subscribe(evt => {
        this.micKeyDown = evt.down;
        this.decoder.keySource = this.settings.settings().micInputSource;
        this.decoder.perfectTiming = false;
        if (evt.down) {
          this.decoder.onKeyDown();
        } else {
          this.decoder.onKeyUp();
        }
      })
    );

    // Mic level meter � auto-scale the max
    this.subs.push(
      this.audioInput.level$.subscribe(level => {
        this.micLevel = level;
        if (level > this.levelMeterMax) {
          this.levelMeterMax = level * 1.5;
        }
      })
    );

    // CW audio input key events → decoder — use configured source (RX or TX)
    this.subs.push(
      this.cwInput.keyEvent$.subscribe(evt => {
        this.cwKeyDown = evt.down;
        this.decoder.keySource = this.settings.settings().cwInputSource;
        this.decoder.perfectTiming = false;
        if (evt.down) {
          this.decoder.onKeyDown();
        } else {
          this.decoder.onKeyUp();
        }
      })
    );

    // CW level meter
    this.subs.push(
      this.cwInput.level$.subscribe(lvl => {
        this.cwLevel = lvl.magnitude;
        this.cwThreshold = lvl.threshold;
        if (lvl.magnitude > this.cwLevelMax) {
          this.cwLevelMax = lvl.magnitude * 1.5;
        }
      })
    );

    // Firebase RTDB incoming characters → decoder display + sidetone only
    this.subs.push(
      this.rtdbService.incomingChar$.subscribe(({ char, source, userName, wpm }) => {
        // Add to decoder tagged output so it appears in conversation / fullscreen
        // Mark fromRtdb so the forwarding effect doesn't echo it back to RTDB
        this.decoder.taggedOutput.update(arr => [...arr, { type: source, char, userName, fromRtdb: true, wpm }]);
        this.decoder.decodedText.update(t => t + char);
        // Play through all outputs whose forward mode matches the source
        // Use remote WPM unless the user has chosen to override with local encoder WPM
        const playbackWpm = this.settings.settings().rtdbInputOverrideWpm
          ? this.settings.settings().encoderWpm
          : wpm;
        this.encoder.enqueueRxPlayback(char, source, playbackWpm);
      })
    );

    // Start MIDI independently of audio — it must survive audio failures.
    // On page refresh Chrome remembers the MIDI permission grant, so no
    // user gesture is needed. start() is idempotent (no-op if already started).
    if (this.settings.settings().midiInputEnabled && this.midiInput.supported) {
      this.midiInput.start();
    }

    // Auto-reconnect audio if it was running before the page reload.
    if (localStorage.getItem('morseAudioRunning') === '1') {
      this.autoStartAudio();
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.mouseKeyer.detachAll();
  }

  // ---- Browser back-button modal handling ----

  /** Guard to ignore the popstate event triggered by our own history.back() */
  private ignoringPopState = false;

  /** Push a history entry so the back button can close the modal */
  private pushModalState(modal: string): void {
    history.pushState({ modal }, '');
    this.modalHistoryDepth++;
  }

  /** Pop the history entry when closing a modal via UI (not back button) */
  private popModalState(): void {
    if (this.modalHistoryDepth > 0) {
      this.modalHistoryDepth--;
      this.ignoringPopState = true;
      history.back();
    }
  }

  /** Close the topmost modal — called by popstate (back button) */
  private closeActiveModal(): void {
    if (this.showHelp) {
      this.showHelp = false;
    } else if (this.showSettings) {
      this.showSettings = false;
    } else if (this.activeModal) {
      this.activeModal = null;
      this.keyer.setEnabled(true);
    }
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(_event: PopStateEvent): void {
    if (this.ignoringPopState) {
      this.ignoringPopState = false;
      return;
    }
    if (this.modalHistoryDepth > 0) {
      this.modalHistoryDepth--;
      this.closeActiveModal();
    }
  }

  ngAfterViewInit(): void {
    if (this.decoderBoxRef) {
      this.mouseKeyer.attach(this.decoderBoxRef.nativeElement);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.controlsKebabOpen = false;
    this.clearMenuOpen = null;
  }

  async toggleAudio(): Promise<void> {
    this.audioStarting = true;
    try {
      if (this.audioRunning) {
        await this.audioInput.stop();
        await this.cwInput.stop();
        await this.audioOutput.stop();
        this.midiInput.stop();
        this.audioRunning = false;
        this.micKeyDown = false;
        this.cwKeyDown = false;
        localStorage.removeItem('morseAudioRunning');
      } else {
        if (this.settings.settings().micInputEnabled) {
          await this.audioInput.start();
        }
        await this.cwInput.start();
        await this.audioOutput.start();
        // Start MIDI independently — fire-and-forget so MIDI issues
        // can never block audio from starting
        if (this.settings.settings().midiInputEnabled && this.midiInput.supported) {
          this.midiInput.start().catch(() => {});
        }
        this.audioRunning = true;
        localStorage.setItem('morseAudioRunning', '1');
        await this.refreshDeviceConfig();
      }
    } finally {
      this.audioStarting = false;
    }
  }

  /**
   * Auto-start audio and MIDI after a browser refresh.
   * Called from ngOnInit when we detect the session was previously running.
   * Chrome remembers granted permissions so this works without a user gesture.
   */
  private async autoStartAudio(): Promise<void> {
    this.audioStarting = true;
    try {
      if (this.settings.settings().micInputEnabled) {
        await this.audioInput.start();
      }
      await this.cwInput.start();
      await this.audioOutput.start();
      // Start MIDI independently — fire-and-forget so MIDI issues
      // can never block audio from starting
      if (this.settings.settings().midiInputEnabled && this.midiInput.supported) {
        this.midiInput.start().catch(() => {});
      }
      this.audioRunning = true;
      await this.refreshDeviceConfig();
    } catch {
      // Permission may have been revoked — clear the flag so we don't retry
      localStorage.removeItem('morseAudioRunning');
      this.audioRunning = false;
    } finally {
      this.audioStarting = false;
    }
  }

  // ---- Encoder handlers ----

  onEncoderKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (this.settings.settings().encoderMode === 'enter' && event.key === 'Enter') {
      event.preventDefault();
      this.encoder.submitText(textarea.value);
      textarea.value = '';
      this.encoderInputHasText = false;
    }
  }

  onEncoderInput(textarea: HTMLTextAreaElement): void {
    this.encoderInputHasText = textarea.value.trim().length > 0;
    if (this.settings.settings().encoderMode === 'live') {
      this.encoder.setBuffer(textarea.value);
    }
  }

  toggleEncoderTx(textarea: HTMLTextAreaElement): void {
    if (this.encoder.isSending()) {
      this.encoder.stopTx();
    } else {
      // In 'enter' mode, submit textarea text if there are characters to send
      if (this.settings.settings().encoderMode === 'enter' && textarea.value.trim()) {
        this.encoder.submitText(textarea.value);
        textarea.value = '';
        this.encoderInputHasText = false;
      } else if (this.encoder.buffer().length > this.encoder.sentIndex()) {
        // Resume sending remaining characters in buffer
        this.encoder.startTx();
      }
    }
  }

  clearEncoder(textarea: HTMLTextAreaElement): void {
    textarea.value = '';
    this.encoder.clearBuffer();
    this.displayBuffers.mainEncoder.clear();
  }

  /** Clear only the encoder textarea input (not the buffer or log) */
  clearEncoderTextarea(textarea: HTMLTextAreaElement): void {
    textarea.value = '';
    this.encoderInputHasText = false;
  }

  /** Clear the main decoder display buffer and reset operational state */
  clearMainDecoder(): void {
    this.displayBuffers.mainDecoder.clear();
    this.decoder.clearOutput();
  }

  /** Clear all four display buffers plus encoder operational state */
  clearAllBuffers(): void {
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.encoder.clearBuffer();
  }

  toggleClearMenu(which: 'decoder' | 'encoder'): void {
    this.clearMenuOpen = this.clearMenuOpen === which ? null : which;
  }

  closeClearMenu(): void {
    this.clearMenuOpen = null;
  }

  /**
   * Determine the userName prefix for a display buffer entry.
   *
   * - If the entry already has an RTDB userName (remote sender), use it.
   * - If RTDB output is enabled and the type matches forward mode,
   *   use our own callsign so the local display mirrors the remote view.
   */
  private getDisplayUserName(type: 'rx' | 'tx', rtdbUserName?: string): string | undefined {
    if (rtdbUserName) return rtdbUserName;
    const s = this.settings.settings();
    if (s.rtdbOutputEnabled && s.rtdbOutputUserName.trim()) {
      const fwd = s.rtdbOutputForward;
      if (fwd === 'both' || fwd === type) {
        return s.rtdbOutputUserName.trim();
      }
    }
    return undefined;
  }

  // ---- Settings handlers ----

  /** Open settings modal */
  openSettings(): void {
    this.showSettings = true;
    this.pushModalState('settings');
  }

  /** Close settings modal */
  closeSettings(): void {
    this.showSettings = false;
    this.popModalState();
  }

  /** Open help modal */
  openHelp(): void {
    this.showHelp = true;
    this.pushModalState('help');
  }

  /** Close help modal */
  closeHelp(): void {
    this.showHelp = false;
    this.popModalState();
  }

  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  // ---- Device config / profiles ----

  async refreshDeviceConfig(): Promise<void> {
    await this.devices.enumerate();
    const fp = this.devices.computeFingerprint();
    if (fp && fp !== this.settings.currentFingerprint()) {
      const found = this.settings.loadForFingerprint(
        fp,
        this.devices.inputDevices(),
        this.devices.outputDevices()
      );
      if (!found) {
        this.openSettings(); // auto-open settings for validation
      }
    }
  }

  saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }

  // ---- WPM adjustments ----

  adjustEncoderWpm(delta: number): void {
    const v = Math.max(5, Math.min(50, this.settings.settings().encoderWpm + delta));
    this.settings.update({ encoderWpm: v });
    this.saveSettings();
  }

  adjustWpm(key: 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm', delta: number): void {
    const v = Math.max(5, Math.min(50, (this.settings.settings() as any)[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    if (key === 'rxDecoderWpm') this.decoder.resetRxCalibration();
    if (key === 'txDecoderWpm') this.decoder.resetTxCalibration();
    this.saveSettings();
  }

  // ---- Fullscreen modal ----

  openModal(mode: 'decoder' | 'encoder'): void {
    this.activeModal = mode;
    this.pushModalState(mode);
    // Disable keyboard keyer in encoder mode so keyer keys
    // don't interfere with typing; keep it active for decoder mode.
    this.keyer.setEnabled(mode !== 'encoder');
  }

  closeModal(): void {
    this.activeModal = null;
    this.keyer.setEnabled(true);
    this.popModalState();
  }
}
