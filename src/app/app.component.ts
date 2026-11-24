import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, HostBinding, HostListener, NgZone, computed, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, merge } from 'rxjs';
import type { PaddleContactEvent } from './services/paddle-contacts';
import { SettingsService, AppSettings } from './services/settings.service';
import { AudioInputService } from './services/audio-input.service';
import { AudioOutputService } from './services/audio-output.service';
import { AUDIO_RUNNING_KEY } from './services/audio-primer';
import { CwInputService } from './services/cw-input.service';
import { CwDecoderControlService } from './services/cw-decoder-control.service';
import { cwDecoderOn } from './services/cw-decoder-state';
import { MorseDecoderService, TaggedEntry } from './services/morse-decoder.service';
import { MorseEncoderService, PlayingPattern } from './services/morse-encoder.service';
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
import { ReplayUnit, replayChoiceLabel, replayChoices, replayHasOutput, replayWordLabel, sidetonePlaysEncoder } from './services/replay-units';
import { LoopDetectionService } from './services/loop-detection.service';
import { ModalBackService } from './services/modal-back.service';
import { WhatsNewService } from './services/whats-new.service';
import { UpdateService } from './services/update.service';
import { HelpLinkService } from './services/help-link.service';
import { WakeLockService } from './services/wake-lock.service';
import { AutoFullscreenService } from './services/auto-fullscreen.service';
import { ViewportService } from './services/viewport.service';
import { InstallHintService } from './services/install-hint.service';
import { ClearService } from './services/clear.service';
import { PracticeService } from './services/practice.service';
import { SendPracticeService } from './services/send-practice.service';
import { EbookReaderComponent } from './components/ebook-reader/ebook-reader.component';
import { BookDialogComponent } from './components/book-dialog/book-dialog.component';
import { EbookService } from './services/ebook.service';
import { TranscriptSaveService } from './services/transcript-save.service';
import { SendPracticeGateService } from './services/send-practice-gate.service';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { ConfirmService } from './services/confirm.service';
import { PracticeNextLessonComponent } from './components/practice-next-lesson/practice-next-lesson.component';
import { PracticeCompareComponent } from './components/practice-compare/practice-compare.component';
import { MorsePatternComponent } from './components/morse-pattern/morse-pattern.component';
import { KochHelpOverlayComponent } from './components/koch-help-overlay/koch-help-overlay.component';
import { KochHelpService } from './services/koch-help.service';
import { isTouchDevice } from './services/settings-common';
import { FireworksComponent, MAIN_LAUNCH_DELAY_MS } from './components/fireworks/fireworks.component';
import { CollapseDirective } from './components/collapse.directive';
import { SendPromptComponent } from './components/send-prompt/send-prompt.component';
import { CwScopeComponent } from './components/cw-scope/cw-scope.component';
import { AudioFilePlayerComponent } from './components/audio-file-player/audio-file-player.component';
import { AudioFileService } from './services/audio-file.service';
import { MorseSpeedsComponent } from './components/morse-speeds/morse-speeds.component';
import { HelpComponent } from './components/help/help.component';
import { SettingsModalComponent } from './components/settings-modal/settings-modal.component';
import { FullscreenModalComponent } from './components/fullscreen-modal/fullscreen-modal.component';
import { SymbolsRefComponent } from './components/symbols-ref/symbols-ref.component';
import { SetupWizardV2Component } from './components/wizard-v2/setup-wizard-v2.component';
import { WizardGoalId } from './components/settings-modal/goal-navigator/setup-goals';
import { GoalNavigatorModalComponent } from './components/goal-navigator-modal/goal-navigator-modal.component';
import { toProsignDisplay } from './morse-table';
import { erasingProsigns, joinPhrases } from './services/prosign-erase';
import * as practiceUi from './components/settings-items/practice/practice-ui.utils';
import * as sendPracticeUi from './components/settings-items/send-practice/send-practice-ui.utils';

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
  imports: [FormsModule, CollapseDirective, MorsePatternComponent, KochHelpOverlayComponent, SendPromptComponent, EbookReaderComponent, BookDialogComponent, CwScopeComponent, AudioFilePlayerComponent, PracticeNextLessonComponent, PracticeCompareComponent, FireworksComponent, MorseSpeedsComponent, ConfirmDialogComponent, HelpComponent, SettingsModalComponent, FullscreenModalComponent, SymbolsRefComponent, SetupWizardV2Component, GoalNavigatorModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Shared labels for the Practice guidance shown in the main view. */
  private readonly cwControl = inject(CwDecoderControlService);
  readonly practiceUi = practiceUi;
  readonly sendPracticeUi = sendPracticeUi;

  // ---- Application state ----
  /** Whether audio contexts are running (Start/Stop toggle) */
  audioRunning = false;
  /** True while start/stop is in progress (shows spinner) */
  audioStarting = false;
  /** Pulses the audio button and notice for a few seconds after keying while audio is stopped */
  audioAttention = false;
  private audioAttentionTimer: number | null = null;
  audioState: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed' = 'stopped';
  audioStatusMessage = 'Audio is stopped. Press the speaker button above to begin.';
  audioFailureMessage: string | null = null;
  /** Current mic input level for the level meter bar */
  micLevel = 0;
  /** True when the mic-based key detector reports key-down */
  micKeyDown = false;
  /** Whether the settings modal is open */
  showSettings = false;
  /** Landing chosen in the Setup Wizard, opened as soon as Settings appears */
  settingsStartLanding: string | null = null;
  /** Whether the Setup Wizard goal list modal is open */
  showGoals = false;
  /** Whether Presets, opened from the Setup Wizard, are showing */
  showGoalPresets = false;
  /** Guided setup state: the wizard of one goal, opened over the goal list */
  showWizard = false;
  wizardGoal: WizardGoalId = 'type';
  /** Whether the Help modal is visible */
  showHelp = false;
  /** The e-book's Book dialog (page, jump, start over) */
  showBook = false;
  /** Visible control to focus if the Help trigger is hidden when Help closes */
  helpFocusFallback: HTMLElement | null = null;
  /** Help section to scroll to when opened from a contextual link */
  helpInitialSection: string | null = null;
  /** Whether the Symbols Reference modal is visible */
  showSymbolsRef = false;
  /** Visible control to focus if the Symbols Reference trigger is hidden when it closes */
  symbolsRefFocusFallback: HTMLElement | null = null;

  // ---- CW audio input state ----
  /** True when the CW tone detector reports key-down */
  cwKeyDown = false;

  /** Auto-scaling maximum for the mic level meter display */
  levelMeterMax = 0.01;

  // ---- Fullscreen modal state ----
  /** Whether the fullscreen conversation modal is open. */
  activeModal: 'conversation' | null = null;

  /** Whether the encoder textarea has text (for TX button state); shared with the clear menus through `ClearService` */
  get encoderInputHasText(): boolean {
    return this.clear.mainInputHasText();
  }
  set encoderInputHasText(value: boolean) {
    this.clear.mainInputHasText.set(value);
  }

  /**
   * The unsent text of Send on Enter and Live, shown in the input box like the full screen's pending text: the
   * sounding character (yellow) and the rest waiting (grey); what has played is gone. Null when nothing is waiting.
   */
  readonly mainPending = computed<{ sounding: string; rest: string } | null>(() => {
    const mode = this.settings.settings().encoderMode;
    if (mode !== 'enter' && mode !== 'live') return null;
    const buffer = this.encoder.buffer();
    const index = this.encoder.sentIndex();
    if (index >= buffer.length) return null;
    if (!this.encoder.isSending() || this.encoder.replayMode()) {
      const waiting = buffer.slice(index);
      return waiting.trim() ? { sounding: '', rest: waiting } : null;
    }
    const { endIdx } = this.encoder.extractToken(buffer, index);
    return { sounding: buffer.slice(index, endIdx), rest: buffer.slice(endIdx) };
  });

  /** Whether the first-use Morse guide is visible */
  showTryMorseGuide = true;
  /** The Try Morse example was loaded and not sent yet: the send button pulses */
  tryExamplePending = false;

  /** Active confirmation action for example replacement or external TX */
  tryMorseConfirmAction: 'replace' | 'external-send' | 'live-send' | 'replay' | null = null;
  /** Line waiting for the external-send confirmation of a replay */
  private pendingReplayText = '';
  tryMorseConfirmMessage = '';
  tryMorseConfirmTitle = '';
  tryMorseConfirmLabel = '';
  private pendingExternalDestinations: string[] = [];
  /** Destinations the user already confirmed this session; asked again only when the list changes. */
  private confirmedDestinations: string[] = [];
  private defaultsResetInSettings = false;
  private defaultsResetSaved = false;

  // ---- Kebab menu state ----
  private kebabOpen = false;
  private releaseKebabBack: (() => void) | null = null;
  controlsKebabMaxHeight: number | null = null;
  /** Morse Speeds block of the speed menu; the menu always opens with it collapsed */
  speedsOpen = false;

  /** Kebab button to focus when Settings or the goal list closes, because the menu item that opened it is hidden */
  menuFocusFallback: HTMLElement | null = null;

  // ---- Clear context menu state ----
  clearMenuOpen = false;

  // ---- Fullscreen focus fallback ----
  /** Visible control to focus if the fullscreen menu item is hidden when the view closes */
  fullscreenFocusFallback: HTMLElement | null = null;

  @ViewChild(SetupWizardV2Component) private wizardRef?: SetupWizardV2Component;
  @ViewChild('goalPresets') private goalPresetsRef?: SettingsModalComponent;
  @ViewChild(HelpComponent) private helpRef?: HelpComponent;
  @ViewChild(SymbolsRefComponent) private symbolsRefRef?: SymbolsRefComponent;
  @ViewChild('decoderBox') decoderBoxRef?: ElementRef<HTMLDivElement>;
  @ViewChild('encoderInput') encoderInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('audioToggleButton') private audioToggleButtonRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('practiceActionButton') private practiceActionButtonRef?: ElementRef<HTMLButtonElement>;

  /** Delays sprite reveal until viewport has settled after page load */
  spriteReady = false;

  /**
   * True while the touch keyer sprite (straight key or paddle) is on the main screen. The CSS then
   * fits the output panel and the sprite into the viewport (`sprite-fit`):
   * the sprite takes the room left over and the text box gives way first.
   */
  @HostBinding('class.sprite-fit')
  get spriteShown(): boolean {
    return this.settings.settings().spriteButtonEnabled && !this.mainPracticeActive
      && !this.showTryMorseGuide && this.spriteReady;
  }

  private subs: Subscription[] = [];
  private readonly helpLinks = inject(HelpLinkService);
  private readonly modalBack = inject(ModalBackService);
  readonly updates = inject(UpdateService);
  private readonly whatsNew = inject(WhatsNewService);
  private readonly confirmService = inject(ConfirmService);
  private readonly ngZone = inject(NgZone);

  /** Tracks how many modal history entries are currently pushed */
  private modalHistoryDepth = 0;

  /** Decoder `taggedTotal` as last seen by the forwarding effect — used to detect new decoded chars */
  private lastTaggedTotal = 0;

  /** Last known encoder sentIndex — used to detect newly sent chars */
  private lastSentIdx = 0;
  /** `encoder.sendCompletions()` as last seen by the sent-text effect */
  private lastSendCompletions = 0;
  /** Last known encoder buffer — detects when buffer is replaced */
  private lastSentBuf = '';
  /** Last known encoder wordGapCount — detects word-gap timer firings */
  private lastWordGapCount = 0;

  /**
   * MIDI reconnect banner flags — set when the page loaded with MIDI enabled
   * but it could not be started without the user: the browser had not yet
   * granted MIDI access, or starting failed. Chrome's MIDI subsystem cannot
   * always reconnect on its own. Cleared by the banner's re-enable button,
   * when the user dismisses it, or when they re-enable the service in Settings.
   */
  midiInputNeedsReconnect = false;
  midiOutputNeedsReconnect = false;
  /** Why the notice's re-enable button could not start MIDI */
  midiReconnectError = '';

  /** Whether the main screen blurred text is being revealed (button held) */
  mainRevealing = false;

  constructor(
    private hostRef: ElementRef,
    public settings: SettingsService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
    public cwInput: CwInputService,
    public audioFile: AudioFileService,
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
    public transcriptSave: TranscriptSaveService,
    public loopDetection: LoopDetectionService,
    public wakeLock: WakeLockService,
    public autoFullscreen: AutoFullscreenService,
    public practice: PracticeService,
    public ebook: EbookService,
    public sendPractice: SendPracticeService,
    public kochHelp: KochHelpService,
    private sendPracticeGate: SendPracticeGateService,
    public viewport: ViewportService,
    public installHint: InstallHintService,
    public clear: ClearService,
  ) {
    // Unsaved settings put a guard entry under Back (see `ensureGuard`); saving or reverting lifts a "Leave" answer
    effect(() => {
      const dirty = this.settings.isDirty();
      if (!dirty) this.guardDismissed = false;
      else untracked(() => this.ensureGuard());
    });
    // Browser toolbars collapsing, rotation and zoom change the visual viewport without always firing
    // a window resize, so the host height follows the service's signal.
    effect(() => {
      this.viewport.height();
      this.correctHostHeight();
    });

    // The example has been sent: the send button stops pulsing
    effect(() => {
      if (this.encoder.isSending()) this.tryExamplePending = false;
    });

    // Copy and Send practice never use the CW tone detector and it would hear the practice's own sidetone, so
    // being in one switches it off and keeps it off in the saved profile (also after a reload that lands in practice)
    effect(() => {
      const s = this.settings.settings();
      const practice = s.encoderMode === 'practice' || s.encoderMode === 'send-practice';
      // A device profile that loads and lands in practice is not the user switching to it: no question then
      const fingerprint = this.settings.currentFingerprint();
      // Going from Copy to Send practice (or back) counts: the sidetone may have been kept off for the other one
      const switched = this.practiceMode !== undefined && practice && s.encoderMode !== this.practiceMode
        && fingerprint === this.practiceFingerprint;
      this.practiceMode = practice ? s.encoderMode : null;
      this.practiceFingerprint = fingerprint;
      if (!practice) return;
      untracked(() => {
        // Stopping a running decoder here (for example a reload that lands in practice) gives back what it asked for
        const stopped = cwDecoderOn(s);
        if (stopped) {
          this.settings.updateAndPersist({ cwDecoderActive: false });
          void this.cwInput.stop();
        }
        if (switched || stopped) void this.offerAfterPracticeEntry(!sidetonePlaysEncoder(s), stopped);
      });
    });

    // Auto-scroll the main decoder box when new text arrives
    effect(() => {
      this.displayBuffers.mainOutput.lines();
      const el = this.decoderBoxRef?.nativeElement;
      if (el) {
        // While an audio file plays, glide so the text stays a row above the player
        const behavior: ScrollBehavior = this.audioFile.loaded() ? 'smooth' : 'auto';
        requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior }));
      }
    });

    // Watch for new decoded characters and forward to WinKeyer and Firebase RTDB
    // Also push every entry (including RTDB-sourced) into the display buffers.
    // Loop detection: record output chars and check for feedback loops.
    effect(() => {
      const fresh = this.decoder.taggedSince(this.lastTaggedTotal);
      this.lastTaggedTotal = this.decoder.taggedTotal;
      // Send practice shows its own prompt and keyed text; on "This device only" its keying stays off the outputs
      const sendPracticeKeying = this.sendPractice.active();
      const sendPracticeLocal = this.sendPracticeGate.blocked();
      const decoderLocal = this.settings.settings().cwOutputPipeline === 'local';
      if (fresh.length > 0) {
        // Forward only the newly added characters
        for (const entry of fresh) {
          // Push to independent display buffers for all entries
          const displayName = this.getDisplayName(entry.type, entry.name);
          // A new line is only shown: it is not a character to forward or to check for loops
          if (entry.newLine) {
            if (!sendPracticeKeying) this.displayBuffers.pushDecodedNewLine(entry.type, displayName, entry.color);
            continue;
          }
          if (!sendPracticeKeying || entry.fromRtdb) {
            this.showDecoded(entry, displayName);
          }
          if (sendPracticeLocal && !entry.fromRtdb) continue;
          // Text decoded by the CW detector (microphone or audio file) stays on this device unless the full pipeline was chosen
          if ((entry.fromFile || entry.inputPath === 'cwAudio') && decoderLocal) continue;

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
            this.loopDetection.recordInput(entry.char, entry.inputPath ?? entry.type);
          }

          // Skip if loop is suppressed
          if (this.loopDetection.isSuppressed) continue;

          // Record as output for loop detection
          if (!entry.fromRtdb) {
            this.loopDetection.recordOutput(entry.char, entry.inputPath ?? entry.type);
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
    });

    // Watch for encoder sentIndex advancing — push newly sent chars to display buffers
    effect(() => {
      const buf = this.encoder.buffer();
      const idx = this.encoder.sentIndex();
      const isPractice = this.settings.settings().encoderMode === 'practice';
      const completions = this.encoder.sendCompletions();
      const sendCompleted = completions !== this.lastSendCompletions;
      this.lastSendCompletions = completions;
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
            // Only a send that ran to the end leaves characters to show; a buffer emptied by Clear or
            // backspace was discarded
            const end = sendCompleted ? this.lastSentBuf.length : this.lastSentIdx;
            let i = this.lastSentIdx;
            while (i < end) {
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

    // The reveal button is disabled without text, so a hold cannot end by itself when the text goes
    effect(() => {
      if (!this.displayBuffers.mainOutput.hasText()) this.mainRevealing = false;
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
          // A typed space already on screen is the word gap
          if (!this.displayBuffers.sentSpaceShown(encSource)) {
            this.displayBuffers.pushSent(encSource, ' ', displayName, displayColor);
            // The remote screen needs the word gap too, or the next send runs on from this one
            void this.rtdbService.forwardEncoderChar(' ', es.encoderWpm, encSource, es.encoderName, es.encoderColor);
          }
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

    // Hidden practice notes show again whenever a mode is switched to
    // (compared with the previous mode: other settings, such as the key/paddle toggle, change the same signal)
    let guideMode = this.settings.settings().encoderMode;
    effect(() => {
      const mode = this.settings.settings().encoderMode;
      if (mode === guideMode) return;
      guideMode = mode;
      this.dismissedGuides.clear();
    });

    // Practice on the main screen accepts typing only: no keyboard or mouse keying
    effect(() => {
      this.settings.settings().encoderMode;
      this.syncMainPracticeKeying();
    });

    // Sync practice userInput signal to main-screen textarea
    // (handles clear from fullscreen toolbar or abort resetting the input)
    effect(() => {
      const input = this.practice.userInput();
      const box = this.encoderInputRef?.nativeElement;
      // The answer is also typed in the full screen: the hidden box follows it
      if (box && this.settings.settings().encoderMode === 'practice' && box.value !== input) {
        box.value = input;
        this.encoderInputHasText = input.trim().length > 0;
      }
    });
  }

  /**
   * Close the speed menu when a press lands outside it. Listening for the press (not the click)
   * in the capture phase also catches the sprite key and the keyers, which handle
   * mouse/touch events themselves and may stop the click from ever firing.
   */
  private readonly outsidePressHandler = (event: PointerEvent): void => {
    if (this.controlsKebabOpen && !(event.target as Element | null)?.closest?.('.kebab-wrapper')) {
      this.controlsKebabOpen = false;
    }
  };

  ngOnInit(): void {
    this.dropStaleModalEntries();
    document.addEventListener('pointerdown', this.outsidePressHandler, true);
    this.ngZone.runOutsideAngular(() => {
      for (const type of this.gestureEvents) document.addEventListener(type, this.gestureResumeHandler, true);
    });
    this.modalBack.host = {
      push: () => this.pushModalState('dialog'),
      pop: () => this.popModalState(),
      restore: () => this.restoreModalState(),
    };
    this.subs.push(this.helpLinks.requested$.subscribe(id => this.showHelpOnTop(id)));
    // Resume was chosen for a book loaded in Settings: leave Settings and start reading in that practice
    this.subs.push(this.ebook.resumed$.subscribe(kind => this.readBookNow(kind)));
    this.subs.push(this.clear.inputCleared$.subscribe(() => {
      if (this.encoderInputRef) this.encoderInputRef.nativeElement.value = '';
    }));
    try {
      this.showTryMorseGuide = localStorage.getItem('mcsTryMorseGuideDismissed') !== '1';
    } catch {
      this.showTryMorseGuide = true;
    }

    this.refreshDeviceConfig();
    window.setTimeout(() => this.whatsNew.showOnce(), 800);

    // Wire mic key events into decoder — use configured source (RX or TX)
    this.subs.push(
      this.audioInput.keyEvent$.subscribe(evt => {
        this.micKeyDown = evt.down;
        // The lesson help is played through the sidetone: a mic that hears it must not key the sidetone again
        if (this.ignoreOwnSoundEdge('mic', evt.down)) return;
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

    // Keying with audio stopped: draw attention to the audio button and notice
    this.subs.push(
      this.decoder.keyDown$.subscribe(evt => {
        if (evt.fromFile || this.activeModal || this.audioState !== 'stopped') return;
        this.ngZone.run(() => {
          this.audioAttention = true;
          if (this.audioAttentionTimer !== null) clearTimeout(this.audioAttentionTimer);
          this.audioAttentionTimer = window.setTimeout(() => this.clearAudioAttention(), 3000);
        });
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

    // CW audio input → decoder (source RX or TX as set). The detector times
    // dits, dahs and gaps itself; key edges only drive the sidetone and vibration.
    const cwOpts = () => {
      const s = this.settings.settings();
      return {
        name: s.cwInputName || undefined, color: s.cwInputColor || undefined, externalTiming: true,
        fromFile: this.cwInput.fileActive() || undefined,
      };
    };
    this.subs.push(this.cwInput.feedbackStopped$.subscribe(() => void this.cwControl.offerScreenOff()));
    this.subs.push(
      this.cwInput.keyEvent$.subscribe(evt => {
        this.cwKeyDown = evt.down;
        if (this.ignoreOwnSoundEdge('cw', evt.down)) return;
        const source = this.settings.settings().cwInputSource;
        if (evt.down) {
          this.decoder.onKeyDown('cwAudio', source, cwOpts());
        } else {
          this.decoder.onKeyUp('cwAudio', source, cwOpts());
        }
      }),
      this.cwInput.decode$.subscribe(evt => {
        const source = this.settings.settings().cwInputSource;
        if (evt.type === 'pattern' && !evt.pattern) this.decoder.clearPattern('cwAudio');
        else if (evt.type === 'pattern') this.decoder.externalPattern('cwAudio', source, evt.pattern, cwOpts(), evt.unitMs);
        else if (evt.type === 'char') this.decoder.externalCharacter('cwAudio', source, evt.pattern, cwOpts(), evt.wpm);
        else if (evt.type === 'newline') this.decoder.externalNewLine('cwAudio', source, cwOpts());
        else this.decoder.externalWord('cwAudio', source, cwOpts());
      }),
    );

    // The audio file is unloaded: the microphone inputs come back if audio is running
    this.subs.push(
      this.audioFile.unloaded$.subscribe(() => { void this.resumeInputsAfterFile(); }),
    );

    // The audio file asks for Settings (prosign actions that erase text): open it on that card
    this.subs.push(
      this.audioFile.settingsRequested$.subscribe(landing => this.openSettings(landing)),
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
        this.decoder.pushTagged({ type: source, char, name: effectiveName, color: effectiveColor, fromRtdb: true, wpm });
        // Play through all outputs whose forward mode matches the source
        // Use remote WPM unless the user has chosen to override with local encoder WPM
        const playbackWpm = this.settings.settings().rtdbInputOverrideWpm
          ? this.settings.settings().encoderWpm
          : wpm;
        this.encoder.enqueueRxPlayback(char, source, playbackWpm, effectiveName, effectiveColor);
      })
    );

    // Main screen touch keyer animation — straight key sprite: react to straight key events from other keyers
    this.subs.push(
      this.keyer.straightKeyEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (evt.down && !evt.inputPath?.startsWith('keyboard')) this.releaseTextFocus();
        if (!s.spriteButtonEnabled || s.spriteKeyerMode !== 'straight') return;
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

    // Straight key sprite — react to encoder element events
    this.subs.push(
      this.encoder.elementEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (!s.spriteButtonEnabled || !s.spriteAnimateEncoder || s.spriteKeyerMode === 'paddle') return;
        this.spriteKeyDown = evt.down;
      })
    );

    // Paddle sprite — the encoder keys it like a person would in the sprite's paddle mode (squeeze, lead, hand-over)
    this.subs.push(
      this.encoder.paddleEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (!s.spriteButtonEnabled || !s.spriteAnimateEncoder || s.spriteKeyerMode !== 'paddle') return;
        this.ngZone.run(() => {
          if (!evt.element) {
            this.encoderPaddleSides.clear();
            this.setSpriteHold('encoder', undefined, false);
            return;
          }
          // The encoder plays as if sent on this sprite: with Reverse Paddles a dot is on the right paddle.
          // The paddle used at press is remembered so a release matches it even if the setting changed meanwhile
          let shown: 'dit' | 'dah';
          if (evt.down) {
            shown = s.spriteReversePaddles ? (evt.element === 'dit' ? 'dah' : 'dit') : evt.element;
            this.encoderPaddleSides.set(evt.element, shown);
          } else {
            shown = this.encoderPaddleSides.get(evt.element) ?? evt.element;
            this.encoderPaddleSides.delete(evt.element);
          }
          this.setSpriteHold('encoder', shown, evt.down);
        });
      })
    );

    // Straight key sprite — react to mic straight key events
    this.subs.push(
      this.audioInput.keyEvent$.subscribe(evt => {
        if (evt.down) this.releaseTextFocus();
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteKeyerMode === 'straight' && s.spriteAnimateMic) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // Straight key sprite — react to serial straight key events
    this.subs.push(
      this.serialInput.straightKeyEvent$.subscribe(evt => {
        if (evt.down) this.releaseTextFocus();
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteKeyerMode === 'straight' && s.spriteAnimateSerial) {
          this.spriteKeyDown = evt.down;
        }
      })
    );

    // Straight key sprite — react to MIDI straight key events (MIDI callbacks run outside Angular's zone)
    this.subs.push(
      this.midiInput.straightKeyEvent$.subscribe(evt => {
        const s = this.settings.settings();
        if (s.spriteButtonEnabled && s.spriteKeyerMode === 'straight' && s.spriteAnimateMidi) {
          this.ngZone.run(() => { this.spriteKeyDown = evt.down; });
        }
      })
    );

    // Paddle sprite — react to the paddle contacts of the keyboard, mouse, MIDI and serial keyers
    this.subs.push(
      merge(this.keyer.paddleEvent$, this.midiInput.paddleEvent$, this.serialInput.paddleEvent$)
        .subscribe(evt => this.onSpritePaddleContact(evt))
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
    if (this.isAudioMarkedRunning()) {
      this.autoStartAudio();
    }

    // The wake lock and auto full screen start themselves once the saved profile enables them (service effects)
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.outsidePressHandler, true);
    this.clearAudioAttention();
    for (const type of this.gestureEvents) document.removeEventListener(type, this.gestureResumeHandler, true);
    this.subs.forEach(s => s.unsubscribe());
    this.mouseKeyer.detachAll();
  }

  /** Whether the main kebab menu is open; while open, the browser Back button closes it */
  get controlsKebabOpen(): boolean {
    return this.kebabOpen;
  }

  set controlsKebabOpen(open: boolean) {
    if (open === this.kebabOpen) return;
    this.kebabOpen = open;
    if (open) {
      this.releaseKebabBack = this.modalBack.open(() => {
        this.kebabOpen = false;
        this.releaseKebabBack = null;
        this.collapseSpeedsLater();
      });
    } else {
      this.releaseKebabBack?.();
      this.releaseKebabBack = null;
      this.collapseSpeedsLater();
    }
  }

  /** Collapse Morse Speeds one tick after the menu closed, when it is already hidden, so it never visibly slides shut */
  private collapseSpeedsLater(): void {
    setTimeout(() => {
      if (!this.kebabOpen) this.speedsOpen = false;
    }, 0);
  }

  // ---- Browser back-button modal handling ----

  /** Open the full screen once the wizard has left the history (set by the wizard's screen choice) */
  private fullscreenAfterWizard = false;

  /** How many popstate events caused by our own history.back()/forward()/go() are still to come (each is ignored) */
  private ignoredPopStates = 0;

  /** History changes waiting until the traversal in flight has finished (see `runHistoryOp`) */
  private historyQueue: (() => void)[] = [];

  /** Gives up waiting for a popstate that never comes, so a lost one cannot swallow the user's next Back press */
  private historyWatchdog: ReturnType<typeof setTimeout> | null = null;

  /** True while `onPopState` runs, so a dialog opened by Back (a question asked from a popup) is pushed only afterwards */
  private handlingPopState = false;

  /** True while one of those is still on its way */
  private get ignoringPopState(): boolean {
    return this.ignoredPopStates > 0;
  }

  /**
   * Run a history change now, or once the traversals before it have finished. Browsers can merge two
   * back/forward calls made close together into one traversal (one popstate for two calls), and a pushState made
   * while a traversal is on its way can land the page on a different entry than counted. Either leaves the
   * browser's history one entry off our count, and the next Back then leaves the app instead of closing the
   * full screen. A push made while Back is being handled waits too, so the entry Back just left is still there
   * when a popup that stays open steps forward onto it again.
   */
  private runHistoryOp(op: () => void, push = false): void {
    if (this.ignoredPopStates > 0 || (push && this.handlingPopState)) this.historyQueue.push(op);
    else op();
  }

  /** A history traversal of ours is starting: its popstate is ignored */
  private expectPopState(): void {
    this.ignoredPopStates++;
    this.armHistoryWatchdog();
  }

  private armHistoryWatchdog(): void {
    if (this.historyWatchdog) clearTimeout(this.historyWatchdog);
    this.historyWatchdog = setTimeout(() => {
      this.historyWatchdog = null;
      if (this.ignoredPopStates > 0) {
        this.ignoredPopStates = 0;
        this.flushHistoryQueue();
      }
    }, 1500);
  }

  /** Run the waiting history changes until one of them starts a traversal */
  private flushHistoryQueue(): void {
    while (this.ignoredPopStates === 0 && this.historyQueue.length) this.historyQueue.shift()!();
  }

  /**
   * A reload (pull-to-refresh, update) with a dialog open leaves that dialog's history entries behind
   * while the app starts with no dialog open, so each would need its own Back press. Walk back to
   * the base entry once. With no dialog open the popstate this causes is ignored.
   */
  private dropStaleModalEntries(): void {
    const stale = (history.state as { depth?: unknown } | null)?.depth;
    if (typeof stale === 'number' && stale > 0) history.go(-stale);
  }

  /** Push a history entry so the back button can close the modal */
  private pushModalState(modal: string): void {
    // The guard entry (if any) sits below the dialogs, so a reloaded page must walk back over it too
    const depth = ++this.modalHistoryDepth + (this.guardActive ? 1 : 0);
    // `depth` lets a reloaded page know how many entries the previous page left on top of the base entry
    this.runHistoryOp(() => history.pushState({ modal, depth }, ''), true);
  }

  /** A guard history entry sits on top of the base entry, so Back from the main screen can ask about unsaved settings */
  private guardActive = false;

  /** The user chose "Leave without saving": no new guard until the settings are saved or reverted */
  private guardDismissed = false;

  /**
   * While settings are unsaved and no dialog is open, put one extra history entry on top of the base entry. A page
   * cannot intercept Back at its first entry, but it can at this one: `handlePopState` then asks before the app is left.
   */
  private ensureGuard(): void {
    this.runHistoryOp(() => {
      if (this.guardActive || this.guardDismissed || this.modalHistoryDepth > 0 || !this.settings.isDirty()) return;
      this.guardActive = true;
      history.pushState({ guard: true, depth: 1 }, '');
    }, true);
  }

  /**
   * Back reached the base entry while the guard was up. With unsaved settings, say so: the Stay button keeps the guard
   * for the next Back; Back itself closes the note and leaves no guard, so one more Back exits. A page cannot exit
   * an installed app by itself (history.back() and window.close() do nothing there), which is why Back is the way out.
   */
  private async leaveOrAsk(): Promise<void> {
    this.guardActive = false;
    if (!this.settings.isDirty()) {
      this.runHistoryOp(() => history.back());
      return;
    }
    // Set first: the popstate of a Back that closes the note must not put a new guard up
    this.guardDismissed = true;
    const stay = await this.confirmService.ask({
      title: 'Unsaved settings',
      message: 'You have settings changes that are not saved. If you leave the app now they are lost. '
        + 'Stay and use Settings → Save to keep them, or press Back again to leave without saving.',
      confirmLabel: 'Stay',
      singleAction: true,
    });
    if (stay) {
      this.guardDismissed = false;
      this.ensureGuard();
    }
  }

  /** Back left the entry of a popup that is still open: step forward onto it again */
  private restoreModalState(): void {
    this.modalHistoryDepth++;
    this.runHistoryOp(() => {
      this.expectPopState();
      history.forward();
    });
  }

  /** Pop the history entry when closing a modal via UI (not back button) */
  private popModalState(): void {
    if (this.modalHistoryDepth > 0) {
      this.modalHistoryDepth--;
      this.runHistoryOp(() => {
        this.expectPopState();
        history.back();
      });
    }
  }

  /** Close the topmost modal — called by popstate (back button) */
  private closeActiveModal(): void {
    // Help and the symbols reference open on top of every other dialog, so they close first
    // An open search bar closes first; the dialog stays, so its history entry is restored
    if (this.showHelp) {
      if (this.helpRef?.searchOpen) {
        this.helpRef.closeSearch();
        this.restoreModalState();
      } else {
        this.showHelp = false;
      }
    } else if (this.showSymbolsRef) {
      if (this.symbolsRefRef?.searchOpen) {
        this.symbolsRefRef.closeSearch();
        this.restoreModalState();
      } else {
        this.showSymbolsRef = false;
      }
    } else if (this.modalBack.handleBack()) {
      // a popup opened by a card (a mapping editor) closed itself
    } else if (this.showGoalPresets) {
      // A review, menu or confirmation inside Presets steps back first; the list closes on the next Back
      if (this.goalPresetsRef?.stepBackInPresets()) this.restoreModalState();
      else this.dismissGoalPresets(false);
    } else if (this.showWizard) {
      if (this.wizardRef?.onMappingPage || this.wizardRef?.hasDraft()) {
        // Back was pressed with unapplied answers: keep the wizard and ask first.
        // Step forward onto the entry Back just left: a pushState inside popstate may be skipped by the next Back
        this.restoreModalState();
        this.wizardRef.askDiscard();
      } else {
        this.showWizard = false;
      }
    } else if (this.showSettings) {
      this.showSettings = false;
    } else if (this.showGoals) {
      this.showGoals = false;
    } else if (this.activeModal) {
      this.activeModal = null;
      this.syncMainPracticeKeying();
    }
  }

  private mouseDragStartX = 0;
  private mouseDragLeft = false;
  private mouseDragActive = false;
  private mouseDragEndedAt = 0;

  @HostListener('document:mousedown', ['$event'])
  onDragStart(event: MouseEvent): void {
    this.mouseDragStartX = event.clientX;
    this.mouseDragLeft = false;
    this.mouseDragActive = true;
  }

  @HostListener('document:mousemove', ['$event'])
  onDragMove(event: MouseEvent): void {
    if (this.mouseDragActive && this.mouseDragStartX - event.clientX >= 30) this.mouseDragLeft = true;
  }

  @HostListener('document:mouseup')
  onDragEnd(): void {
    this.mouseDragActive = false;
    this.mouseDragEndedAt = Date.now();
  }

  /** A leftward mouse drag (for example selecting text) that some desktop browsers read as Back. */
  private get leftwardMouseDragRecent(): boolean {
    return this.mouseDragLeft && (this.mouseDragActive || Date.now() - this.mouseDragEndedAt < 1000);
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(_event: PopStateEvent): void {
    this.handlingPopState = true;
    try {
      this.handlePopState();
    } finally {
      this.handlingPopState = false;
      this.flushHistoryQueue();
      this.ensureGuard();
    }
  }

  private handlePopState(): void {
    if (!this.ignoringPopState && this.modalHistoryDepth > 0 && this.leftwardMouseDragRecent) {
      // Not a real Back press: restore the entry and leave the dialogs open.
      history.pushState({ modal: 'restored', depth: this.modalHistoryDepth }, '');
      return;
    }
    if (this.ignoringPopState) {
      this.ignoredPopStates--;
      if (this.ignoredPopStates > 0) {
        this.armHistoryWatchdog();
      } else if (this.historyWatchdog) {
        clearTimeout(this.historyWatchdog);
        this.historyWatchdog = null;
      }
      // The wizard's history entries are gone now, so the full screen can take its own entry
      if (this.fullscreenAfterWizard) {
        this.fullscreenAfterWizard = false;
        this.openModal();
      }
      return;
    }
    if (this.modalHistoryDepth > 0) {
      this.modalHistoryDepth--;
      this.closeActiveModal();
    } else if (this.guardActive) {
      void this.leaveOrAsk();
    }
  }

  /** Whether main-screen practice is active, so straight-key style inputs are off. */
  get mainPracticeActive(): boolean {
    return this.settings.settings().encoderMode === 'practice';
  }

  /** The practice mode the previous look at the Mode was in (null when none, undefined before the first look), and the device profile it was under */
  private practiceMode: string | null | undefined = undefined;
  private practiceFingerprint = '';

  /** Each disruptive prosign is asked about at most once per page session */
  private prosignPrompted = new Set<string>();

  /** Decoded entries held back (in order) while the question about a prosign is open */
  private hhHeld: { entry: TaggedEntry; displayName: string | undefined }[] | null = null;

  /**
   * Show a decoded entry. The first <HH> or <SK> decoded in Send on Enter or Live (not from the CW decoder), while
   * prosign actions are on and that prosign has no action, asks whether to enable it; text that follows waits for the
   * answer so the order is kept and an accepted action also applies to this prosign.
   */
  private showDecoded(entry: TaggedEntry, displayName: string | undefined): void {
    if (this.hhHeld) {
      this.hhHeld.push({ entry, displayName });
      return;
    }
    const prosign = entry.char === '<HH>' || entry.char === '<SK>' ? entry.char : null;
    if (prosign && !this.prosignPrompted.has(prosign) && this.needsProsignPrompt(prosign, entry)) {
      this.prosignPrompted.add(prosign);
      this.hhHeld = [{ entry, displayName }];
      void this.askEnableProsign(prosign);
      return;
    }
    this.displayBuffers.pushDecoded(entry.type, entry.char, displayName, entry.color);
  }

  private needsProsignPrompt(prosign: '<HH>' | '<SK>', entry: TaggedEntry): boolean {
    const s = this.settings.settings();
    if (!s.prosignActionsEnabled || s.prosignActions[prosign]?.enabled) return false;
    if (s.encoderMode !== 'enter' && s.encoderMode !== 'live') return false;
    return !cwDecoderOn(s) && !entry.fromFile && entry.inputPath !== 'cwAudio';
  }

  private async askEnableProsign(prosign: '<HH>' | '<SK>'): Promise<void> {
    const hh = prosign === '<HH>';
    const enable = await this.confirmService.ask({
      title: hh ? 'Use <HH> to clear the last word?' : 'Use <SK> to clear the screen?',
      message: hh
        ? 'The error prosign <HH> (eight dits) was just decoded, and it has no action. Turn it on so that '
          + '<HH> removes the last word from the text? You can change this in Settings → Other → Prosign Actions.'
        : 'The end-of-contact prosign <SK> was just decoded, and it has no action. Turn it on so that '
          + '<SK> clears the screen? You can change this in Settings → Other → Prosign Actions.',
      confirmLabel: `Enable ${prosign}`,
      cancelLabel: 'Not now',
    });
    if (enable) {
      const s = this.settings.settings();
      this.settings.updateAndPersist({
        prosignActions: {
          ...s.prosignActions,
          [prosign]: { enabled: true, action: hh ? 'clearLastWord' : 'clearScreen' },
        },
      });
    }
    const held = this.hhHeld ?? [];
    this.hhHeld = null;
    for (const { entry, displayName } of held) {
      this.displayBuffers.pushDecoded(entry.type, entry.char, displayName, entry.color);
    }
  }

  /** Entering a practice mode: offer the sidetone, then (when the decoder was stopped for it) the screen. */
  private async offerAfterPracticeEntry(sidetoneOff: boolean, decoderStopped: boolean): Promise<void> {
    if (sidetoneOff) await this.offerSidetoneForPractice();
    if (decoderStopped) await this.cwControl.offerScreenOff();
  }

  /**
   * Switching to a practice mode when the sidetone would not play it (off, or set to play only the other direction):
   * practice is played through the sidetone, so offer to turn it on (and to play both directions).
   */
  private async offerSidetoneForPractice(): Promise<void> {
    const off = !this.settings.settings().sidetoneEnabled;
    const on = await this.confirmService.ask({
      title: 'Turn the sidetone on?',
      message: 'Practice plays its Morse through the sidetone, and '
        + (off ? 'the sidetone is off' : 'the sidetone is set to play only the other direction')
        + ', so you would hear nothing. Turn it on? You can change it later in Settings → Outputs → Sidetone.',
      confirmLabel: off ? 'Turn sidetone on' : 'Play practice too',
      cancelLabel: off ? 'Keep it off' : 'Keep it',
    });
    if (!on) return;
    const s = this.settings.settings();
    const covers = s.sidetoneForward === 'both' || s.sidetoneForward === s.encoderSource;
    this.settings.updateAndPersist({ sidetoneEnabled: true, sidetoneForward: covers ? s.sidetoneForward : 'both' });
  }

  /** The inputs whose key-down was ignored because they were hearing the app's own sound (their key-up is ignored too) */
  private ignoredOwnSoundDown = { mic: false, cw: false };

  /**
   * True when a mic or CW detector key edge should not reach the decoder because what the input hears is the app's
   * own sidetone, which would key the sidetone again and latch it on: while the Koch lesson help plays, and for the
   * CW detector in Copy and Send practice (it listens to the air, the practice never uses it, and the keying or
   * playback of the practice sounds the sidetone). A key-down ignored this way also drops its key-up, so the decoder
   * never sees a lone key-up, and an edge that began before carries on to its own key-up.
   */
  private ignoreOwnSoundEdge(input: 'mic' | 'cw', down: boolean): boolean {
    if (down) {
      const mode = this.settings.settings().encoderMode;
      this.ignoredOwnSoundDown[input] = this.kochHelp.playing()
        || (input === 'cw' && (mode === 'practice' || mode === 'send-practice'));
      return this.ignoredOwnSoundDown[input];
    }
    const ignored = this.ignoredOwnSoundDown[input];
    this.ignoredOwnSoundDown[input] = false;
    return ignored;
  }

  /** Disable keyboard and mouse keying on the main screen during practice; restore otherwise. */
  private syncMainPracticeKeying(): void {
    if (this.activeModal) return;
    this.keyer.setKeyboardMappingsEnabled(!this.mainPracticeActive);
    const box = this.decoderBoxRef?.nativeElement;
    if (!box) return;
    if (this.mainPracticeActive) this.mouseKeyer.detach(box);
    else this.mouseKeyer.attach(box);
  }

  ngAfterViewInit(): void {
    if (this.decoderBoxRef && !this.mainPracticeActive) {
      this.mouseKeyer.attach(this.decoderBoxRef.nativeElement);
    }

    // Delay the sprite reveal by 500ms so the mobile viewport has fully
    // settled (URL bar animation, font loading).  The sprite then fades in
    // via CSS animation — no resize flicker.
    setTimeout(() => {
      this.correctHostHeight();
      this.spriteReady = true;
    }, 500);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.correctHostHeight();
    if (this.controlsKebabOpen) this.updateKebabMaxHeight();
  }

  /**
   * On mobile browsers 100dvh can be stale after a pull-to-refresh (it may
   * include the URL bar height).  Explicitly set min-height to the real
   * viewport height so the flex layout is computed correctly; `--host-h` is
   * the same height for the sprite layout, which fixes the host height.
   */
  private correctHostHeight(): void {
    const host = this.hostRef.nativeElement as HTMLElement;
    host.style.minHeight = window.innerHeight + 'px';
    host.style.setProperty('--host-h', window.innerHeight + 'px');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.controlsKebabOpen = false;
    this.clearMenuOpen = false;
    this.replayMenuOpen = false;
    this.focusPracticeInputAfterClick(event);
  }

  /**
   * In Type-along a click anywhere on the main screen that is not on a control (a button, a menu, a select, a field, a link,
   * a dialog) or on text being selected sends the typing back to the answer, so the guide box and the empty places count too.
   */
  private focusPracticeInputAfterClick(event: MouseEvent): void {
    if (this.activeModal || !this.copyPractice || this.practice.feedbackMode() !== 'typealong') return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest || target.closest('button, a, input, select, textarea, label, summary, [role="dialog"], [role="alertdialog"], [role="menu"], .kebab-items, .clear-menu, .replay-menu')) return;
    if (!getSelection()?.isCollapsed) return;
    this.focusPracticeInput();
  }

  /** A letter typed anywhere on the main screen in Type-along goes to the answer, without clicking first. */
  private catchPracticeTyping(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
    if (this.activeModal || !this.copyPractice || this.practice.feedbackMode() !== 'typealong') return;
    const box = this.encoderInputRef?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (!box || target === box || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (target?.closest('button') && event.key === ' ') return;
    const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
      .some(dialog => !dialog.hidden && dialog.getClientRects().length > 0);
    if (!open) box.focus({ preventScroll: true });
  }

  /** F1 opens Help (instead of the browser's own help); Escape activates the close action in the topmost dialog. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'F1' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      this.onHelpShortcut(event);
      return;
    }
    // Find keys reach Help and the Symbols Reference even when focus has left them (the browser's own find bar stays out)
    if (!event.defaultPrevented && (this.showHelp || this.showSymbolsRef)) {
      const finder = this.showHelp ? this.helpRef : this.symbolsRefRef;
      if (finder?.handleFindKey(event)) return;
    }
    this.catchPracticeTyping(event);
    if (event.key !== 'Escape' || event.defaultPrevented) return;

    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
    ).filter(dialog =>
      !dialog.hidden &&
      dialog.getAttribute('aria-hidden') !== 'true' &&
      dialog.getClientRects().length > 0);
    const topmostDialog = dialogs[dialogs.length - 1];
    if (!topmostDialog) {
      const menu = this.clearMenuOpen
        ? { open: true, selector: '.clear-icon-btn' }
        : this.controlsKebabOpen
          ? { open: true, selector: '.kebab-btn' }
          : null;
      if (!menu?.open) {
        if (this.showTryMorseGuide) {
          event.preventDefault();
          this.dismissTryMorseGuide();
        }
        return;
      }

      event.preventDefault();
      this.clearMenuOpen = false;
        this.controlsKebabOpen = false;
      document.querySelector<HTMLButtonElement>(menu.selector)?.focus();
      return;
    }

    // The wizard decides itself what Escape does (a mapping page steps back to its list)
    if (topmostDialog.hasAttribute('data-handles-escape')) return;

    const closeButton = Array.from(
      topmostDialog.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Close"], button.close-btn',
      ),
    ).find(button => !button.disabled && button.getClientRects().length > 0);
    const dismissButton = closeButton ?? (
      topmostDialog.getAttribute('role') === 'alertdialog'
        ? topmostDialog.querySelector<HTMLButtonElement>(
          'button.cancel-btn:not([disabled]), button.ok-btn:not([disabled])',
        )
        : null
    );
    if (!dismissButton) return;

    event.preventDefault();
    dismissButton.click();
  }

  private clearAudioAttention(): void {
    if (this.audioAttentionTimer !== null) clearTimeout(this.audioAttentionTimer);
    this.audioAttentionTimer = null;
    this.audioAttention = false;
  }

  async toggleAudio(): Promise<void> {
    if (this.audioRunning) {
      await this.stopAudio();
    } else {
      await this.startAudio();
    }
  }

  /**
   * Audio is running but a context is paused and the background retries have not
   * recovered it. On iOS any context (autostart after a refresh, a phone call, an
   * app switch). Elsewhere only the inputs: after a reload audio restarts without a
   * click, and browsers keep such a context suspended until the user interacts. The
   * output resumes with the first key press, but the CW detector and the mic key
   * must listen before anyone touches the page. On a touch screen a paused output
   * is reported too once it has stayed paused for a moment (`stalled`): a phone that
   * has been idle can take a while to wake, and a context started without a tap stays
   * silent until one, while the button above already says audio is running.
   */
  get audioNeedsTap(): boolean {
    if (!this.audioRunning) return false;
    const inputPaused = this.audioInput.paused() || this.cwInput.paused();
    if (this.viewport.iosLayout) return inputPaused || this.audioOutput.paused();
    return inputPaused || (isTouchDevice() && this.audioOutput.stalled());
  }

  /**
   * Audio is on and not paused, but the device is not playing yet: a phone that was idle or locked
   * reports `running` a moment before sound can be heard. Shows the amber wake-up status instead of
   * "Audio is running".
   */
  get audioWarming(): boolean {
    return this.audioRunning && this.audioState === 'running' && !this.audioNeedsTap && !this.audioOutput.soundReady();
  }

  /** Words for the paused-audio notice: the input and the output wait for different things. */
  get audioNeedsTapMessage(): string {
    if (this.viewport.iosLayout) return 'Audio is paused.';
    return this.audioInput.paused() || this.cwInput.paused()
      ? 'Audio input is waiting for a click.'
      : 'Audio output is waiting for a tap.';
  }

  /**
   * Resumes paused audio on the next touch, click or key press anywhere. Browsers
   * accept resume() only inside a user gesture (iOS strictly), so the next tap does
   * it and no button needs to be found. It acts as soon as any context is paused, not
   * only once the paused-audio notice shows: after a reload the output waits for the
   * first tap, and waiting for the notice (1.5 s) or the 500 ms retry timer would add
   * to the silence. The "Tap to resume audio" button calls the same method. Registered
   * outside Angular's zone, so it adds no change detection.
   */
  private readonly gestureResumeHandler = (): void => {
    if (this.audioOutput.paused() || this.audioInput.paused() || this.cwInput.paused()) {
      void this.resumeAudio();
    }
  };
  private readonly gestureEvents = ['touchend', 'pointerup', 'click', 'keydown'];
  async resumeAudio(): Promise<void> {
    await Promise.allSettled([
      this.audioOutput.resumeFromGesture(),
      this.audioInput.resumeFromGesture(),
      this.cwInput.resumeFromGesture(),
    ]);
  }

  /**
   * Auto-start audio and MIDI after a browser refresh.
   * Called from ngOnInit when we detect the session was previously running.
   * Chrome remembers granted permissions so this works without a user gesture.
   */
  private async autoStartAudio(): Promise<void> {
    await this.startAudio(false);
  }

  /**
   * @param waitForOutput Wait (briefly) until the output is really running before reporting
   *   "running". Not after a reload: with no gesture yet the output stays suspended, and the
   *   paused-audio notice and the next tap deal with it.
   */
  private async startAudio(waitForOutput = true): Promise<void> {
    this.clearAudioAttention();
    this.audioStarting = true;
    this.audioState = 'starting';
    this.audioStatusMessage = 'Starting audio...';
    this.audioFailureMessage = null;
    this.audioRunning = false;
    let stage = 'microphone input';

    try {
      const settings = this.settings.settings();
      const needsInput = settings.micInputEnabled || cwDecoderOn(settings);
      if (typeof AudioContext === 'undefined' || (needsInput && !navigator.mediaDevices?.getUserMedia)) {
        const unsupportedError = new Error();
        unsupportedError.name = 'UnsupportedAudioError';
        throw unsupportedError;
      }

      // iOS: treat output as media playback so the ring/silent switch does not mute it.
      // With a microphone in use, iOS manages the session itself.
      const audioSession = (navigator as { audioSession?: { type: string } }).audioSession;
      if (this.viewport.iosLayout && audioSession && !needsInput) {
        try { audioSession.type = 'playback'; } catch { /* not settable here */ }
      }

      if (settings.micInputEnabled) {
        await this.audioInput.start();
      }

      stage = 'CW input';
      await this.cwInput.start();

      stage = 'audio output';
      await this.audioOutput.start();
      if (waitForOutput) await this.audioOutput.waitUntilRunning();

      await this.refreshDeviceConfig();

      // After a reload the device profile loads only now (settings were defaults
      // above), so start the inputs it enables; both calls do nothing if already running
      stage = 'microphone input';
      await this.audioInput.start();
      stage = 'CW input';
      await this.cwInput.start();

      this.audioRunning = true;
      this.audioState = 'running';
      this.audioStatusMessage = 'Audio is running.';
      this.rememberAudioRunning();
    } catch (error) {
      this.clearRememberedAudioRunning();
      const cleanupFailures = await this.stopAudioServices();
      this.micKeyDown = false;
      this.cwKeyDown = false;
      this.audioRunning = cleanupFailures.length > 0;
      this.audioState = 'failed';
      this.audioFailureMessage = this.audioStartFailureMessage(error, stage);
      if (cleanupFailures.length > 0) {
        this.audioFailureMessage += ` Audio cleanup is incomplete for ${cleanupFailures.join(', ')}. Retry stopping audio.`;
      }
      this.audioStatusMessage = this.audioFailureMessage;
    } finally {
      this.audioStarting = false;
    }
  }

  /** After an audio file is unloaded: the microphone inputs start again, as they do after a settings change, when audio is running. */
  private async resumeInputsAfterFile(): Promise<void> {
    if (!this.audioRunning) return;
    await this.warnErasingProsignsBeforeMic();
    if (!this.audioRunning) return;
    try {
      if (this.settings.settings().micInputEnabled) await this.audioInput.start();
      await this.cwInput.start();
    } catch (error) {
      this.audioFailureMessage = this.audioStartFailureMessage(error, 'microphone input');
    }
  }

  /**
   * The settings may have changed while the file played: before the detector listens to the microphone
   * again, say so when a prosign would erase the text it decodes. Decoding resumes either way; the second
   * button also opens Settings on the Prosign Actions card.
   */
  private async warnErasingProsignsBeforeMic(): Promise<void> {
    const s = this.settings.settings();
    const erasing = cwDecoderOn(s) ? erasingProsigns(s) : [];
    if (!erasing.length) return;
    const resumeOnly = await this.confirmService.ask({
      title: 'Prosigns can erase decoded text',
      message: `The recording has been unloaded and the detector is about to listen to the microphone again. Your prosign actions are set so that ${joinPhrases(erasing)}. `
        + 'If those prosigns are received, decoded text will be erased from the screen and from the text Save keeps. '
        + 'You can change this in Settings → Other → Prosign Actions.',
      confirmLabel: 'Resume decoding',
      cancelLabel: 'Resume and open Settings',
      danger: true,
    });
    if (!resumeOnly) this.openSettings('prosign-actions');
  }

  private async stopAudio(): Promise<void> {
    this.audioStarting = true;
    this.audioState = 'stopping';
    this.audioStatusMessage = 'Stopping audio...';
    this.audioFailureMessage = null;
    this.clearRememberedAudioRunning();

    try {
      const cleanupFailures = await this.stopAudioServices();
      this.micKeyDown = false;
      this.cwKeyDown = false;
      this.audioRunning = cleanupFailures.length > 0;
      if (cleanupFailures.length > 0) {
        this.audioState = 'failed';
        this.audioFailureMessage = `Audio could not be fully stopped. Cleanup is incomplete for ${cleanupFailures.join(', ')}. Retry stopping audio.`;
        this.audioStatusMessage = this.audioFailureMessage;
      } else {
        this.audioState = 'stopped';
        this.audioStatusMessage = 'Audio is stopped. Press the speaker button above to begin.';
      }
    } finally {
      this.audioStarting = false;
    }
  }

  async retryStopAudio(): Promise<void> {
    await this.stopAudio();
  }

  private async stopAudioServices(): Promise<string[]> {
    const services: { name: string; stop: () => Promise<void> }[] = [
      { name: 'microphone input', stop: () => this.audioInput.stop() },
      { name: 'CW input', stop: () => this.cwInput.stop() },
      { name: 'audio output', stop: () => this.audioOutput.stop() },
    ];
    const failures: string[] = [];

    for (const service of services) {
      try {
        await service.stop();
      } catch {
        failures.push(service.name);
      }
    }

    return failures;
  }

  private isAudioMarkedRunning(): boolean {
    try {
      return localStorage.getItem(AUDIO_RUNNING_KEY) === '1';
    } catch {
      return false;
    }
  }

  private rememberAudioRunning(): void {
    try { localStorage.setItem(AUDIO_RUNNING_KEY, '1'); } catch { }
  }

  private clearRememberedAudioRunning(): void {
    try { localStorage.removeItem(AUDIO_RUNNING_KEY); } catch { }
  }

  private audioStartFailureMessage(error: unknown, stage: string): string {
    const errorName = (error as { name?: string } | null)?.name;
    const inputEnabled = this.settings.settings().micInputEnabled || cwDecoderOn(this.settings.settings());

    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      if (stage === 'microphone input' || stage === 'CW input') {
        return 'Microphone access was denied. Allow microphone access for this site in your browser settings, then retry.';
      }
      return "The browser blocked audio playback. Select Start Audio to retry, and check this site's audio permissions if needed.";
    }
    if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') {
      if (stage === 'audio output') {
        return 'The selected audio output is unavailable. Connect an output device or choose another in Settings, then retry.';
      }
      return 'The selected audio input is unavailable. Connect an input device or choose another in Settings, then retry.';
    }
    if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      if (stage === 'audio output') {
        return 'The selected audio output may be busy. Close other apps using it or choose another device in Settings, then retry.';
      }
      return 'The selected audio input may be busy. Close other apps using it or choose another device in Settings, then retry.';
    }
    if (errorName === 'UnsupportedAudioError') {
      return inputEnabled
        ? 'This browser does not support the audio input features required by your enabled inputs. Try a supported browser.'
        : 'This browser does not support the audio features required by Morse Code Studio. Try a supported browser.';
    }
    return `Audio ${stage} could not start. Check your audio settings and device connections, then retry.`;
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
        && this.practice.feedbackMode() === 'typealong'
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
    if (this.settings.settings().encoderMode === 'live') {
      // Live text leaves the box as it is typed, so Enter has nothing to add and Backspace on an empty box takes back unsent text
      if (event.key === 'Enter') {
        event.preventDefault();
      } else if (event.key === 'Backspace' && !textarea.value) {
        event.preventDefault();
        this.removeLastUnsentChar();
      }
      return;
    }
    if (this.settings.settings().encoderMode === 'enter' && event.key === 'Enter') {
      event.preventDefault();
      const hasText = textarea.value.trim().length > 0;
      if (hasText && this.encoder.replayPending()) this.encoder.stopReplay();
      // While a send is running, new text is queued behind it; an empty box pauses it
      if (hasText && this.encoder.isSending()) {
        this.appendEncoderText(textarea);
        return;
      }
      this.requestEncoderTx(textarea);
    }
  }

  /** Queue the input box text behind the unsent text in the encoder buffer, separated by a space, and empty the box. */
  private appendEncoderText(textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (!text) return;
    const buffer = this.encoder.buffer();
    this.encoder.enqueue(buffer && !/\s$/.test(buffer) ? ' ' + text : text);
    textarea.value = '';
    this.encoderInputHasText = false;
  }

  /** Live mode: typed text goes to the end of the encoder buffer at once and leaves the box, as in the full screen. */
  private sendLiveText(textarea: HTMLTextAreaElement): void {
    // Runs of white space become one space; none at the start of a message or after another space
    let text = textarea.value.toUpperCase().replace(/\s+/g, ' ');
    const buffer = this.encoder.buffer();
    if (buffer.length <= this.encoder.sentIndex() || /\s$/.test(buffer)) text = text.replace(/^ /, '');
    textarea.value = '';
    this.encoderInputHasText = false;
    if (text) this.encoder.enqueue(text);
  }

  /** Live mode: take back the last unsent character (never the one that is sounding). */
  private removeLastUnsentChar(): void {
    const buffer = this.encoder.buffer();
    const minimum = this.encoder.isSending() && !this.encoder.replayMode()
      ? this.encoder.sentIndex() + 1 : this.encoder.sentIndex();
    if (buffer.length > minimum) this.encoder.setBuffer(buffer.slice(0, -1));
  }

  onEncoderInput(textarea: HTMLTextAreaElement): void {
    if (this.settings.settings().encoderMode === 'live') {
      textarea.value = textarea.value.toUpperCase();
      this.encoderInputHasText = textarea.value.trim().length > 0;
      const destinations = this.getExternalEncoderDestinations();
      if (textarea.value.trim() && destinations.length
          && !this.sameDestinations(destinations, this.confirmedDestinations)) {
        this.openExternalConfirmation('live-send', destinations);
        return;
      }
      this.sendLiveText(textarea);
      return;
    }
    let pos = textarea.selectionStart;
    let value = textarea.value.toUpperCase();
    if (this.settings.settings().encoderMode === 'practice') {
      // Only the first of several spaces typed in a row counts
      const single = (text: string) => text.replace(/[ \t]{2,}/g, ' ');
      pos = single(value.slice(0, pos)).length;
      value = single(value);
    } else {
      // Spaces are ignored at the start and repeated spaces collapse to one as you type
      // (a trailing space is allowed while typing and trimmed when sending)
      const clean = (text: string) => text.replace(/^\s+/, '').replace(/[ \t]{2,}/g, ' ');
      pos = clean(value.slice(0, pos)).length;
      value = clean(value);
    }
    textarea.value = value;
    textarea.selectionStart = textarea.selectionEnd = pos;
    this.encoderInputHasText = textarea.value.trim().length > 0;
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.userInput.set(textarea.value);
    }
  }

  /** Dismiss the guide without changing Morse settings or buffers. */
  dismissTryMorseGuide(): void {
    this.showTryMorseGuide = false;
    try { localStorage.setItem('mcsTryMorseGuideDismissed', '1'); } catch { }
  }

  /** Reopen the guide and remember that it is wanted on the next visit. */
  reopenTryMorseGuide(): void {
    this.showTryMorseGuide = true;
    try { localStorage.removeItem('mcsTryMorseGuideDismissed'); } catch { }
  }

  /** Load a supported sample into the text field without invoking live input. */
  loadTryMorseExample(): void {
    if (this.encoder.isSending()) return;
    const textarea = this.encoderInputRef?.nativeElement;
    if (!textarea) return;
    if (textarea.value.length > 0) {
      this.tryMorseConfirmAction = 'replace';
      this.tryMorseConfirmTitle = 'Replace encoder text?';
      this.tryMorseConfirmMessage = 'Replace the text in the encoder with CQ TEST?';
      this.tryMorseConfirmLabel = 'Replace text';
      return;
    }
    this.selectExampleEncoderMode();
    this.fillTryMorseExample(textarea);
  }

  /** True when there is text to transmit: typed in the textarea or waiting (also paused) in the encoder buffer. */
  get canStartTx(): boolean {
    return !this.encoder.isSending() && (this.encoder.replayPending()
      || this.encoderInputHasText || this.encoder.buffer().length > this.encoder.sentIndex());
  }

  /** Gate encoder starts when configured destinations can transmit externally. */
  requestEncoderTx(textarea: HTMLTextAreaElement): void {
    if (this.encoder.isSending()) {
      this.toggleEncoderTx(textarea);
      return;
    }
    if (!textarea.value.trim() && !this.encoder.replayPending()
        && this.encoder.buffer().length <= this.encoder.sentIndex()) return;
    const destinations = this.getExternalEncoderDestinations();
    if (destinations.length && !this.sameDestinations(destinations, this.confirmedDestinations)) {
      this.openExternalConfirmation('external-send', destinations);
      return;
    }
    this.toggleEncoderTx(textarea);
  }

  /** Handle the example replacement and external-send confirmation dialog. */
  onTryMorseConfirmation(confirmed: boolean): void {
    const action = this.tryMorseConfirmAction;
    this.tryMorseConfirmAction = null;
    if (!confirmed || !action) return;

    if (action === 'replace') {
      const textarea = this.encoderInputRef?.nativeElement;
      if (textarea && !this.encoder.isSending()) {
        this.selectExampleEncoderMode();
        this.fillTryMorseExample(textarea);
      }
      return;
    }

    const destinations = this.getExternalEncoderDestinations();
    if (destinations.length && !this.sameDestinations(destinations, this.pendingExternalDestinations)) {
      this.openExternalConfirmation(action, destinations);
      return;
    }
    this.confirmedDestinations = destinations;
    if (action === 'replay') {
      this.encoder.startReplay(this.pendingReplayText);
      return;
    }
    if (action === 'live-send') {
      const textarea = this.encoderInputRef?.nativeElement;
      if (textarea) this.sendLiveText(textarea);
    } else if (this.encoderInputRef) {
      this.toggleEncoderTx(this.encoderInputRef.nativeElement);
    }
  }

  private fillTryMorseExample(textarea: HTMLTextAreaElement): void {
    textarea.value = 'CQ TEST';
    this.encoderInputHasText = true;
    this.tryExamplePending = true;
  }

  private selectExampleEncoderMode(): void {
    if (this.settings.settings().encoderMode === 'practice') this.practice.reset();
    this.settings.update({ encoderMode: 'enter' });
  }

  private openExternalConfirmation(action: 'external-send' | 'live-send' | 'replay', destinations: string[]): void {
    this.tryMorseConfirmAction = action;
    this.pendingExternalDestinations = [...destinations];
    this.tryMorseConfirmTitle = action === 'live-send' ? 'Allow live sending?' : 'Confirm external send';
    this.tryMorseConfirmLabel = action === 'live-send' ? 'Allow live sending' : 'Send to these outputs';
    this.tryMorseConfirmMessage = action === 'live-send'
      ? `Live mode sends as you type. Confirm to allow sending through:\n${destinations.map(name => `- ${name}`).join('\n')}`
      : `This send can key or relay through:\n${destinations.map(name => `- ${name}`).join('\n')}\n\nContinue only if you intend to use these destinations.`;
  }

  private getExternalEncoderDestinations(): string[] {
    const s = this.settings.settings();
    const source = s.encoderSource;
    const matchesSource = (forward: string) => forward === 'both' || forward === source;
    const destinations: string[] = [];

    if (s.serialEnabled) {
      s.serialOutputMappings.forEach((mapping, index) => {
        if (mapping.enabled && mapping.portIndex >= 0 && matchesSource(mapping.forward)) {
          const port = this.serialOutput.ports()[mapping.portIndex];
          const portName = port ? this.serialOutput.portLabel(port) : `Serial port ${mapping.portIndex + 1}`;
          destinations.push(`${portName} ${mapping.pin.toUpperCase()} keying (mapping ${index + 1})`);
        }
      });
    }
    if (s.midiOutputEnabled) {
      s.midiOutputMappings.forEach((mapping, index) => {
        if (mapping.enabled && matchesSource(mapping.forward)) {
          const device = this.midiOutput.midiOutputs().find(output => output.id === mapping.deviceId)?.name
            || mapping.deviceId
            || this.midiOutput.midiOutputs()[0]?.name
            || 'connected MIDI output';
          destinations.push(`MIDI ${device}, channel ${mapping.channel} (mapping ${index + 1})`);
        }
      });
    }
    if (s.winkeyerEnabled && s.winkeyerPortIndex >= 0 && matchesSource(s.winkeyerForward)) {
      const port = this.winkeyerOutput.ports()[s.winkeyerPortIndex];
      const portName = port ? this.winkeyerOutput.portLabel(port) : `serial port ${s.winkeyerPortIndex + 1}`;
      destinations.push(`WinKeyer on ${portName}`);
    }
    if (s.rtdbOutputEnabled && matchesSource(s.rtdbOutputForward)) {
      destinations.push(`Firebase relay channel ${s.rtdbOutputChannelName || '(unnamed)'}`);
    }
    return destinations;
  }

  private sameDestinations(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((destination, index) => destination === second[index]);
  }

  toggleEncoderTx(textarea: HTMLTextAreaElement): void {
    if (this.encoder.isSending()) {
      // A replay pauses at the end of its character; typed text stops at once
      if (this.encoder.replayMode()) this.encoder.pauseTx();
      else this.encoder.stopTx();
    } else if (this.encoder.replayPending()) {
      this.encoder.startTx();
    } else {
      if (this.settings.settings().encoderMode === 'live' && textarea.value.trim()) {
        this.sendLiveText(textarea);
        return;
      }
      // A paused send continues; text typed meanwhile is queued behind it
      if (this.settings.settings().encoderMode === 'enter' && this.encoder.buffer().length > this.encoder.sentIndex()) {
        this.appendEncoderText(textarea);
        this.encoder.startTx();
        return;
      }
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


  // ---- Practice mode ----

  /** Start practice or advance to next sequence */
  practiceStartOrNext(textarea: HTMLTextAreaElement): void {
    if (this.practice.feedbackMode() === 'typealong') {
      this.practice.advanceTypeAlongSession();
      this.focusPracticeInput();
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
    this.focusPracticeInput();
  }

  // ---- Send practice mode ----

  /** Send practice shows its prompt and keyed text; keying works as usual. */
  /** The CW scope shows above the text while the CW decoder is on or a file is decoded (not in practice modes) */
  get cwScopeShown(): boolean {
    const s = this.settings.settings();
    return (cwDecoderOn(s) || this.cwInput.fileActive()) && s.encoderMode !== 'practice' && s.encoderMode !== 'send-practice';
  }

  /** The CW tone decoder is listening (chosen in the Mode list) */
  get cwOn(): boolean {
    return cwDecoderOn(this.settings.settings());
  }

  /** What the Mode list shows: the decoder while it listens (the typing mode stays underneath), else the mode */
  get modeSelectValue(): string {
    return this.cwOn ? 'cw' : this.settings.settings().encoderMode;
  }

  /**
   * The Mode list. Choosing the decoder starts it (after its questions; a declined question puts the list back);
   * choosing anything else stops it, and the typing mode underneath (Send on Enter or Live) is what remains.
   */
  async onModeChange(event: Event): Promise<void> {
    const el = event.target as HTMLSelectElement;
    const value = el.value;
    if (value === 'cw') {
      const ok = await this.cwControl.activate(this.audioRunning);
      if (!ok) el.value = this.modeSelectValue;
      return;
    }
    if (this.cwOn) {
      // Entering a practice mode asks its own sidetone question (see the practice effect); the screen question is asked here
      await this.cwControl.deactivate(this.audioRunning, value !== 'practice' && value !== 'send-practice');
    }
    // The value chosen, not the select's: it was reset to the old mode while the decoder stopped
    this.applySetting('encoderMode', value);
  }

  /** The Send on Enter / Live toggle sits in the input box (only those two modes have one). */
  get typingModeShown(): boolean {
    const mode = this.settings.settings().encoderMode;
    return mode === 'enter' || mode === 'live';
  }

  get typingModeLabel(): string {
    return this.settings.settings().encoderMode === 'live'
      ? 'Live: each letter is sent as you type. Switch to Send on Enter'
      : 'Send on Enter. Switch to Live';
  }

  /** Switch between Send on Enter and Live (saved at once, like the Mode select) and keep typing in the box. */
  toggleTypingMode(): void {
    this.settings.updateAndPersist({ encoderMode: this.settings.settings().encoderMode === 'live' ? 'enter' : 'live' });
    this.encoderInputRef?.nativeElement.focus({ preventScroll: true });
  }

  /** Open the Book dialog; a Copy practice that is playing is paused first. */
  openBook(): void {
    if (this.practice.state() === 'playing') this.practice.pause();
    this.showBook = true;
  }

  /** Fetch the book's web address again and go on at the same place; Copy practice is paused first. */
  reloadBook(): void {
    if (this.practice.state() === 'playing') this.practice.pause();
    void this.ebook.reload();
  }

  /** An e-book is the content of the practice mode that is on: its reader takes the output area and the typing box's place. */
  get ebookActive(): boolean {
    return this.ebook.active();
  }

  get sendPracticeActive(): boolean {
    return this.settings.settings().encoderMode === 'send-practice';
  }

  /** Start, check or advance Send practice (the single practice button). */
  sendPracticeAdvance(): void {
    this.sendPractice.advance();
  }

  /** "Hear it first": play the prompt on this device, or stop it. */
  sendPracticePromptAudio(): void {
    if (this.sendPractice.promptPlaying()) this.sendPractice.stopPrompt();
    else this.sendPractice.playPrompt();
  }

  /** Resume practice playback */
  practiceResume(): void {
    this.practice.resume();
    this.focusPracticeInput();
  }

  /** The first shell waits for the end of the text colour change */
  readonly fireworksLaunchDelayMs = MAIN_LAUNCH_DELAY_MS;

  /** The Koch course has just been completed on screen: the output area shows the fireworks at night */
  get celebrating(): boolean {
    const mode = this.settings.settings().encoderMode;
    return (this.practice.kochFinished() && mode === 'practice')
      || (this.sendPractice.kochFinished() && mode === 'send-practice');
  }

  // ---- Text blur ----

  /**
   * Dots and dashes of the typed or received character being played, shown with its tones like keyed symbols.
   * Practice modes keep them hidden, and so does a blurred direction (they would give the text away).
   */
  get mainPlayingPatterns(): PlayingPattern[] {
    const mode = this.settings.settings().encoderMode;
    if (mode === 'practice' || mode === 'send-practice') return [];
    const blur = this.mainBlurMode;
    return [this.encoder.typedPattern(), this.encoder.receivedPattern()]
      .filter((p): p is PlayingPattern => !!p && !!p.pattern
        && (this.mainRevealing || !blur || (blur !== 'both' && blur !== p.source)));
  }

  /**
   * Active blur mode for the main screen.
   * Returns null when blur is disabled, otherwise the appliesTo value.
   */
  get mainBlurMode(): 'rx' | 'tx' | 'both' | null {
    const s = this.settings.settings();
    // A book is read as it is: the text blur setting does not apply; only the practice's own Blurred and Type-along blur it
    if (this.ebook.active() && (s.encoderMode !== 'practice' || this.practice.feedbackMode() === 'listen')) return null;
    if (s.encoderMode === 'send-practice') return null;
    // Practice mode blur/typealong: blur the practice source direction
    if (s.encoderMode === 'practice' && (this.practice.feedbackMode() === 'blur' || this.practice.feedbackMode() === 'typealong')) {
      // Once the score is on show (a finished round, or a book scored so far) unblur to show the highlights
      if (this.practice.feedback().length > 0) {
        return null;
      }
      return s.practiceSource;
    }
    return s.textBlurEnabled ? s.textBlurAppliesTo : null;
  }

    /** Text of a main-screen line, with prosign names in place of their punctuation when Show prosign names is on. */
  mainLineText(text: string): string {
    const s = this.settings.settings();
    // Copy practice shows the text as played (`=` stays `=`), as the full screen does
    return s.showProsigns && s.encoderMode !== 'practice' ? toProsignDisplay(text) : text;
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

  /** The lesson help button is offered in Koch practice. */
  get kochHelpShown(): boolean {
    return this.kochHelp.kind() !== null;
  }

  /** The help cannot start while a round plays or something else is being sent or replayed. */
  get kochHelpDisabled(): boolean {
    if (this.kochHelp.playing()) return false;
    if (this.kochHelp.mode() === 'countdown' || this.encoder.isSending() || this.encoder.replayPending()) return true;
    return this.kochHelp.kind() === 'copy' && this.practice.state() === 'playing';
  }

  /**
   * The replay button is offered in Send on Enter and Live (above Save, like above Reveal while the text is blurred),
   * with blurred text and practice (Send practice's Hear it first).
   */
  get mainReplayShown(): boolean {
    const mode = this.settings.settings().encoderMode;
    return !!this.mainBlurMode || this.sendPracticeActive || mode === 'enter' || mode === 'live';
  }

  /** Whether the replay button can be pressed (while a replay waits it becomes the stop button). */
  get mainReplayAvailable(): boolean {
    // The lesson help is a replay too, but the help button owns it
    if (this.kochHelp.playing()) return false;
    if (this.encoder.replayPending()) return true;
    if (this.mainReplayBlocked) return false;
    if (this.sendPracticeActive) return this.sendPractice.canPlayPrompt();
    if (this.settings.settings().encoderMode === 'practice') {
      return this.practice.replayableText() !== '';
    }
    if (!this.displayBuffers.mainOutput.hasText()) return false;
    return !this.encoder.isSending()
      && (!this.encoderInputHasText || this.encoder.buffer().length > this.encoder.sentIndex())
      && this.displayBuffers.mainOutput.lastLine() !== null;
  }

  /** True while a replay is playing or paused; the button then stops it. */
  get mainReplayStops(): boolean {
    return this.encoder.replayPending() && !this.kochHelp.playing();
  }

  /** Copy practice has no input box on the main screen: the answer is typed straight into the text (see `focusPracticeInput`). */
  get copyPractice(): boolean {
    return this.settings.settings().encoderMode === 'practice';
  }

  /**
   * Send the typing to the hidden box that catches it in Type-along, so the answer can be typed without a visible
   * input: after a click on the text or a practice button, and for the first letter typed anywhere on the page.
   */
  focusPracticeInput(): void {
    if (!this.copyPractice || this.practice.feedbackMode() !== 'typealong') return;
    const box = this.encoderInputRef?.nativeElement;
    if (box && document.activeElement !== box) box.focus({ preventScroll: true });
  }

  /** Type-along practice shows the challenge with what was typed under each character (a book has its own reader). */
  get practiceCompare(): boolean {
    return this.settings.settings().encoderMode === 'practice' && this.practice.feedbackMode() === 'typealong' && !this.ebookActive;
  }

  /** Practice notes the user hid (by their text), until the mode changes. */
  private readonly dismissedGuides = new Set<string>();

  /** What the Send practice note says; a hidden note shows again when this changes (for example a new warning). */
  get sendPracticeGuideKey(): string {
    const s = this.settings.settings();
    return ['send', sendPracticeUi.sendPracticeHeading(s, 'Send practice'), sendPracticeUi.sendPracticeSessionDescription(s),
      this.sendPractice.inputsReady(), sendPracticeUi.sendPracticeExternalRouteNotice(s)].join('|');
  }

  /** What the Copy practice note says; see `sendPracticeGuideKey`. */
  get copyPracticeGuideKey(): string {
    const s = this.settings.settings();
    return ['copy', practiceUi.practiceHeading(s, 'Practice'), practiceUi.practiceHint(s),
      practiceUi.practiceExternalRouteNotice(s)].join('|');
  }

  guideDismissed(key: string): boolean {
    return this.dismissedGuides.has(key);
  }

  dismissGuide(key: string): void {
    this.dismissedGuides.add(key);
  }

  /** True while the "Replay last:" question of the replay button is open. */
  replayMenuOpen = false;

  /** The replay button asks what to replay, except in Send practice (it plays one character) and while it stops a replay. */
  get mainReplayAsks(): boolean {
    return !this.sendPracticeActive && !this.mainReplayStops;
  }

  /** Why the replay button cannot be used right now, or null: an audio file is being decoded, or nothing would play the replay. */
  get mainReplayBlocked(): string | null {
    if (this.audioFile.playing()) return 'Pause the audio file to replay';
    if (!replayHasOutput(this.settings.settings(), this.sendPracticeActive)) {
      return this.sendPracticeActive
        ? 'Turn on the sidetone or another output to hear it'
        : 'Turn on the sidetone or another output to replay';
    }
    return null;
  }

  /** Name and tooltip of the replay button. */
  get mainReplayLabel(): string {
    if (!this.mainReplayStops && !this.mainReplayAvailable && this.mainReplayBlocked) return this.mainReplayBlocked;
    if (this.sendPracticeActive) return this.mainReplayStops ? 'Stop the sound' : 'Hear the next character';
    return this.mainReplayStops ? 'Stop replay' : 'Replay the last character, ' + this.mainReplayWordLabel.toLowerCase() + ' or line';
  }

  /** The choices the replay question offers for the text on screen (or the played part of the practice sequence). */
  get mainReplayChoices(): ReplayUnit[] {
    if (this.settings.settings().encoderMode === 'practice') {
      return replayChoices(this.practice.replayableText(), this.practice.pausedMidWord());
    }
    return replayChoices(this.displayBuffers.mainOutput.lastLine()?.text ?? '');
  }

  /** The name of a word or group in the tooltip: Word, or Group / Callsign where the practice content has no words. */
  get mainReplayWordLabel(): string {
    return replayWordLabel(this.settings.settings());
  }

  /** Whether the practice sequence is paused in the middle of a word, group or callsign. */
  get mainReplayMidWord(): boolean {
    return this.settings.settings().encoderMode === 'practice' && this.practice.pausedMidWord();
  }

  /** The text of one choice of the replay question. */
  mainReplayChoiceLabel(unit: ReplayUnit): string {
    return replayChoiceLabel(unit, this.settings.settings(), this.mainReplayMidWord);
  }

  /**
   * The replay button. In Send practice it plays the next character. While a replay plays or is
   * paused it stops it. Otherwise it asks "Replay last:" character, word (group, callsign) or
   * line; the answer replays that end of the completed practice sequence, or of the last
   * line, which goes through the encoder's outputs after the usual confirmation when it would
   * key or relay externally. The send button (practice button in practice) pauses and resumes it.
   */
  onMainReplay(): void {
    if (this.sendPracticeActive) {
      this.sendPracticePromptAudio();
      return;
    }
    if (this.encoder.replayPending()) {
      this.replayMenuOpen = false;
      if (this.settings.settings().encoderMode === 'practice') this.practice.stopReplay();
      else this.encoder.stopReplay();
      this.focusPracticeInput();
      return;
    }
    const choices = this.mainReplayChoices;
    if (choices.length === 1) {
      this.onMainReplayChoice(choices[0]);
      return;
    }
    this.replayMenuOpen = !this.replayMenuOpen;
    if (this.replayMenuOpen) {
      this.controlsKebabOpen = false;
      this.clearMenuOpen = false;
      setTimeout(() => document.querySelector<HTMLElement>('.replay-menu-main .pill-btn')?.focus());
    } else {
      this.focusPracticeInput();
    }
  }

  /** Replay the chosen end of the completed sequence (practice) or of the last line. */
  onMainReplayChoice(unit: ReplayUnit): void {
    this.replayMenuOpen = false;
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.replay(unit);
      this.focusPracticeInput();
      return;
    }
    const part = this.displayBuffers.mainOutput.lastPart(unit);
    if (part) this.requestReplay(part);
  }

  /** Close the question without replaying (Escape) and give focus back to the replay button. */
  closeReplayMenu(event?: Event): void {
    event?.preventDefault();
    this.replayMenuOpen = false;
    document.querySelector<HTMLElement>('.blur-replay-btn-main')?.focus();
  }

  /** Send a line again through the encoder, after the usual confirmation when it would key or relay externally. Also used by the full-screen view. */
  requestReplay(text: string): void {
    const destinations = this.getExternalEncoderDestinations();
    if (destinations.length && !this.sameDestinations(destinations, this.confirmedDestinations)) {
      this.pendingReplayText = text;
      this.openExternalConfirmation('replay', destinations);
      return;
    }
    this.encoder.startReplay(text);
  }

  toggleControlsKebab(): void {
    this.controlsKebabOpen = !this.controlsKebabOpen;
    this.clearMenuOpen = false;
    this.replayMenuOpen = false;
    if (this.controlsKebabOpen) this.updateKebabMaxHeight();
  }

  /** Let the open kebab menu use the whole height below its button; it scrolls only when the content is taller */
  private updateKebabMaxHeight(): void {
    const trigger = document.querySelector<HTMLElement>('.kebab-wrapper > .kebab-btn');
    if (!trigger) return;
    const viewportHeight = this.viewport.menuHeight();
    // 8px gap under the button plus 8px of breathing room at the bottom
    this.controlsKebabMaxHeight = Math.max(120, Math.floor(viewportHeight - trigger.getBoundingClientRect().bottom - 16));
  }

  toggleClearMenu(): void {
    this.clearMenuOpen = !this.clearMenuOpen;
    this.controlsKebabOpen = false;
  }

  closeClearMenu(): void {
    this.clearMenuOpen = false;
  }

  /**
   * Determine the name prefix for a display buffer entry.
   *
   * - If the entry already has a name (remote sender or MIDI mapping), use it.
   * - If RTDB output is enabled and the type matches forward mode,
   *   use our own callsign so the local display mirrors the remote view.
   */
  private getDisplayName(type: 'rx' | 'tx', entryName?: string): string | undefined {
    return this.displayBuffers.displayNameFor(type, entryName);
  }

  // ---- Settings handlers ----

  /** Open settings modal, optionally on the card of a Setup Wizard goal */
  openSettings(landing: string | null = null): void {
    this.menuFocusFallback = this.findMenuTriggerFallback('.kebab-items, .fs-kebab-items', '.kebab-btn');
    this.settingsStartLanding = landing;
    this.showSettings = true;
    this.pushModalState('settings');
  }

  /** Open the Setup Wizard goal list */
  openGoals(): void {
    this.menuFocusFallback = this.findMenuTriggerFallback('.kebab-items, .fs-kebab-items', '.kebab-btn');
    this.showGoals = true;
    this.pushModalState('goals');
  }

  /** Close the goal list */
  closeGoals(): void {
    this.showGoals = false;
    this.popModalState();
    const fallback = this.menuFocusFallback;
    window.setTimeout(() => {
      if (fallback?.isConnected && !this.showSettings && !this.showWizard) fallback.focus();
    });
  }

  /** Swap the goal list for Settings (or a goal's card), keeping one history entry */
  goalsToSettings(landing: string | null = null): void {
    this.showGoals = false;
    this.settingsStartLanding = landing;
    this.showSettings = true;
  }

  /** Open Presets on top of the goal list, or straight from a kebab menu */
  openGoalPresets(): void {
    if (!this.showGoals) {
      this.menuFocusFallback = this.findMenuTriggerFallback('.kebab-items, .fs-kebab-items', '.kebab-btn');
    }
    this.showGoalPresets = true;
    this.pushModalState('presets');
  }

  /** Close Presets and return to the goal list; `viaUi` pops the history entry */
  dismissGoalPresets(viaUi = true): void {
    this.showGoalPresets = false;
    if (viaUi) this.popModalState();
    const fallback = this.menuFocusFallback;
    window.setTimeout(() => {
      const goalsButton = document.querySelector<HTMLElement>('app-goal-navigator-modal .settings-action-btn[aria-label="Presets"]');
      if (goalsButton) goalsButton.focus();
      else if (fallback?.isConnected && !this.showSettings && !this.showWizard) fallback.focus();
    });
  }

  /** Open the guided setup for a goal, on top of the goal list */
  openWizard(goal: WizardGoalId): void {
    this.wizardGoal = goal;
    this.showWizard = true;
    this.pushModalState('wizard');
  }

  /** Close the guided setup, leaving the goal list as it was */
  closeWizard(): void {
    this.showWizard = false;
    this.popModalState();
  }

  /** Start the detector right away when audio is already running, as the Settings toggle does */
  async onWizardDetectorEnabled(): Promise<void> {
    if (this.audioRunning) await this.cwInput.start();
  }

  /** Leave the guided setup and the goal list/Settings together, back to the main screen, keeping the applied settings unsaved */
  onWizardTry(goal: string): void {
    const steps = Math.min(this.modalHistoryDepth, (this.showWizard ? 1 : 0) + (this.showSettings || this.showGoals ? 1 : 0));
    this.showWizard = false;
    this.showSettings = false;
    this.showGoals = false;
    this.defaultsResetInSettings = false;
    this.defaultsResetSaved = false;
    if (steps > 0) {
      this.modalHistoryDepth -= steps;
      this.runHistoryOp(() => {
        this.expectPopState();
        history.go(-steps);
      });
    }
    window.requestAnimationFrame(() => {
      if (this.activeModal || this.fullscreenAfterWizard) return;
      if (goal === 'decode') {
        this.audioToggleButtonRef?.nativeElement.focus();
      } else if (goal === 'practice' && this.practice.feedbackMode() !== 'typealong') {
        this.practiceActionButtonRef?.nativeElement.focus();
      } else {
        this.encoderInputRef?.nativeElement.focus();
      }
    });
  }

  /**
   * The guide's last step chose the full screen (or Lens): open it once the wizard has left.
   * When the browser history is still being rewound, wait for that to finish first.
   */
  onWizardFullscreen(): void {
    if (this.activeModal) return;
    if (this.ignoringPopState) this.fullscreenAfterWizard = true;
    else this.openModal();
  }

  /**
   * The learner chose Resume for a book loaded from a practice card: close Settings, which shows the screen
   * it was opened from (the main screen or the full screen), and switch to that card's practice with the book.
   * Nothing is played; Start does that.
   */
  private readBookNow(kind: 'copy' | 'send'): void {
    const mode = kind === 'copy' ? 'practice' : 'send-practice';
    if (this.settings.settings().encoderMode === 'practice' && mode !== 'practice') this.practice.reset();
    this.settings.update(kind === 'copy'
      ? { encoderMode: mode, practiceEnabled: true, practiceContentMode: 'ebook' }
      : { encoderMode: mode, sendPracticeEnabled: true, sendPracticeContentMode: 'ebook' });
    // The Resume question has just taken its own history entry off with a Back that is still on its way.
    // Closing Settings now would send a second Back, and the one popstate flag lets only one of them pass:
    // the other would close the full screen. So wait until the first has been handled.
    const close = (tries: number): void => {
      if (this.ignoringPopState && tries < 50) {
        window.setTimeout(() => close(tries + 1), 20);
        return;
      }
      this.closeSettings();
    };
    close(0);
  }

  /** Close settings modal — also clear reconnect banner if user re-enabled MIDI */
  closeSettings(): void {
    if (this.defaultsResetInSettings && this.defaultsResetSaved && !this.settings.isDirty()) {
      this.reopenTryMorseGuide();
    }
    this.defaultsResetInSettings = false;
    this.defaultsResetSaved = false;
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
    this.midiReconnectError = '';
  }

  /**
   * Open Help from F1, on top of whatever is open (the main screen, full screen, Settings…).
   * A key that is mapped to F1 for keying keeps that job, so F1 never pops Help up mid-transmission.
   */
  private onHelpShortcut(event: KeyboardEvent): void {
    const s = this.settings.settings();
    const usedForKeying = s.keyboardKeyerEnabled && s.keyboardInputMappings.some(m =>
      m.enabled && (m.keyCode === 'F1' || (m.mode === 'paddle' && m.dahKeyCode === 'F1')));
    if (usedForKeying || event.defaultPrevented) return;
    event.preventDefault();
    if (!event.repeat && !this.showHelp) this.openHelp();
  }

  /** Open help modal */
  openHelp(initialSection: string | null = null): void {
    this.helpFocusFallback = this.findMenuTriggerFallback('.kebab-items, .fs-kebab-items', '.kebab-btn')
      ?? document.querySelector<HTMLElement>('.kebab-btn');
    this.helpInitialSection = initialSection;
    this.showHelp = true;
    this.pushModalState('help');
  }

  /** Open Help on top of the current dialogs so closing it returns to them. */
  private showHelpOnTop(sectionId: string): void {
    if (this.showHelp) {
      this.helpInitialSection = sectionId;
      return;
    }
    this.openHelp(sectionId);
  }

  /** Close Settings and open the requested Help section. */
  onSettingsHelpRequested(sectionId: string): void {
    this.closeSettings();
    this.openHelp(sectionId);
  }

  /** Close help modal */
  closeHelp(): void {
    this.showHelp = false;
    this.popModalState();
  }

  /** Open symbols reference modal */
  openSymbolsRef(): void {
    this.symbolsRefFocusFallback = this.findMenuTriggerFallback('.kebab-items, .fs-kebab-items', '.kebab-btn')
      ?? document.querySelector<HTMLElement>('.kebab-btn');
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
    this.applySetting(key, value);
  }

  private applySetting(key: keyof AppSettings, value: string | number): void {
    // When switching away from practice mode, reset practice state
    if (key === 'encoderMode' && this.settings.settings().encoderMode === 'practice' && value !== 'practice') {
      this.practice.reset();
      // What was typed as an answer must not turn up in the Send on Enter box
      if (this.encoderInputRef) this.encoderInputRef.nativeElement.value = '';
      this.encoderInputHasText = false;
    }
    const patch = { [key]: value } as Partial<AppSettings>;
    // The Mode select on the main screen is saved at once, without a visit to Settings
    if (key === 'encoderMode') {
      this.settings.updateAndPersist(patch);
      // Letters typed while the Mode select still has the focus would change the mode: the answer takes the typing
      if (value === 'practice') window.requestAnimationFrame(() => this.focusPracticeInput());
    } else {
      this.settings.update(patch);
    }
  }

  // ---- Device config / profiles ----

  async refreshDeviceConfig(): Promise<void> {
    try {
      await this.devices.enumerate();
    } finally {
      // Without a fingerprint no profile can load; the defaults are then the final answer
      if (!this.devices.computeFingerprint()) this.settings.profileLoaded.set(true);
    }
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
      await this.checkMidiReconnect();
      if (!found) {
        this.openSettings(); // auto-open settings for validation
      }
    }
  }

  /**
   * After a page refresh the profile says MIDI was on, but nothing has started it.
   * If the browser has already granted MIDI access, start it silently. Otherwise
   * (or if starting fails) switch the flags off and show the notice with a
   * one-click re-enable button, so a permission prompt always follows a user click.
   *
   * Called after loadForFingerprint() loads the device profile — this is
   * the only time we have the real saved settings (settings start at
   * defaults until the profile is loaded asynchronously).
   */
  private async checkMidiReconnect(): Promise<void> {
    const wantInput = this.settings.settings().midiInputEnabled;
    const wantOutput = this.settings.settings().midiOutputEnabled;
    if (!wantInput && !wantOutput) return;

    const granted = await this.midiPermissionGranted();
    if (granted) {
      if (wantInput) await this.midiInput.start();
      if (wantOutput) await this.midiOutput.start();
    }
    if (wantInput && (!granted || this.midiInput.lastError())) {
      this.midiInputNeedsReconnect = true;
      this.settings.update({ midiInputEnabled: false });
    }
    if (wantOutput && (!granted || this.midiOutput.lastError())) {
      this.midiOutputNeedsReconnect = true;
      this.settings.update({ midiOutputEnabled: false });
    }
  }

  /** True when the browser already allows MIDI access for this site, so starting it shows no prompt */
  private async midiPermissionGranted(): Promise<boolean> {
    try {
      const status = await navigator.permissions.query({ name: 'midi' as PermissionName });
      return status.state === 'granted';
    } catch {
      return false;
    }
  }

  /** The notice's button: switch MIDI back on and start it, as the MIDI cards do */
  async reenableMidi(): Promise<void> {
    this.midiReconnectError = '';
    if (this.midiInputNeedsReconnect) {
      this.settings.update({ midiInputEnabled: true });
      await this.midiInput.start();
      if (this.midiInput.lastError()) {
        this.midiReconnectError = this.midiInput.lastError();
        this.settings.update({ midiInputEnabled: false });
      } else {
        this.midiInputNeedsReconnect = false;
      }
    }
    if (this.midiOutputNeedsReconnect) {
      this.settings.update({ midiOutputEnabled: true });
      await this.midiOutput.start();
      if (this.midiOutput.lastError()) {
        this.midiReconnectError = this.midiOutput.lastError();
        this.settings.update({ midiOutputEnabled: false });
      } else {
        this.midiOutputNeedsReconnect = false;
      }
    }
    this.settings.clearDirtyIfSaved(this.devices.inputDevices(), this.devices.outputDevices());
  }

  saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }

  onSettingsDefaultsReset(savedDataDeleted = false): void {
    this.defaultsResetInSettings = true;
    this.defaultsResetSaved = false;
    if (savedDataDeleted) {
      // The other small flags kept in this browser: the dismissed Try Morse hint and the audio autostart
      try { localStorage.removeItem('mcsTryMorseGuideDismissed'); } catch { }
      this.clearRememberedAudioRunning();
    }
  }

  onSettingsSaved(): void {
    if (this.defaultsResetInSettings) this.defaultsResetSaved = true;
  }

  // ---- Main screen touch keyer (straight key or paddle sprite) ----

  /** Drop focus from the main text box so keying from a non-keyboard input does not raise the on-screen keyboard. */
  private releaseTextFocus(): void {
    const textarea = this.encoderInputRef?.nativeElement;
    if (textarea && document.activeElement === textarea) textarea.blur();
  }

  /** True while the main screen touch keyer is shown as two paddles instead of a straight key */
  get spritePaddle(): boolean {
    return this.settings.settings().spriteKeyerMode === 'paddle';
  }

  /**
   * Switch the main screen touch keyer between the straight key and the paddles and save the choice at once
   * (the Settings Save is not needed). Anything the sprite holds down is let go first.
   */
  toggleSpriteMode(): void {
    if (this.spriteKeyDown) {
      const s = this.settings.settings();
      this.spriteKeyDown = false;
      this.spriteMouseActive = false;
      this.keyer.straightKeyInput(false, s.spriteSource, false, 'touchStraightKey');
    }
    (['left', 'right'] as const).forEach(side => this.setSpritePaddle(side, false));
    this.spriteMouseSides.clear();
    this.settings.updateAndPersist({ spriteKeyerMode: this.spritePaddle ? 'straight' : 'paddle' });
  }

  /** Visual pressed state for the straight-key sprite */
  spriteKeyDown = false;
  /** Guard to prevent duplicate mouse events when touch already active */
  private spriteMouseActive = false;

  /** Handle touch events on the sprite key button */
  onSpriteTouch(down: boolean, event: TouchEvent): void {
    event.preventDefault();
    if (down) this.releaseTextFocus();
    this.spriteKeyDown = down;
    const s = this.settings.settings();
    this.keyer.straightKeyInput(down, s.spriteSource, false, 'touchStraightKey',
      { name: s.spriteName || undefined, color: s.spriteColor || undefined });
  }

  /** Handle mouse events on the sprite key button (desktop fallback) */
  onSpriteMouse(down: boolean, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (down) this.releaseTextFocus();
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

  // ---- Paddle sprite ----

  /** The paddle element a side of the sprite makes: dot on the left, dash on the right (swapped by Reverse Paddles) */
  spritePaddleElement(side: 'left' | 'right'): 'dit' | 'dah' {
    const dotOnLeft = !this.settings.settings().spriteReversePaddles;
    return (side === 'left') === dotOnLeft ? 'dit' : 'dah';
  }

  /** Sides touched right now, with the element each one is keying (kept so the release matches the press) */
  /** The sprite paddle each encoder element is shown on while it is down */
  private encoderPaddleSides = new Map<'dit' | 'dah', 'dit' | 'dah'>();

  private spriteTouched = new Map<'left' | 'right', 'dit' | 'dah'>();
  /** Sides pressed by the mouse, so a repeated mouse event is ignored */
  private spriteMouseSides = new Set<'left' | 'right'>();
  /** Paddles held by other inputs (keyboard, mouse, MIDI, serial, encoder), per element and input */
  private spriteHolds: Record<'dit' | 'dah', Set<string>> = { dit: new Set(), dah: new Set() };

  /**
   * Whether one side of the sprite is drawn pressed: touched, or held by another input. Other inputs always
   * move the left paddle for a dot and the right paddle for a dash: Reverse Paddles only changes what a touch
   * on a side sends, never how the picture animates.
   */
  spritePaddleDown(side: 'left' | 'right'): boolean {
    return this.spriteTouched.has(side) || this.spriteHolds[side === 'left' ? 'dit' : 'dah'].size > 0;
  }

  /** Which of the four sprite frames to show */
  get spritePaddleFrame(): 'rest' | 'left' | 'right' | 'both' {
    const left = this.spritePaddleDown('left');
    const right = this.spritePaddleDown('right');
    return left && right ? 'both' : left ? 'left' : right ? 'right' : 'rest';
  }

  /** Handle touch events on one half of the paddle sprite */
  onSpritePaddleTouch(side: 'left' | 'right', down: boolean, event: TouchEvent): void {
    event.preventDefault();
    if (down) this.releaseTextFocus();
    this.setSpritePaddle(side, down);
  }

  /** Handle mouse events on one half of the paddle sprite (desktop fallback) */
  onSpritePaddleMouse(side: 'left' | 'right', down: boolean, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (down) {
      if (this.spriteMouseSides.has(side)) return;
      this.spriteMouseSides.add(side);
      this.releaseTextFocus();
    } else {
      if (!this.spriteMouseSides.has(side)) return;
      this.spriteMouseSides.delete(side);
    }
    this.setSpritePaddle(side, down);
  }

  /** Press or release one paddle of the sprite and pass it to the keyer service as a touch paddle. */
  private setSpritePaddle(side: 'left' | 'right', down: boolean): void {
    const s = this.settings.settings();
    let element: 'dit' | 'dah';
    if (down) {
      if (this.spriteTouched.has(side)) return;
      element = this.spritePaddleElement(side);
      this.spriteTouched.set(side, element);
    } else {
      const held = this.spriteTouched.get(side);
      if (!held) return;
      element = held;
      this.spriteTouched.delete(side);
    }
    const opts = { name: s.spriteName || undefined, color: s.spriteColor || undefined };
    if (element === 'dit') {
      this.keyer.ditPaddleInput(down, s.spriteSource, false, 'touchPaddle', s.spritePaddleMode, opts);
    } else {
      this.keyer.dahPaddleInput(down, s.spriteSource, false, 'touchPaddle', s.spritePaddleMode, opts);
    }
  }

  /** Remember that another input holds (or let go of) a paddle element; without an element it lets go of both. */
  private setSpriteHold(source: string, element: 'dit' | 'dah' | undefined, down: boolean): void {
    if (!element) {
      this.spriteHolds.dit.delete(source);
      this.spriteHolds.dah.delete(source);
      return;
    }
    if (down) this.spriteHolds[element].add(source);
    else this.spriteHolds[element].delete(source);
  }

  /**
   * A paddle of another keyer closed or opened. The sprite's own touches (and the fullscreen touch
   * keyer, which is not on screen at the same time) arrive as `touchPaddle` and are drawn from the touch itself.
   * A release is always followed, so no paddle can stay drawn pressed after its input is switched off.
   */
  private onSpritePaddleContact(evt: PaddleContactEvent): void {
    if (evt.inputPath === 'touchPaddle') return;
    const source = String(evt.inputPath);
    this.ngZone.run(() => {
      if (!evt.down) {
        this.setSpriteHold(source, evt.element, false);
        return;
      }
      const s = this.settings.settings();
      if (!s.spriteButtonEnabled || s.spriteKeyerMode !== 'paddle') return;
      const animate =
        (source.startsWith('keyboardPaddle') && s.spriteAnimateKeyboard) ||
        (source === 'mousePaddle' && s.spriteAnimateMouse) ||
        (source.startsWith('midiPaddle') && s.spriteAnimateMidi) ||
        (source.startsWith('serialPaddle') && s.spriteAnimateSerial);
      if (animate) this.setSpriteHold(source, evt.element, true);
    });
  }

  // ---- Fullscreen modal ----

  openModal(focusReturnFallback?: HTMLElement | null): void {
    this.fullscreenFocusFallback = focusReturnFallback
      ?? this.findMenuTriggerFallback('.clear-menu', '.expand-btn');
    this.activeModal = 'conversation';
    this.keyer.setKeyboardMappingsEnabled(true);
    this.pushModalState('conversation');
  }

  closeModal(): void {
    this.activeModal = null;
    this.syncMainPracticeKeying();
    this.popModalState();
  }

  private findMenuTriggerFallback(menuSelector: string, triggerSelector: string): HTMLElement | null {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.closest(menuSelector)
      ? active.closest('.kebab-wrapper, .fs-kebab-wrapper, .clear-menu-wrapper')
        ?.querySelector<HTMLElement>(triggerSelector) ?? null
      : null;
  }
}
