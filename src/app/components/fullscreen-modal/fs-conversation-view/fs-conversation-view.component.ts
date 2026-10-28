/**
 * Morse Code Studio
 */

import {
  Component, HostListener, Input, OnInit, OnDestroy, OnChanges, SimpleChanges,
  AfterViewChecked, ElementRef, EventEmitter, Output, ViewChild, computed
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsService } from '../../../services/settings.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { MorseEncoderService } from '../../../services/morse-encoder.service';
import { DisplayBufferService, DisplayLine } from '../../../services/display-buffer.service';
import { KeyerService } from '../../../services/keyer.service';
import { MouseKeyerService } from '../../../services/mouse-keyer.service';
import { PracticeService } from '../../../services/practice.service';
import { formatText, formatLine } from '../fullscreen-format.utils';
import * as practiceUi from '../../../practice-ui.utils';

/**
 * Fullscreen conversation view component.
 *
 * Renders the decoded conversation log in a scrollable area with auto-scroll,
 * blinking pattern cursors for active RX/TX decoding, and an optional touch
 * keyer overlay for straight key or paddle input on mobile devices.
 *
 * Key mode attaches the mouse keyer to the conversation area. Type mode uses
 * an off-screen native input for physical and mobile keyboard capture while
 * rendering text inline, with mouse keying detached.
 *
 * Text formatting (prosign patterns, emoji replacements, RTDB name prefixes)
 * is handled by shared utility functions from fullscreen-format.utils.
 */
@Component({
  selector: 'app-fs-conversation-view',
  standalone: true,
  imports: [],
  templateUrl: './fs-conversation-view.component.html',
  styleUrls: ['./fs-conversation-view.component.css'],
})
export class FsConversationViewComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked {
  /** Shared labels for the compact Practice guide. */
  readonly practiceUi = practiceUi;

  /**
   * Whether the on-screen keyboard is likely open.
   * Used to adjust auto-scroll behaviour (instant vs smooth) and
   * force-scroll to bottom so content remains visible.
   */
  @Input() viewportKeyboardOpen = false;
  /** Temporary fullscreen input choice; it is not stored in settings. */
  @Input() inputMode: 'key' | 'type' = 'key';
  /** Requests a temporary input choice change from the modal shell. */
  @Output() inputModeChange = new EventEmitter<'key' | 'type'>();

  @ViewChild('conversationArea') conversationAreaRef?: ElementRef<HTMLDivElement>;
  @ViewChild('typeInput') typeInputRef?: ElementRef<HTMLInputElement>;

  /** Last known scrollHeight — used to detect content changes for auto-scroll */
  private lastScrollHeight = 0;
  private needsScroll = false;
  private needsTypeInputFocus = false;
  private mouseAttached = false;
  private readonly keyboardHeldButtons = new Set<'straight' | 'left' | 'right'>();

  /** Whether text is currently being revealed (button held) */
  revealing = false;

  /** Whether the encoder is in practice mode. */
  get isPractice(): boolean {
    return this.settings.settings().encoderMode === 'practice';
  }

  /** Practice briefing, feedback and typed text are shown only in Type mode so Key mode shows keyed characters. */
  get practiceView(): boolean {
    return this.isPractice && this.inputMode === 'type';
  }

  /** Pending encoder characters shown inline with the conversation. */
  readonly encoderPendingChars = computed(() => {
    const buffer = this.encoder.buffer();
    if (this.settings.settings().encoderMode === 'practice') return [];
    return buffer.slice(this.encoder.sentIndex()).split('');
  });

