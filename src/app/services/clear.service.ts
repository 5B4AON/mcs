/**
 * Morse Code Studio
 */

import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { MorseEncoderService } from './morse-encoder.service';
import { MorseDecoderService } from './morse-decoder.service';
import { DisplayBufferService } from './display-buffer.service';
import { PracticeService } from './practice.service';
import { LensService } from './lens.service';

/**
 * Clear Service — the single place where the input area, the output area or
 * everything is cleared, for the main screen and the fullscreen view alike.
 *
 * The input area is the text waiting to be sent (the main-screen textarea, the
 * Type-mode buffer, or the Type-along answer in practice). The output area is
 * the main output panel and the fullscreen conversation, which are always
 * cleared together. The clear menus use `inputHasContent` and `outputHasContent`
 * to offer only the buttons that would do something.
 */
@Injectable({ providedIn: 'root' })
export class ClearService {
  /** Whether the main-screen encoder textarea has text; kept up to date by `AppComponent`. */
  readonly mainInputHasText = signal(false);

  /** Emits when the main-screen encoder textarea must be emptied. */
  readonly inputCleared$ = new Subject<void>();

  /** True when there is typed or pending text that "Input area" would remove. */
  readonly inputHasContent = computed(() => {
    if (this.mainInputHasText() || this.encoder.replayPending()) return true;
    if (this.settings.settings().encoderMode === 'practice') return this.practice.userInput() !== '';
    return this.encoder.buffer().length > this.encoder.sentIndex();
  });

  /** True when either output area shows text. */
  readonly outputHasContent = computed(() =>
    this.displayBuffers.mainOutput.hasText() || this.displayBuffers.fullscreenConversation.hasText());

  /** True when the Clear button has anything to offer. */
  readonly canClear = computed(() => this.inputHasContent() || this.outputHasContent());

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
    private decoder: MorseDecoderService,
    private displayBuffers: DisplayBufferService,
    private practice: PracticeService,
    private lens: LensService,
  ) {}

  /** Clear the typed text; this also stops a send or replay in progress. */
  clearInput(): void {
    if (this.settings.settings().encoderMode === 'practice') this.practice.abort();
    else this.encoder.clearBuffer();
    this.mainInputHasText.set(false);
    this.inputCleared$.next();
  }

  /** Clear the main output and the fullscreen conversation together. */
  clearOutput(): void {
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.abort();
      this.mainInputHasText.set(false);
      this.inputCleared$.next();
    }
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.lens.reset();
  }

  /** Clear the input and both output areas. */
  clearAll(): void {
    this.clearInput();
    this.clearOutput();
  }
}
