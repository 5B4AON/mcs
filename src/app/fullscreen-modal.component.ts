/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy,
  AfterViewChecked, AfterViewInit, computed, ElementRef, ViewChild,
  NgZone, HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings, ModalDisplaySettings } from './services/settings.service';
import { AudioInputService } from './services/audio-input.service';
import { AudioDeviceService } from './services/audio-device.service';
import { CwInputService, CwLevelEvent } from './services/cw-input.service';
import { MorseDecoderService } from './services/morse-decoder.service';
import { MorseEncoderService } from './services/morse-encoder.service';
import { MouseKeyerService } from './services/mouse-keyer.service';
import { KeyerService } from './services/keyer.service';
import { DisplayBufferService, DisplayLine } from './services/display-buffer.service';
import { FirebaseRtdbService } from './services/firebase-rtdb.service';
import { toProsignDisplay, PUNCTUATION_TO_PROSIGN } from './morse-table';

/**
 * Fullscreen modal component.
 *
 * Provides a large-text conversation view for decoded CW output and/or
 * an encoder interface for transmitting. Includes level meters, WPM
 * controls, display customisation, and auto-scrolling conversation log.
 */
@Component({
  selector: 'app-fullscreen-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fullscreen-modal.component.html',
  styleUrls: ['./fullscreen-modal.component.css'],
})
export class FullscreenModalComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {
  /** Which modal mode: 'decoder' (conversation) or 'encoder' (QSO) */
  @Input() mode: 'decoder' | 'encoder' = 'decoder';

  /** Emitted when the user closes the modal */
  @Output() closed = new EventEmitter<void>();

  /** Emitted when the user requests the help dialog */
  @Output() helpRequested = new EventEmitter<void>();

  // ---- Level meter state ----
  micLevel = 0;
  cwLevel = 0;
  levelMeterMax = 0.01;
  cwLevelMax = 0.01;
  cwThreshold = 0;

  // ---- Conversation state ----
  /** Last known scrollHeight — used to detect content changes for auto-scroll */
  private lastScrollHeight = 0;
  private needsScroll = false;
  private needsFocus = false;
  private mouseAttached = false;
  hasTouchInput = false;
  virtualKeyboardVisible = false;

  /** True when the on-screen keyboard is likely open (viewport significantly shorter than window) */
  viewportKeyboardOpen = false;

  /** Controls overlay height so it stays above the on-screen keyboard */
  overlayHeight: string | null = null;
  /** Controls overlay top offset to track the visual viewport on iOS */
  overlayTop: string | null = null;

  /** VisualViewport event handler (for cleanup) */
  private vvHandler: (() => void) | null = null;

  @ViewChild('conversationArea') conversationAreaRef?: ElementRef<HTMLDivElement>;
  @ViewChild('virtualKeyInput') virtualKeyInputRef?: ElementRef<HTMLInputElement>;

  // ---- Toolbar kebab state ----
  fsKebabOpen = false;

  // ---- Clear context menu state ----
  clearMenuOpen = false;

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