  /**
   * True when the next sent character will open a new conversation line (the
   * last line is empty or belongs to another source, name or colour). The
   * pending text is then drawn one row lower, so the sent line fills the row
   * above it and the pending text does not jump when its first letter is played.
   */
  readonly encoderStartsNewLine = computed(() => {
    const s = this.settings.settings();
    const last = this.displayBuffers.fullscreenConversation.lines().at(-1);
    if (!last) return true;
    return last.type !== s.encoderSource
      || last.name !== this.displayBuffers.displayNameFor(s.encoderSource, s.encoderName || undefined)
      || last.color !== (s.encoderColor || undefined);
  });

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    private displayBuffers: DisplayBufferService,
    private keyer: KeyerService,
    private mouseKeyer: MouseKeyerService,
    public practice: PracticeService,
    private sanitizer: DomSanitizer,
  ) {}

  /**
   * Active blur mode derived from settings.
   * Returns null when blur is disabled, otherwise the appliesTo value.
   * In practice mode with blur/typealong feedback, blurs the practice source.
   */
  get blurMode(): 'rx' | 'tx' | 'both' | null {
    const s = this.settings.settings();
    if (s.encoderMode === 'practice' && this.inputMode === 'key') return null;
    if (s.encoderMode === 'practice' && (s.practiceFeedbackMode === 'blur' || s.practiceFeedbackMode === 'typealong')) {
      if (this.practice.state() === 'finished' && this.practice.feedback().length > 0) {
        return null;
      }
      return s.practiceSource;
    }
    return s.textBlurEnabled ? s.textBlurAppliesTo : null;
  }

  /**
   * Conversation lines from the shared fullscreen display buffer.
   * Accumulates continuously in the root-provided DisplayBufferService.
   */
  get conversationLines(): DisplayLine[] {
    return this.displayBuffers.fullscreenConversation.lines();
  }

  /** Start revealing blurred text (momentary hold) */
  onRevealStart(event: Event): void {
    event.preventDefault();
    this.revealing = true;
  }

  /** Stop revealing blurred text */
  onRevealEnd(): void {
    this.revealing = false;
  }

  ngOnInit(): void {
    // Scroll to bottom on open so any existing text is visible
    this.needsScroll = true;
  }

  ngOnDestroy(): void {
    this.releaseKeyboardHeldButtons();
    // Detach mouse keyer from the conversation area
    if (this.mouseAttached && this.conversationAreaRef) {
      this.mouseKeyer.detach(this.conversationAreaRef.nativeElement);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When the viewport keyboard state changes (e.g., keyboard appears/disappears),
    // trigger a scroll to ensure content stays visible
    if (changes['viewportKeyboardOpen']) {
      this.needsScroll = true;
    }
    if (changes['inputMode']) {
      this.needsTypeInputFocus = this.inputMode === 'type';
      if (this.inputMode === 'key') this.typeInputRef?.nativeElement.blur();
      this.updateMouseKeyerAttachment();
    }
  }

  ngAfterViewChecked(): void {
    this.updateMouseKeyerAttachment();
    if (this.needsTypeInputFocus && this.focusTypeInput()) {
      this.needsTypeInputFocus = false;
    }

    // Detect content changes for auto-scroll
    if (this.conversationAreaRef) {
      const el = this.conversationAreaRef.nativeElement;
      if (el.scrollHeight !== this.lastScrollHeight) {
        this.lastScrollHeight = el.scrollHeight;
        this.needsScroll = true;
      }
    }

    // Auto-scroll to bottom on every content change
    if (this.needsScroll && this.conversationAreaRef) {
      const el = this.conversationAreaRef.nativeElement;
      const behavior = this.viewportKeyboardOpen ? 'instant' as ScrollBehavior : 'smooth' as ScrollBehavior;
      el.scrollTo({ top: el.scrollHeight, behavior });
      this.needsScroll = false;
    }
  }

  // ---- Text formatting (delegates to shared utility functions) ----

  /** Format a display line with optional name prefix and prosign/emoji styling */
  formatLine(line: DisplayLine): SafeHtml {
    return formatLine(line, this.settings.settings(), this.sanitizer);
  }

  /** Format encoder text without applying emoji replacements while it is pending. */
  formatPendingText(text: string): SafeHtml {
    return formatText(text, this.settings.settings(), this.sanitizer);
  }

  /** Select Key or Type message without sending or changing saved settings. */
  selectInputMode(mode: 'key' | 'type'): void {
    if (mode !== this.inputMode) this.inputModeChange.emit(mode);
  }

  /** Start or stop the current encoder transmission. */
  toggleTx(): void {
    this.encoder.toggleTx();
    this.requestTypeInputFocus();
  }

  /** Start, advance, pause, or resume the active practice flow. */
  practiceAction(): void {
    if (this.settings.settings().practiceFeedbackMode === 'typealong') {
      if (this.practice.state() === 'playing') {
        this.practice.pause();
      } else if (this.practice.state() === 'paused') {
        this.practice.resume();
      } else {
        this.practice.advanceTypeAlongSession();
      }
      this.requestTypeInputFocus();
      return;
    }
    if (this.practice.state() === 'finished') this.practice.next();
    else if (this.practice.state() === 'playing') this.practice.pause();
    else if (this.practice.state() === 'paused') this.practice.resume();
    else this.practice.start();
  }

  /** Route the hidden native input through the existing encoder or type-along path. */
  onTypeInput(event: Event): void {
    const inputEvent = event as InputEvent;
    const input = event.target as HTMLInputElement;
    const isPractice = this.settings.settings().encoderMode === 'practice';
    const typeAlong = isPractice && this.settings.settings().practiceFeedbackMode === 'typealong';
    if (typeAlong && (this.practice.state() === 'playing' || this.practice.state() === 'finished')) {
      if (inputEvent.inputType.startsWith('delete')) {
        this.practice.userInput.set(this.practice.userInput().slice(0, -1));
      } else if (inputEvent.data) {
        this.practice.userInput.set(this.practice.userInput() + inputEvent.data.toUpperCase());
      }
    } else if (!isPractice) {
      if (inputEvent.inputType.startsWith('delete')) {
        const buffer = this.encoder.buffer();
        const minimum = this.encoder.isSending() ? this.encoder.sentIndex() + 1 : this.encoder.sentIndex();
        if (buffer.length > minimum) this.encoder.setBuffer(buffer.slice(0, -1));
      } else if (inputEvent.data) {
        for (const char of inputEvent.data) {
          // Ignore a space at the start of a message or right after another space
          const buffer = this.encoder.buffer();
          if (/\s/.test(char) && (buffer.length <= this.encoder.sentIndex() || /\s$/.test(buffer))) continue;
          this.encoder.enqueue(char);
        }
      }
    }
    this.resetTypeInput(input);
  }

  /** Keep Enter aligned with the existing Send on Enter and practice actions. */
  onTypeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (this.settings.settings().encoderMode === 'practice') this.practiceAction();
    else if (this.settings.settings().encoderMode === 'enter') this.encoder.startTx();
  }

  /** Return typing focus after an action button has taken it. */
  private requestTypeInputFocus(): void {
    if (this.inputMode !== 'type') return;
    this.needsTypeInputFocus = true;
  }

  /** Refocus typing when the conversation is clicked in Type mode. */
  onConversationClick(): void {
    if (this.inputMode === 'type') this.focusTypeInput();
  }

  /**
   * Focus the hidden native input (no visible text box). Called synchronously
   * from the toggle click so mobile browsers raise the on-screen keyboard.
   */
  focusTypeInput(): boolean {
    const input = this.typeInputRef?.nativeElement;
    if (!input) return false;
    input.focus({ preventScroll: true });
    this.resetTypeInput(input);
    return document.activeElement === input;
  }

  /** Move focus to the conversation window; this also closes the on-screen keyboard. */
  focusMain(): void {
    this.typeInputRef?.nativeElement.blur();
    this.conversationAreaRef?.nativeElement.focus({ preventScroll: true });
  }

  /** Retain a sentinel character so virtual-keyboard deletion emits input events. */
  private resetTypeInput(input: HTMLInputElement): void {
    input.value = ' ';
    input.setSelectionRange(1, 1);
  }

  /** Attach mouse keying only when the conversation is intentionally in Key mode. */
  private updateMouseKeyerAttachment(): void {
    const conversation = this.conversationAreaRef?.nativeElement;
    if (!conversation) return;
    if (this.inputMode === 'key' && !this.mouseAttached) {
      this.mouseKeyer.attach(conversation);
      this.mouseAttached = true;
    } else if (this.inputMode === 'type' && this.mouseAttached) {
      this.mouseKeyer.detach(conversation);
      this.mouseAttached = false;
    }
  }

  // ---- Touch keyer handlers ----

  private touchMouseActive = new Set<string>();

  /** Handle touch events on the touch keyer overlay buttons */
  onTouchKey(button: 'straight' | 'left' | 'right', down: boolean, event: Event): void {
    event.preventDefault();
    this.dispatchTouchButton(button, down);
  }

  /** Send a keyboard press-and-hold from a focused fullscreen touch-keyer button. */
  onTouchKeyboardKey(
    button: 'straight' | 'left' | 'right',
    down: boolean,
    event: KeyboardEvent,
  ): void {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (down) {
      if (this.keyboardHeldButtons.has(button)) return;
      this.keyboardHeldButtons.add(button);
    } else {
      if (!this.keyboardHeldButtons.has(button)) return;
      this.keyboardHeldButtons.delete(button);
    }
    this.dispatchTouchButton(button, down);
  }

  /** Release held keyboard keys when focus leaves a keyer button. */
  onTouchKeyBlur(): void {
    this.releaseKeyboardHeldButtons();
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.releaseKeyboardHeldButtons();
  }

  /** Handle mouse events on the touch keyer overlay buttons (for desktop testing) */
  onTouchMouseKey(button: 'straight' | 'left' | 'right', down: boolean, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (down) {
      if (this.touchMouseActive.has(button)) return;
      this.touchMouseActive.add(button);
    } else {
      if (!this.touchMouseActive.has(button)) return;
      this.touchMouseActive.delete(button);
    }
    this.dispatchTouchButton(button, down);
  }

  /**
   * Dispatch a touch/mouse button press to the keyer service.
   *
   * Passes the touch keyer's configured decoder source and the
   * appropriate InputPath so keyer events are tagged correctly
   * and routed through the correct decoder pipeline.
   *
   * Haptic vibration (when enabled) is handled globally by
   * VibrationOutputService, triggered from MorseDecoderService on
   * every key-down/key-up — no vibration logic needed here.
   */
  private dispatchTouchButton(button: 'straight' | 'left' | 'right', down: boolean): void {
    const s = this.settings.settings();
    const source = s.touchKeyerSource;
    const opts = { name: s.touchKeyerName || undefined, color: s.touchKeyerColor || undefined };
    if (button === 'straight') {
      this.keyer.straightKeyInput(down, source, false, 'touchStraightKey', opts);
      return;
    }

    const reverse = s.touchReversePaddles;
    const element = button === 'left' ? 'dit' : 'dah';
    const effective = reverse ? (element === 'dit' ? 'dah' : 'dit') : element;
    if (effective === 'dit') {
      this.keyer.ditPaddleInput(down, source, false, 'touchPaddle', s.touchPaddleMode, opts);
    } else {
      this.keyer.dahPaddleInput(down, source, false, 'touchPaddle', s.touchPaddleMode, opts);
    }
  }

  private releaseKeyboardHeldButtons(): void {
    for (const button of this.keyboardHeldButtons) {
      this.dispatchTouchButton(button, false);
    }
    this.keyboardHeldButtons.clear();
  }

  /** Returns the effective paddle element for a touch button, accounting for reverse */
  effectiveTouchElement(button: 'left' | 'right'): 'dit' | 'dah' {
    const s = this.settings.settings();
    const element = button === 'left' ? 'dit' : 'dah';
    return s.touchReversePaddles ? (element === 'dit' ? 'dah' : 'dit') : element;
  }
}
