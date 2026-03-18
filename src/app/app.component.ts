import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, HostListener, effect } from '@angular/core';
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
import { SerialKeyInputService } from './services/serial-key-input.service';
import { MouseKeyerService } from './services/mouse-keyer.service';
import { MidiInputService } from './services/midi-input.service';
import { MidiOutputService } from './services/midi-output.service';
import { WinkeyerOutputService } from './services/winkeyer-output.service';
import { FirebaseRtdbService } from './services/firebase-rtdb.service';
import { DisplayBufferService } from './services/display-buffer.service';
import { LoopDetectionService } from './services/loop-detection.service';
import { WakeLockService } from './services/wake-lock.service';
import { PracticeService } from './services/practice.service';
import { HelpComponent } from './components/help/help.component';
import { SettingsModalComponent } from './components/settings-modal/settings-modal.component';
import { FullscreenModalComponent } from './components/fullscreen-modal/fullscreen-modal.component';
import { SymbolsRefComponent } from './components/symbols-ref/symbols-ref.component';

/**
 * Morse Code Studio
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
  imports: [FormsModule, HelpComponent, SettingsModalComponent, FullscreenModalComponent, SymbolsRefComponent],
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
  /** Whether the Symbols Reference modal is visible */
  showSymbolsRef = false;

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

  /** Whether the encoder textarea has text (for TX button state) */
  encoderInputHasText = false;

  // ---- Kebab menu state ----
  controlsKebabOpen = false;

  // ---- Clear context menu state ----
  clearMenuOpen = false;

  // ---- Fullscreen context menu state ----
  fullscreenMenuOpen = false;

  @ViewChild('decoderBox') decoderBoxRef?: ElementRef<HTMLDivElement>;
  @ViewChild('encoderInput') encoderInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('panelSection') panelSectionRef?: ElementRef<HTMLElement>;

  /** Whether there is at least 300px of space below the panel for the sprite button */
  spriteSpaceAvailable = false;

  /** Delays sprite reveal until viewport has settled after page load */
  spriteReady = false;

  private subs: Subscription[] = [];

  /** Bound handler for visualViewport resize — stored for cleanup */
  private vvResizeHandler: (() => void) | null = null;

  /** Tracks how many modal history entries are currently pushed */
  private modalHistoryDepth = 0;

  /** Last known length of taggedOutput — used to detect new decoded chars */
  private lastTaggedLen = 0;

  /** Last known encoder sentIndex — used to detect newly sent chars */
  private lastSentIdx = 0;
  /** Last known encoder buffer — detects when buffer is replaced */
  private lastSentBuf = '';
  /** Last known encoder wordGapCount — detects word-gap timer firings */
  private lastWordGapCount = 0;

  /**
   * MIDI reconnect banner flags — set when the page loaded with MIDI
   * services enabled but they had to be disabled because Chrome's MIDI
   * subsystem cannot auto-reconnect reliably. Cleared when the user
   * dismisses the banner or re-enables the service via settings.
   */
  midiInputNeedsReconnect = false;
  midiOutputNeedsReconnect = false;

  /** Whether the main screen blurred text is being revealed (button held) */
  mainRevealing = false;

  constructor(
    private hostRef: ElementRef,
    public settings: SettingsService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
    public cwInput: CwInputService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    public keyer: KeyerService,
    public devices: AudioDeviceService,
    public serialOutput: SerialKeyOutputService,
    public serialInput: SerialKeyInputService,
    public mouseKeyer: MouseKeyerService,
    public midiInput: MidiInputService,
    public midiOutput: MidiOutputService,
    public winkeyerOutput: WinkeyerOutputService,
    public rtdbService: FirebaseRtdbService,
    public displayBuffers: DisplayBufferService,
    public loopDetection: LoopDetectionService,
    public wakeLock: WakeLockService,
    public practice: PracticeService,
  ) {
    // Auto-scroll the main decoder box when new text arrives
    effect(() => {
      this.displayBuffers.mainOutput.lines();
      const el = this.decoderBoxRef?.nativeElement;
      if (el) {
        requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
      }
    });

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
          const displayName = this.getDisplayName(entry.type, entry.name);
          this.displayBuffers.pushDecoded(entry.type, entry.char, displayName, entry.color);

          // Compute whether this entry is from a relay-allowed input path.
          // Used both for loop detection exclusion and for output forwarding.
          const s = this.settings.settings();
          let isRelayEntry = false;
          let midiRelayIndex: number | undefined;
          if (entry.fromMidi && entry.inputPath) {
            const m = entry.inputPath.match(/^midi(?:StraightKey|Paddle):(\d+)/);
            if (m) {
              midiRelayIndex = parseInt(m[1], 10);
              isRelayEntry = s.midiOutputMappings.some(
                om => om.enabled && om.relayInputIndices.includes(midiRelayIndex!),
              );
            }
          } else if (entry.fromSerial && entry.inputPath) {
            const m = entry.inputPath.match(/^serial(?:StraightKey|Paddle):(\d+)/);
            if (m) {
              const serialRelayIndex = parseInt(m[1], 10);
              isRelayEntry = s.serialOutputMappings.some(
                om => om.enabled && om.relayInputIndices.includes(serialRelayIndex),
              );
            }
          }

          // Record input for loop detection (skip RTDB chars and relay-allowed
          // entries — relay traffic is intentional, not a hardware loop)
          if (!entry.fromRtdb && !isRelayEntry) {
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

          // Forward to MIDI output — skip chars that originated from MIDI input
          // or serial input (prevents echo loops), unless the specific input
          // mapping is configured as a relay source in at least one output
          // mapping's relayInputIndices.
          // Local keyer pipelines (keyboard, mouse, touch) already fire
          // straight-key notes in real-time via keyDown/keyUp, so pass
          // paddleOnly=true for those (and for MIDI relay entries whose
          // straight-key notes are already fired via the decoder) to avoid
          // double-firing straight-key mappings while still driving
          // paddle-mode mappings through the character path.
          {
            const midiAllowed = !entry.fromMidi || isRelayEntry;
            const serialAllowed = !entry.fromSerial;
            if (midiAllowed && serialAllowed) {
              const isLocalKeyer = entry.inputPath &&
                (entry.inputPath === 'keyboardStraightKey' || entry.inputPath.startsWith('keyboardPaddle') ||
                 entry.inputPath === 'mouseStraightKey' || entry.inputPath === 'mousePaddle' ||
                 entry.inputPath === 'touchStraightKey' || entry.inputPath === 'touchPaddle');
              // MIDI relay entries already have real-time keyDown/keyUp for straight-key notes
              const paddleOnly = !!isLocalKeyer || !!entry.fromMidi;
              this.midiOutput.forwardDecodedChar(entry.char, entry.type, entry.wpm, paddleOnly, isRelayEntry);
            }
          }

          // Forward to RTDB output only for non-RTDB chars (prevent echo),
          // unless the user has enabled relay AND input/output use different
          // channel+secret combinations.
          // When rtdbRelaySuppressOtherInputs is on, only RTDB relay chars
          // are forwarded — all other input sources are suppressed.
          {
            const inCh = s.rtdbInputChannelName.trim();
            const inSec = s.rtdbInputChannelSecret.trim();
            const outCh = s.rtdbOutputChannelName.trim();
            const outSec = s.rtdbOutputChannelSecret.trim();
            const sameChannel = !!(inCh && outCh && inCh === outCh && inSec === outSec);
            const rtdbRelayAllowed = s.rtdbAllowInputRelay && !sameChannel;
            const rtdbSuppressOther = s.rtdbRelaySuppressOtherInputs && rtdbRelayAllowed;
            if (rtdbSuppressOther) {
              // Only forward chars that come from RTDB relay
              if (entry.fromRtdb) {
                this.rtdbService.forwardDecodedChar(entry.char, entry.type, entry.wpm, entry.name, entry.color, true);
              }
            } else if (!entry.fromRtdb || rtdbRelayAllowed) {
              this.rtdbService.forwardDecodedChar(entry.char, entry.type, entry.wpm, entry.name, entry.color, !!entry.fromRtdb);
            }
          }
        }
      }
      this.lastTaggedLen = tagged.length;
    });

    // Watch for encoder sentIndex advancing — push newly sent chars to display buffers
    effect(() => {
      const buf = this.encoder.buffer();
      const idx = this.encoder.sentIndex();
      const isPractice = this.settings.settings().encoderMode === 'practice';
      if (buf !== this.lastSentBuf) {
        // Buffer was replaced or cleared.
        // When processSend finishes, sentIndex.set(endIdx), buffer.set(''),
        // and sentIndex.set(0) all happen synchronously — Angular coalesces
        // the signal updates and the effect only sees the final state
        // (buf='', idx=0). Flush any remaining unpushed characters from
        // the old buffer so they reach the display (and prosign actions fire).
        if (buf === '' && this.lastSentBuf && this.lastSentIdx < this.lastSentBuf.length) {
          if (isPractice) {
            // Only flush remaining chars if practice is still playing
            // (not if we aborted — state would be 'idle')
            if (this.practice.state() !== 'idle') {
              let i = this.lastSentIdx;
              while (i < this.lastSentBuf.length) {
                const { token, endIdx } = this.encoder.extractToken(this.lastSentBuf, i);
                this.practice.pushPracticeChar(token);
                i = endIdx;
              }
            }
          } else {
            const es = this.settings.settings();
            const encSource = es.encoderSource;
            const displayName = this.getDisplayName(encSource, es.encoderName || undefined);
            const displayColor = es.encoderColor || undefined;
            let i = this.lastSentIdx;
            while (i < this.lastSentBuf.length) {
              const { token, endIdx } = this.encoder.extractToken(this.lastSentBuf, i);
              this.displayBuffers.pushSent(encSource, token, displayName, displayColor);
              i = endIdx;
            }
          }
        }
        this.lastSentBuf = buf;
        this.lastSentIdx = idx;
        // Sync the main-screen textarea when the encoder clears its buffer
        // (e.g. after live-mode send completes) so stale text can't be re-fed
        // (skip in practice mode — textarea is user input)
        if (buf === '' && this.encoderInputRef && !isPractice) {
          this.encoderInputRef.nativeElement.value = '';
          this.encoderInputHasText = false;
        }
      } else if (idx < this.lastSentIdx) {
        // sentIndex went backwards while buffer stayed the same — the same
        // text was re-submitted (e.g. user typed "TEST", Enter, then "TEST",
        // Enter again). Reset tracking so subsequent advances are picked up.
        this.lastSentIdx = idx;
      } else if (idx > this.lastSentIdx) {
        // Walk through newly sent characters using token extraction so
        // prosign patterns (e.g. '<SK>') are pushed as whole strings.
        let i = this.lastSentIdx;
        while (i < idx) {
          const { token, endIdx } = this.encoder.extractToken(buf, i);
          if (isPractice) {
            this.practice.pushPracticeChar(token);
          } else {
            const es = this.settings.settings();
            const encSource = es.encoderSource;
            const displayName = this.getDisplayName(encSource, es.encoderName || undefined);
            const displayColor = es.encoderColor || undefined;
            this.displayBuffers.pushSent(encSource, token, displayName, displayColor);
          }
          i = endIdx;
        }
        this.lastSentIdx = idx;
      }
    });

    // Watch for encoder word-gap timer — insert a space into display buffers
    // when enough silence passes after the last sent character (mirrors the
    // decoder's word-boundary space insertion).
    effect(() => {
      const count = this.encoder.wordGapCount();
      if (count > this.lastWordGapCount) {
        const isPractice = this.settings.settings().encoderMode === 'practice';
        if (isPractice) {
          this.practice.pushPracticeChar(' ');
        } else {
          const es = this.settings.settings();
          const encSource = es.encoderSource;
          const displayName = this.getDisplayName(encSource, es.encoderName || undefined);
          const displayColor = es.encoderColor || undefined;
          this.displayBuffers.pushSent(encSource, ' ', displayName, displayColor);
        }
      }
      this.lastWordGapCount = count;
    });

    // Watch for practice mode: detect when encoder finishes sending
    effect(() => {
      const sending = this.encoder.isSending();
      const practiceState = this.practice.state();
      if (!sending && practiceState === 'playing') {
        this.practice.onEncoderFinished();
      }
    });

    // Sync practice userInput signal to main-screen textarea
    // (handles clear from fullscreen toolbar or abort resetting the input)
    effect(() => {
      const input = this.practice.userInput();
      if (input === '' && this.encoderInputRef
          && this.settings.settings().encoderMode === 'practice') {
        this.encoderInputRef.nativeElement.value = '';
        this.encoderInputHasText = false;
      }
    });

    // Recheck sprite space when settings that affect panel height change
    // (level-meter visibility, banner appearance, sprite button toggle).
    effect(() => {
      this.settings.settings().micInputEnabled;
      this.settings.settings().cwInputEnabled;
      this.settings.settings().spriteButtonEnabled;
      this.loopDetection.loopDetected();
      this.rtdbService.connectionWarning();
      // Wait one frame for the DOM to settle after @if blocks toggle
      requestAnimationFrame(() => this.checkSpriteSpace());
    });
  }

  ngOnInit(): void {
    this.refreshDeviceConfig();

    // Wire mic key events into decoder — use configured source (RX or TX)
    this.subs.push(
      this.audioInput.keyEvent$.subscribe(evt => {
        this.micKeyDown = evt.down;
        const s = this.settings.settings();
        const source = s.micInputSource;
        const opts = { name: s.micInputName || undefined, color: s.micInputColor || undefined };
        if (evt.down) {
          this.decoder.onKeyDown('mic', source, opts);
        } else {
          this.decoder.onKeyUp('mic', source, opts);
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
        const s = this.settings.settings();
        const source = s.cwInputSource;
        const opts = { name: s.cwInputName || undefined, color: s.cwInputColor || undefined };
        if (evt.down) {
          this.decoder.onKeyDown('cwAudio', source, opts);
        } else {
          this.decoder.onKeyUp('cwAudio', source, opts);
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
      this.rtdbService.incomingChar$.subscribe(({ char, source, name, wpm, color }) => {
        // Add to decoder tagged output so it appears in conversation / fullscreen
        // Mark fromRtdb so the forwarding effect doesn't echo it back to RTDB
        // Apply input name/color overrides (non-empty = override, empty = preserve incoming)
        const s = this.settings.settings();
        const effectiveName = s.rtdbInputName.trim() || name;
        const effectiveColor = s.rtdbInputColor.trim() || color;
        this.decoder.taggedOutput.update(arr => [...arr, { type: source, char, name: effectiveName, color: effectiveColor, fromRtdb: true, wpm }]);
        this.decoder.decodedText.update(t => t + char);
        // Play through all outputs whose forward mode matches the source
        // Use remote WPM unless the user has chosen to override with local encoder WPM
        const playbackWpm = this.settings.settings().rtdbInputOverrideWpm
          ? this.settings.settings().encoderWpm
          : wpm;
        this.encoder.enqueueRxPlayback(char, source, playbackWpm);
      })
    );

    // Sprite button animation — react to straight key events from other keyers
    this.subs.push(
      this.keyer.straightKeyEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (!s.spriteButtonEnabled) return;
        const animate =
          (evt.inputPath === 'keyboardStraightKey' && s.spriteAnimateKeyboard) ||
          (evt.inputPath === 'mouseStraightKey' && s.spriteAnimateMouse) ||
          (evt.inputPath === 'midiStraightKey' && s.spriteAnimateMidi) ||
          (evt.inputPath?.startsWith('serialStraightKey') && s.spriteAnimateSerial);
        if (animate) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // Sprite button animation — react to encoder element events
    this.subs.push(
      this.encoder.elementEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteAnimateEncoder) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // Sprite button animation — react to mic straight key events
    this.subs.push(
      this.audioInput.keyEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteAnimateMic) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // Sprite button animation — react to serial straight key events
    this.subs.push(
      this.serialInput.straightKeyEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteAnimateSerial) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // MIDI cannot reliably auto-reconnect after a browser refresh because
    // Chrome's MIDI subsystem may return stale/empty data from
    // requestMIDIAccess(). We detect this after the device profile is
    // loaded (in refreshDeviceConfig) and show a banner prompting the
    // user to re-enable MIDI manually.

    // Serial Key Output auto-reconnects via its own constructor effect().
    // No explicit autoOpenSerial() call needed here.

    // Auto-open Serial Input if enabled
    if (this.settings.settings().serialInputEnabled && 'serial' in navigator) {
      this.autoOpenSerialInput();
    }

    // Auto-open WinKeyer if enabled
    if (this.settings.settings().winkeyerEnabled && 'serial' in navigator) {
      this.autoOpenWinkeyer();
    }

    // Auto-reconnect audio if it was running before the page reload.
    if (localStorage.getItem('morseAudioRunning') === '1') {
      this.autoStartAudio();
    }

    // Acquire screen wake lock if enabled (keeps mobile screen active)
    this.wakeLock.acquire();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.mouseKeyer.detachAll();
    if (this.vvResizeHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.vvResizeHandler);
    }
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
    } else if (this.showSymbolsRef) {
      this.showSymbolsRef = false;
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

    // On mobile browsers the visual viewport can change after the initial
    // layout (e.g. URL bar animating away after a pull-to-refresh).  The
    // standard window resize event does NOT fire for these changes, so we
    // also listen to the VisualViewport resize event.
    if (window.visualViewport) {
      this.vvResizeHandler = () => {
        this.correctHostHeight();
        this.checkSpriteSpace();
      };
      window.visualViewport.addEventListener('resize', this.vvResizeHandler);
    }

    // Delay the sprite reveal by 500ms so the mobile viewport has fully
    // settled (URL bar animation, font loading) before we measure.  The
    // sprite then fades in via CSS animation — no resize flicker.
    setTimeout(() => {
      this.correctHostHeight();
      this.checkSpriteSpace();
      this.spriteReady = true;
    }, 500);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.correctHostHeight();
    this.checkSpriteSpace();
  }

  /**
   * On mobile browsers 100dvh can be stale after a pull-to-refresh (it may
   * include the URL bar height).  Explicitly set min-height to the real
   * viewport height so the flex layout is computed correctly.
   */
  private correctHostHeight(): void {
    const host = this.hostRef.nativeElement as HTMLElement;
    host.style.minHeight = window.innerHeight + 'px';
  }

  /** Check if at least 150px is available below the panel for the sprite button */
  private checkSpriteSpace(): void {
    if (!this.panelSectionRef) {
      this.spriteSpaceAvailable = false;
      return;
    }
    const panelBottom = this.panelSectionRef.nativeElement.getBoundingClientRect().bottom;
    this.spriteSpaceAvailable = (window.innerHeight - panelBottom) >= 150;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.controlsKebabOpen = false;
    this.clearMenuOpen = false;
    this.fullscreenMenuOpen = false;
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

  /**
   * Auto-open WinKeyer after a browser refresh.
   * Chrome remembers previously granted serial ports via getPorts().
   */
  private async autoOpenWinkeyer(): Promise<void> {
    const idx = this.settings.settings().winkeyerPortIndex;
    if (idx < 0) return;

    for (const delay of [0, 500, 1500, 3000]) {
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      if (this.winkeyerOutput.connected()) return;
      await this.winkeyerOutput.refreshPorts();
      if (idx < this.winkeyerOutput.ports().length) {
        await this.winkeyerOutput.open(idx);
        if (this.winkeyerOutput.connected()) return;
      }
    }
  }

  /**
   * Auto-open Serial Input after a browser refresh.
   * The serial input service's effect() handles reactive attachment,
   * but we need to ensure ports are enumerated first.
   */
  private async autoOpenSerialInput(): Promise<void> {
    // Collect unique port indices from all enabled mappings
    const portIndices = new Set<number>();
    for (const m of this.settings.settings().serialInputMappings) {
      if (m.enabled && m.portIndex >= 0) portIndices.add(m.portIndex);
    }
    if (portIndices.size === 0) return;

    for (const delay of [0, 500, 1500, 3000]) {
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      await this.serialInput.refreshPorts();
      let allConnected = true;
      for (const idx of portIndices) {
        if (!this.serialInput.isPortConnected(idx) && idx < this.serialInput.ports().length) {
          await this.serialInput.openPort(idx);
        }
        if (!this.serialInput.isPortConnected(idx)) allConnected = false;
      }
      if (allConnected) return;
    }
  }

  // ---- Encoder handlers ----

  onEncoderKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    // In practice type-along, Enter maps to start/pause/resume/validate
    if (this.settings.settings().encoderMode === 'practice'
        && this.settings.settings().practiceFeedbackMode === 'typealong'
        && event.key === 'Enter') {
      event.preventDefault();
      const state = this.practice.state();
      if (state === 'idle' || state === 'finished') {
        this.practiceStartOrNext(textarea);
      } else if (state === 'playing') {
        this.practice.pause();
      } else if (state === 'paused') {
        this.practice.resume();
      }
      return;
    }
    if (this.settings.settings().encoderMode === 'enter' && event.key === 'Enter') {
      event.preventDefault();
      this.encoder.submitText(textarea.value);
      textarea.value = '';
      this.encoderInputHasText = false;
    }
  }

  onEncoderInput(textarea: HTMLTextAreaElement): void {
    const pos = textarea.selectionStart;
    textarea.value = textarea.value.toUpperCase();
    textarea.selectionStart = textarea.selectionEnd = pos;
    this.encoderInputHasText = textarea.value.trim().length > 0;
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.userInput.set(textarea.value);
    } else if (this.settings.settings().encoderMode === 'live') {
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
  }

  /** Clear only the encoder textarea input (not the buffer or log) */
  clearEncoderTextarea(textarea: HTMLTextAreaElement): void {
    if (this.settings.settings().encoderMode === 'practice') {
      if (this.practice.state() !== 'idle') this.practice.abort();
      this.practice.userInput.set('');
    }
    textarea.value = '';
    this.encoderInputHasText = false;
  }

  /** Clear the main output display buffer and reset operational state */
  clearMainOutput(): void {
    if (this.settings.settings().encoderMode === 'practice') {
      if (this.practice.state() !== 'idle') this.practice.abort();
      if (this.encoderInputRef) {
        this.encoderInputRef.nativeElement.value = '';
        this.encoderInputHasText = false;
      }
    }
    this.displayBuffers.mainOutput.clear();
    this.decoder.clearOutput();
  }

  /** Clear all three display buffers plus encoder operational state */
  clearAllBuffers(): void {
    if (this.settings.settings().encoderMode === 'practice') {
      if (this.practice.state() !== 'idle') this.practice.abort();
      if (this.encoderInputRef) {
        this.encoderInputRef.nativeElement.value = '';
        this.encoderInputHasText = false;
      }
    }
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.encoder.clearBuffer();
  }

  // ---- Practice mode ----

  /** Start practice or advance to next sequence */
  practiceStartOrNext(textarea: HTMLTextAreaElement): void {
    // If finishing type-along, compute feedback first before advancing
    if (this.practice.state() === 'finished'
        && this.settings.settings().practiceFeedbackMode === 'typealong'
        && this.practice.feedback().length === 0) {
      this.practice.computeFeedback(this.practice.userInput());
      return;
    }
    if (this.practice.state() === 'finished') {
      this.practice.next();
    } else {
      this.practice.start();
    }
  }

  /** Pause practice playback */
  practicePause(): void {
    this.practice.pause();
  }

  /** Resume practice playback */
  practiceResume(): void {
    this.practice.resume();
  }

  // ---- Text blur ----

  /**
   * Active blur mode for the main screen.
   * Returns null when blur is disabled, otherwise the appliesTo value.
   */
  get mainBlurMode(): 'rx' | 'tx' | 'both' | null {
    const s = this.settings.settings();
    // Practice mode blur/typealong: blur the practice source direction
    if (s.encoderMode === 'practice' && (s.practiceFeedbackMode === 'blur' || s.practiceFeedbackMode === 'typealong')) {
      // If practice finished and feedback computed, unblur to show highlights
      if (this.practice.state() === 'finished' && this.practice.feedback().length > 0) {
        return null;
      }
      return s.practiceSource;
    }
    return s.textBlurEnabled ? s.textBlurAppliesTo : null;
  }

  /**
   * Returns a newline prefix when the line at this index starts a new
   * type/name segment — replicating the conversation-style line breaks
   * that the flat text() signal normally provides.
   */
  mainLinePrefix(index: number): string {
    if (index === 0) return '';
    const lines = this.displayBuffers.mainOutput.lines();
    const prev = lines[index - 1];
    const curr = lines[index];
    if (curr.type !== prev.type || curr.name !== prev.name) {
      // Match the newline logic: only if the current line text doesn't
      // already start with \n and the previous doesn't end with \n
      if (!curr.text.startsWith('\n') && !prev.text.endsWith('\n')) {
        return '\n';
      }
    }
    return '';
  }

  /** Start revealing blurred text on main screen (momentary hold) */
  onMainRevealStart(event: Event): void {
    event.preventDefault();
    this.mainRevealing = true;
  }

  /** Stop revealing blurred text on main screen */
  onMainRevealEnd(): void {
    this.mainRevealing = false;
  }

  toggleClearMenu(): void {
    this.clearMenuOpen = !this.clearMenuOpen;
    this.fullscreenMenuOpen = false;
  }

  closeClearMenu(): void {
    this.clearMenuOpen = false;
  }

  toggleFullscreenMenu(): void {
    this.fullscreenMenuOpen = !this.fullscreenMenuOpen;
    this.clearMenuOpen = false;
  }

  closeFullscreenMenu(): void {
    this.fullscreenMenuOpen = false;
  }

  /**
   * Determine the name prefix for a display buffer entry.
   *
   * - If the entry already has a name (remote sender or MIDI mapping), use it.
   * - If RTDB output is enabled and the type matches forward mode,
   *   use our own callsign so the local display mirrors the remote view.
   */
  private getDisplayName(type: 'rx' | 'tx', entryName?: string): string | undefined {
    if (entryName) return entryName;
    const s = this.settings.settings();
    if (s.rtdbOutputEnabled && s.rtdbOutputName.trim()) {
      const fwd = s.rtdbOutputForward;
      if (fwd === 'both' || fwd === type) {
        return s.rtdbOutputName.trim();
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

  /** Close settings modal — also clear reconnect banner if user re-enabled MIDI */
  closeSettings(): void {
    this.showSettings = false;
    this.popModalState();
    // Clear reconnect flags if the user has re-enabled the services
    if (this.settings.settings().midiInputEnabled) this.midiInputNeedsReconnect = false;
    if (this.settings.settings().midiOutputEnabled) this.midiOutputNeedsReconnect = false;
  }

  /** Dismiss the MIDI reconnect banner and open settings */
  dismissMidiReconnectBanner(): void {
    this.midiInputNeedsReconnect = false;
    this.midiOutputNeedsReconnect = false;
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

  /** Open symbols reference modal */
  openSymbolsRef(): void {
    this.showSymbolsRef = true;
    this.pushModalState('symbolsRef');
  }

  /** Close symbols reference modal */
  closeSymbolsRef(): void {
    this.showSymbolsRef = false;
    this.popModalState();
  }

  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    // When switching away from practice mode, reset practice state
    if (key === 'encoderMode' && this.settings.settings().encoderMode === 'practice' && value !== 'practice') {
      this.practice.reset();
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
      // After loading the device profile, check if MIDI was enabled.
      // The flat-format check in ngOnInit may have seen defaults (false)
      // because the real profile hadn't been loaded yet.
      this.checkMidiReconnect();
      if (!found) {
        this.openSettings(); // auto-open settings for validation
      }
    }
  }

  /**
   * Check if MIDI services were enabled before the page refresh and
   * need to be manually re-enabled. Disables them and sets the banner
   * flags so the user is informed.
   *
   * Called after loadForFingerprint() loads the device profile — this is
   * the only time we have the real saved settings (settings start at
   * defaults until the profile is loaded asynchronously).
   */
  private checkMidiReconnect(): void {
    if (this.settings.settings().midiInputEnabled) {
      this.midiInputNeedsReconnect = true;
      this.settings.update({ midiInputEnabled: false });
    }
    if (this.settings.settings().midiOutputEnabled) {
      this.midiOutputNeedsReconnect = true;
      this.settings.update({ midiOutputEnabled: false });
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

  // ---- Straight-key sprite button ----

  /** Visual pressed state for the straight-key sprite */
  spriteKeyDown = false;
  /** Guard to prevent duplicate mouse events when touch already active */
  private spriteMouseActive = false;

  /** Handle touch events on the sprite key button */
  onSpriteTouch(down: boolean, event: TouchEvent): void {
    event.preventDefault();
    this.spriteKeyDown = down;
    const s = this.settings.settings();
    this.keyer.straightKeyInput(down, s.spriteSource, false, 'touchStraightKey',
      { name: s.spriteName || undefined, color: s.spriteColor || undefined });
  }

  /** Handle mouse events on the sprite key button (desktop fallback) */
  onSpriteMouse(down: boolean, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (down) {
      if (this.spriteMouseActive) return;
      this.spriteMouseActive = true;
    } else {
      if (!this.spriteMouseActive) return;
      this.spriteMouseActive = false;
    }
    this.spriteKeyDown = down;
    const s = this.settings.settings();
    this.keyer.straightKeyInput(down, s.spriteSource, false, 'touchStraightKey',
      { name: s.spriteName || undefined, color: s.spriteColor || undefined });
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