  private subs: Subscription[] = [];

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    public devices: AudioDeviceService,
    public displayBuffers: DisplayBufferService,
    public rtdb: FirebaseRtdbService,
    private audioInput: AudioInputService,
    private cwInput: CwInputService,
    private mouseKeyer: MouseKeyerService,
    private keyer: KeyerService,
    private zone: NgZone,
    private sanitizer: DomSanitizer,
  ) {}

  /**
   * Conversation lines from the active display buffer.
   * In decoder mode, reads from fullscreenDecoder; in encoder mode,
   * reads from fullscreenEncoder. Each buffer is independent and
   * accumulates text continuously in the root-provided service.
   */
  get conversationLines(): DisplayLine[] {
    return this.mode === 'decoder'
      ? this.displayBuffers.fullscreenDecoder.lines()
      : this.displayBuffers.fullscreenEncoder.lines();
  }

  ngOnInit(): void {
    // Display buffers persist in the root service — no rebuild needed.
    // Just scroll to bottom and set up level meters.
    this.needsScroll = true;
    if (this.mode === 'encoder') this.needsFocus = true;
    this.hasTouchInput = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Mic level meter
    this.subs.push(
      this.audioInput.level$.subscribe(level => {
        this.micLevel = level;
        if (level > this.levelMeterMax) {
          this.levelMeterMax = level * 1.5;
        }
      })
    );

    // CW level meter
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwLevel = lvl.magnitude;
        this.cwThreshold = lvl.threshold;
        if (lvl.magnitude > this.cwLevelMax) {
          this.cwLevelMax = lvl.magnitude * 1.5;
        }
      })
    );

    // Subscribe to VisualViewport changes so the overlay shrinks when
    // the on-screen keyboard appears on mobile devices.
    this.setupVisualViewport();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    // Clean up VisualViewport listeners
    if (window.visualViewport && this.vvHandler) {
      window.visualViewport.removeEventListener('resize', this.vvHandler);
      window.visualViewport.removeEventListener('scroll', this.vvHandler);
    }
    // Detach mouse keyer from fullscreen conversation area
    if (this.mouseAttached && this.conversationAreaRef) {
      this.mouseKeyer.detach(this.conversationAreaRef.nativeElement);
    }
  }

  close(): void {
    this.closed.emit();
  }

  /** Open the help dialog (delegates to parent via output event) */
  requestHelp(): void {
    this.helpRequested.emit();
  }

  clearConversation(): void {
    const buf = this.mode === 'decoder'
      ? this.displayBuffers.fullscreenDecoder
      : this.displayBuffers.fullscreenEncoder;
    buf.clear();
  }

  /** Clear all four display buffers plus encoder operational state */
  clearAllBuffers(): void {
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.encoder.clearBuffer();
  }

  toggleClearMenu(): void {
    this.clearMenuOpen = !this.clearMenuOpen;
  }

  closeClearMenu(): void {
    this.clearMenuOpen = false;
  }

  /**
   * Format text for display, handling prosign patterns and optional punctuation conversion.
   *
   * Prosign patterns (e.g., '<SK>', '<HH>') are always wrapped in styled spans
   * for visual distinction, regardless of the showProsigns setting.
   *
   * When the showProsigns setting is enabled, punctuation marks that share
   * morse patterns with prosigns (e.g., '+' → '<AR>') are also replaced with
   * their prosign names and wrapped in styled spans for improved clarity.
   *
   * @param text The raw text to display
   * @returns Formatted HTML with prosigns styled
   */
  formatText(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.formatTextInternal(text));
  }

  /**
   * Format a complete display line including optional username prefix and text.
   *
   * @param line The display line to format
   * @returns Formatted HTML with optional username prefix and prosign-styled text
   */
  formatLine(line: DisplayLine): SafeHtml {
    let result = '';
    if (line.userName) {
      result += `<span class="rtdb-user-prefix">[${this.escapeHtml(line.userName)}] </span>`;
    }
    result += this.formatTextInternal(line.text);
    return this.sanitizer.bypassSecurityTrustHtml(result);
  }

  /**
   * Internal text formatting logic: handles prosign patterns and punctuation conversion.
   *
   * @param text The text to format
   * @returns HTML string with styled prosigns
   */
  private formatTextInternal(text: string): string {
    let result = '';
    let i = 0;

    while (i < text.length) {
      // Check for prosign pattern: <LETTERS>
      if (text[i] === '<') {
        const endIndex = text.indexOf('>', i);
        if (endIndex !== -1 && endIndex > i + 1) {
          // Extract the prosign pattern (including < and >)
          const prosignPattern = text.substring(i, endIndex + 1);
          // Check if it matches uppercase letters pattern
          if (/^<[A-Z]+>$/.test(prosignPattern)) {
            // This is a prosign - always style it
            result += `<span class="prosign-display">${this.escapeHtml(prosignPattern)}</span>`;
            i = endIndex + 1;
            continue;
          }
        }
      }

      // Check for punctuation to prosign conversion (only if showProsigns is enabled)
      const char = text[i];
      if (this.settings.settings().showProsigns) {
        const prosign = PUNCTUATION_TO_PROSIGN[char];
        if (prosign) {
          result += `<span class="prosign-display">${this.escapeHtml(prosign)}</span>`;
          i++;
          continue;
        }
      }

      // Regular character
      result += this.escapeHtml(char);
      i++;
    }

    return result;
  }

  /**
   * Escape HTML special characters for safe innerHTML rendering.
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Toolbar kebab ----

  ngAfterViewInit(): void {
    // Setup hooks that need DOM access
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.fsKebabOpen = false;
    this.clearMenuOpen = false;
  }

  // ---- WPM adjustments ----

  adjustWpm(key: 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm', delta: number): void {
    const v = Math.max(5, Math.min(50, (this.settings.settings() as any)[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    if (key === 'rxDecoderWpm') this.decoder.resetRxCalibration();
    if (key === 'txDecoderWpm') this.decoder.resetTxCalibration();
    this.saveSettings();
  }

  adjustEncoderWpm(delta: number): void {
    const v = Math.max(5, Math.min(50, this.settings.settings().encoderWpm + delta));
    this.settings.update({ encoderWpm: v });
    this.saveSettings();
  }

  // ---- Settings helpers ----

  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.saveSettings();
  }

  onModalDisplayChange(key: keyof ModalDisplaySettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.updateModalDisplay({ [key]: value } as Partial<ModalDisplaySettings>);
  }

  onModalBoolChange(key: keyof ModalDisplaySettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.updateModalDisplay({ [key]: checked } as Partial<ModalDisplaySettings>);
  }

  private saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }

  // ---- Touch keyer handler ----

  private touchMouseActive = new Set<string>();

  onTouchKey(button: 'straight' | 'left' | 'right', down: boolean, event: TouchEvent): void {
    event.preventDefault();
    this.dispatchTouchButton(button, down);
  }

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
   * Passes the touch keyer's configured decoder source so keyer events
   * are tagged with the correct RX/TX source for calibration routing.
   *
   * Haptic vibration (when enabled) is handled globally by
   * VibrationOutputService, triggered from MorseDecoderService on
   * every key-down/key-up — no vibration logic needed here.
   */
  private dispatchTouchButton(button: 'straight' | 'left' | 'right', down: boolean): void {
    const s = this.settings.settings();
    const source = s.touchKeyerSource;
    if (button === 'straight') {
      this.keyer.straightKeyInput(down, source);
      return;
    }
    const reverse = s.touchReversePaddles;
    const element = button === 'left' ? s.touchLeftPaddle : s.touchRightPaddle;
    const effective = reverse ? (element === 'dit' ? 'dah' : 'dit') : element;
    if (effective === 'dit') {
      this.keyer.ditPaddleInput(down, source);
    } else {
      this.keyer.dahPaddleInput(down, source);
    }
  }

  /** Returns the effective paddle element for a touch button, accounting for reverse */
  effectiveTouchElement(button: 'left' | 'right'): 'dit' | 'dah' {
    const s = this.settings.settings();
    const element = button === 'left' ? s.touchLeftPaddle : s.touchRightPaddle;
    return s.touchReversePaddles ? (element === 'dit' ? 'dah' : 'dit') : element;
  }

  // ---- Encoder keyboard handler ----

  onEncoderModalKeydown(event: KeyboardEvent): void {
    if (this.mode !== 'encoder') return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      const buf = this.encoder.buffer();
      if (buf.length > 0) {
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

  /** Capture characters / deletions from the virtual keyboard hidden input. */
  onVirtualKeyInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const ie = event as InputEvent;

    if (ie.inputType === 'deleteContentBackward' || ie.inputType === 'deleteContentForward') {
      const buf = this.encoder.buffer();
      if (buf.length > 0) {
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

  /** Handle Enter / Escape from the virtual keyboard (keydown is reliable for these). */
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

  // ---- Sync conversation log BEFORE template evaluation ----

  // ---- Post-render: scroll, focus, mouse keyer ----

  ngAfterViewChecked(): void {
    // Attach mouse keyer to conversation area in decoder mode
    if (this.mode === 'decoder' && !this.mouseAttached && this.conversationAreaRef) {
      this.mouseKeyer.attach(this.conversationAreaRef.nativeElement);
      this.mouseAttached = true;
    }

    // Detect content changes for auto-scroll
    if (this.conversationAreaRef) {
      const el = this.conversationAreaRef.nativeElement;
      if (el.scrollHeight !== this.lastScrollHeight) {
        this.lastScrollHeight = el.scrollHeight;
        this.needsScroll = true;
      }
    }

    // Auto-scroll
    if (this.needsScroll && this.conversationAreaRef) {
      const el = this.conversationAreaRef.nativeElement;
      // When the on-screen keyboard is open (detected via VisualViewport),
      // always force-scroll to bottom so the user can see what they are
      // typing or receiving — in landscape there may be only one visible line.
      const nearBottom = this.viewportKeyboardOpen ||
                         (el.scrollHeight - el.scrollTop - el.clientHeight < 120);
      if (nearBottom) {
        // Use instant scroll when keyboard is open to avoid smooth-scroll
        // lag that can leave text behind the toolbar for several frames.
        const behavior = this.viewportKeyboardOpen ? 'instant' as ScrollBehavior : 'smooth' as ScrollBehavior;
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
      this.needsScroll = false;
    }

    // Auto-focus
    if (this.needsFocus && this.conversationAreaRef) {
      this.conversationAreaRef.nativeElement.focus();
      this.needsFocus = false;
    }
  }

  // ---- VisualViewport: keep overlay above the on-screen keyboard ----

  /**
   * Subscribe to VisualViewport resize/scroll events.
   *
   * On mobile devices the on-screen keyboard reduces the visual viewport
   * height but does NOT resize `position: fixed` elements (which span
   * the full layout viewport).  Explicitly setting the overlay height
   * to the visual viewport height keeps the entire modal — toolbar,
   * conversation area, and encoder buffer — above the keyboard so the
   * user can always see what they are typing or receiving, even in
   * landscape where only one or two text lines are visible.
   */
  private setupVisualViewport(): void {
    if (!window.visualViewport) return;
    this.vvHandler = () => this.zone.run(() => this.onVisualViewportChange());
    window.visualViewport.addEventListener('resize', this.vvHandler);
    window.visualViewport.addEventListener('scroll', this.vvHandler);
  }

  private onVisualViewportChange(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    this.overlayHeight = `${vv.height}px`;
    this.overlayTop = `${vv.offsetTop}px`;
    // Detect whether the on-screen keyboard is likely open:
    // the visual viewport is significantly shorter than the layout viewport.
    this.viewportKeyboardOpen = vv.height < window.innerHeight * 0.75;
    // Ensure the latest content is scrolled into view
    this.needsScroll = true;
  }
}
