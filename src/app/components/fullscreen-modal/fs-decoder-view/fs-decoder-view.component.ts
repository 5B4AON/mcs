/**
 * Morse Code Studio
 */

import {
  Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges,
  AfterViewChecked, ElementRef, ViewChild
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsService } from '../../../services/settings.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { DisplayBufferService, DisplayLine } from '../../../services/display-buffer.service';
import { KeyerService } from '../../../services/keyer.service';
import { MouseKeyerService } from '../../../services/mouse-keyer.service';
import { formatText, formatLine } from '../fullscreen-format.utils';

/**
 * Fullscreen decoder view component.
 *
 * Renders the decoded conversation log in a scrollable area with auto-scroll,
 * blinking pattern cursors for active RX/TX decoding, and an optional touch
 * keyer overlay for straight key or paddle input on mobile devices.
 *
 * Attaches the mouse keyer to the conversation area so that mouse button
 * presses anywhere in the text area act as morse key input.
 *
 * Text formatting (prosign patterns, emoji replacements, RTDB name prefixes)
 * is handled by shared utility functions from fullscreen-format.utils.
 */
@Component({
  selector: 'app-fs-decoder-view',
  standalone: true,
  imports: [],
  templateUrl: './fs-decoder-view.component.html',
  styleUrls: ['../fullscreen-shared.css', './fs-decoder-view.component.css'],
})
export class FsDecoderViewComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked {
  /**
   * Whether the on-screen keyboard is likely open.
   * Used to adjust auto-scroll behaviour (instant vs smooth) and
   * force-scroll to bottom so content remains visible.
   */
  @Input() viewportKeyboardOpen = false;

  @ViewChild('conversationArea') conversationAreaRef?: ElementRef<HTMLDivElement>;

  /** Last known scrollHeight — used to detect content changes for auto-scroll */
  private lastScrollHeight = 0;
  private needsScroll = false;
  private mouseAttached = false;

  /** Whether text is currently being revealed (button held) */
  revealing = false;

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    private displayBuffers: DisplayBufferService,
    private keyer: KeyerService,
    private mouseKeyer: MouseKeyerService,
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
   * Conversation lines from the fullscreen decoder display buffer.
   * Accumulates continuously in the root-provided DisplayBufferService.
   */
  get conversationLines(): DisplayLine[] {
    return this.displayBuffers.fullscreenDecoder.lines();
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
  }

  ngAfterViewChecked(): void {
    // Attach mouse keyer to the conversation area once available
    if (!this.mouseAttached && this.conversationAreaRef) {
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

  // ---- Touch keyer handlers ----

  private touchMouseActive = new Set<string>();

  /** Handle touch events on the touch keyer overlay buttons */
  onTouchKey(button: 'straight' | 'left' | 'right', down: boolean, event: TouchEvent): void {
    event.preventDefault();
    this.dispatchTouchButton(button, down);
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

  /** Returns the effective paddle element for a touch button, accounting for reverse */
  effectiveTouchElement(button: 'left' | 'right'): 'dit' | 'dah' {
    const s = this.settings.settings();
    const element = button === 'left' ? 'dit' : 'dah';
    return s.touchReversePaddles ? (element === 'dit' ? 'dah' : 'dit') : element;
  }
}
