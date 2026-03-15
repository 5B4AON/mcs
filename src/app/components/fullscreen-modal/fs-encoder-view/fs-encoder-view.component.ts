/**
 * Morse Code Studio
 */

import {
  Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges,
  AfterViewChecked, ElementRef, ViewChild, computed
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsService } from '../../../services/settings.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { MorseEncoderService } from '../../../services/morse-encoder.service';
import { DisplayBufferService, DisplayLine } from '../../../services/display-buffer.service';
import { formatText, formatTextNoEmoji, formatLine } from '../fullscreen-format.utils';

/**
 * Fullscreen encoder view component.
 *
 * Renders the encoder conversation area with:
 * - Decoded conversation lines (RX and TX) with prosign/emoji formatting
 * - Inline encoder buffer showing unsent/currently-sending characters
 * - Keyboard input handling (physical keys via keydown)
 * - Virtual keyboard support for mobile/touch devices
 * - Auto-scroll to keep the latest content visible
 *
 * The encoder buffer is displayed inline after the last TX line (or
 * standalone if no conversation lines exist). Characters change colour
 * as they transition from buffered → currently-sending → sent.
 */
@Component({
  selector: 'app-fs-encoder-view',
  standalone: true,
  imports: [],
  templateUrl: './fs-encoder-view.component.html',
  styleUrls: ['../fullscreen-shared.css', './fs-encoder-view.component.css'],
})
export class FsEncoderViewComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked {
  /**
   * Whether the on-screen keyboard is likely open.
   * Used to adjust auto-scroll behaviour and force-scroll to bottom.
   */
  @Input() viewportKeyboardOpen = false;

  @ViewChild('conversationArea') conversationAreaRef?: ElementRef<HTMLDivElement>;
  @ViewChild('virtualKeyInput') virtualKeyInputRef?: ElementRef<HTMLInputElement>;

  /** Whether touch input is available (shows virtual keyboard toggle) */
  /** Whether touch input is available (shows virtual keyboard toggle) */
  hasTouchInput = false;

  /** Whether the on-screen virtual keyboard is currently visible */
  virtualKeyboardVisible = false;

  /** Whether text is currently being revealed (button held) */
  revealing = false;

  /** Last known scrollHeight — used to detect content changes for auto-scroll */
  private lastScrollHeight = 0;
  private needsScroll = false;
  private needsFocus = false;

  /**
   * Pending (unsent + currently-sending) encoder chars.
   *
   * Returns only characters from sentIndex onward so there's no
   * duplication with the conversation log (which captures sent chars).
   * Tracked by positional index — simple and stable since items only
   * leave from the front of the array.
   */
  readonly encoderPendingChars = computed(() => {
    const buf = this.encoder.buffer();
    const idx = this.encoder.sentIndex();
    return buf.slice(idx).split('');
  });

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    private displayBuffers: DisplayBufferService,
    private sanitizer: DomSanitizer,
  ) {}

  /**
   * Active blur mode derived from settings.
   * Returns null when blur is disabled, otherwise the appliesTo value.
   */
  get blurMode(): 'rx' | 'tx' | 'both' | null {
    const s = this.settings.settings();
    return s.textBlurEnabled ? s.textBlurAppliesTo : null;
  }

  /**
   * Conversation lines from the fullscreen encoder display buffer.
   * Accumulates continuously in the root-provided DisplayBufferService.
   */
  get conversationLines(): DisplayLine[] {
    return this.displayBuffers.fullscreenEncoder.lines();
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
    this.needsScroll = true;
    this.needsFocus = true;
    this.hasTouchInput = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  ngOnDestroy(): void {
    // No cleanup needed — all services are root-provided singletons
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When the viewport keyboard state changes, trigger a scroll to keep content visible
    if (changes['viewportKeyboardOpen']) {
      this.needsScroll = true;
    }
  }

  ngAfterViewChecked(): void {
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

    // Auto-focus the conversation area for keyboard input
    if (this.needsFocus && this.conversationAreaRef) {
      this.conversationAreaRef.nativeElement.focus();
      this.needsFocus = false;
    }
  }

  // ---- Text formatting (delegates to shared utility functions) ----

  /** Format a display line with optional name prefix and prosign/emoji styling */
  formatLine(line: DisplayLine): SafeHtml {
    return formatLine(line, this.settings.settings(), this.sanitizer);
  }

  /** Format text without emoji replacement (for unsent buffer chars) */
  formatTextNoEmoji(text: string): SafeHtml {
    return formatTextNoEmoji(text, this.settings.settings(), this.sanitizer);
  }

  // ---- Encoder keyboard handler ----

  /**
   * Handle keydown events on the conversation area for encoder input.
   *
   * - Printable characters are enqueued to the encoder buffer
   * - Backspace deletes the last unsent character
   * - Enter starts transmission (in 'enter' mode)
   * - Escape stops transmission
   * - Modifier combos (Ctrl/Alt/Meta) are ignored
   */
  onEncoderModalKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      const buf = this.encoder.buffer();
      const sentIdx = this.encoder.sentIndex();
      // The char at sentIndex is currently being sent (audio already started),
      // so treat it as non-deletable when TX is active.
      const minKeep = this.encoder.isSending() ? sentIdx + 1 : sentIdx;
      if (buf.length > minKeep) {
        this.encoder.setBuffer(buf.slice(0, -1));
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.encoder.stopTx();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.settings.settings().encoderMode === 'enter') {
        this.encoder.startTx();
      }
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      this.encoder.enqueue(event.key);
    }
  }

  // ---- Virtual keyboard support (mobile encoder) ----

  /**
   * Toggle the on-screen virtual keyboard by focusing/blurring a hidden input.
   * The button uses (mousedown)="$event.preventDefault()" so that clicking
   * the toggle doesn't steal focus from the hidden input first.
   */
  toggleVirtualKeyboard(): void {
    if (this.virtualKeyboardVisible) {
      this.virtualKeyboardVisible = false;
      this.virtualKeyInputRef?.nativeElement.blur();
    } else {
      this.virtualKeyboardVisible = true;
      const input = this.virtualKeyInputRef?.nativeElement;
      if (input) {
        input.focus();
        if (!input.value) input.value = ' ';
      }
    }
  }

  /** Capture characters / deletions from the virtual keyboard hidden input */
  onVirtualKeyInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const ie = event as InputEvent;

    if (ie.inputType === 'deleteContentBackward' || ie.inputType === 'deleteContentForward') {
      const buf = this.encoder.buffer();
      const sentIdx = this.encoder.sentIndex();
      const minKeep = this.encoder.isSending() ? sentIdx + 1 : sentIdx;
      if (buf.length > minKeep) {
        this.encoder.setBuffer(buf.slice(0, -1));
      }
    } else if (ie.inputType === 'insertLineBreak') {
      if (this.settings.settings().encoderMode === 'enter') {
        this.encoder.startTx();
      }
    } else if (ie.data) {
      for (const char of ie.data) {
        this.encoder.enqueue(char);
      }
    }

    // Reset to a sentinel space so backspace always has a character to delete
    input.value = ' ';
    input.setSelectionRange(1, 1);
  }

  /** Handle Enter / Escape from the virtual keyboard (keydown is reliable for these) */
  onVirtualKeyKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.settings.settings().encoderMode === 'enter') {
        this.encoder.startTx();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.encoder.stopTx();
    }
  }
}
