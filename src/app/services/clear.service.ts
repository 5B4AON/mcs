/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { MorseEncoderService } from './morse-encoder.service';
import { MorseDecoderService } from './morse-decoder.service';
import { DisplayBufferService } from './display-buffer.service';
import { PracticeService } from './practice.service';
import { SendPracticeService } from './send-practice.service';
import { LensService } from './lens.service';
import { EbookService } from './ebook.service';

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
    // A book keeps its place and has nothing to clear (the Clear button is not shown for it)
    if (this.ebook.active()) return false;
    if (this.mainInputHasText() || this.encoder.replayPending()) return true;
    if (this.settings.settings().encoderMode === 'practice') return this.practice.userInput() !== '';
    return this.encoder.buffer().length > this.encoder.sentIndex();
  });

  /** True when either output area shows text, or a practice briefing/summary/round is showing. */
  readonly outputHasContent = computed(() => !this.ebook.active() && (
    this.displayBuffers.mainOutput.hasText() || this.displayBuffers.fullscreenConversation.hasText()
    || (this.settings.settings().encoderMode === 'practice' && this.practice.promptShowing())
    || (this.settings.settings().encoderMode === 'send-practice'
      && (this.sendPractice.state() !== 'idle' || this.sendPractice.promptShowing()))));

  /** True when the Clear button has anything to offer. */
  readonly canClear = computed(() => this.inputHasContent() || this.outputHasContent());

  /**
   * The practice settings that shape an exercise. Name and colour are left out (they only style
   * the text, and a name is typed one letter at a time); the on/off switch is handled by the mode change.
   */
  private readonly practiceSignature = computed(() => {
    const s = this.settings.settings();
    return JSON.stringify([
      s.practiceContentMode, s.practiceGroupCount, s.practiceCharGroupSize, s.practiceIncludeLetters,
      s.practiceIncludeNumbers, s.practiceIncludePunctuation, s.practiceKochLesson, s.practiceWordLengths,
      s.practiceFeedbackMode, s.practiceRounds, s.practicePipeline, s.practiceSource,
    ]);
  });

  /** Same for Send practice: what is shown and how it is checked; the keys, pipeline and hint are left out. */
  private readonly sendPracticeSignature = computed(() => {
    const s = this.settings.settings();
    return JSON.stringify([
      s.sendPracticeContentMode, s.sendPracticeGroupCount, s.sendPracticeCharGroupSize, s.sendPracticeIncludeLetters,
      s.sendPracticeIncludeNumbers, s.sendPracticeIncludePunctuation, s.sendPracticeKochLesson, s.sendPracticeWordLengths,
      s.sendPracticeCheckMode, s.sendPracticeRounds,
    ]);
  });

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
    private decoder: MorseDecoderService,
    private displayBuffers: DisplayBufferService,
    private practice: PracticeService,
    private sendPractice: SendPracticeService,
    private lens: LensService,
    private ebook: EbookService,
  ) {
    // Changing what is practised starts clean: nothing from the previous exercise stays on screen
    let previous = this.practiceSignature();
    effect(() => {
      const signature = this.practiceSignature();
      if (signature === previous) return;
      previous = signature;
      untracked(() => {
        if (this.settings.settings().encoderMode === 'practice') this.clearAll();
      });
    });
    let previousSend = this.sendPracticeSignature();
    effect(() => {
      const signature = this.sendPracticeSignature();
      if (signature === previousSend) return;
      previousSend = signature;
      untracked(() => {
        // A jump to the next Koch lesson from the results has already started its round
        if (this.sendPractice.takeLessonJump()) return;
        if (this.settings.settings().encoderMode === 'send-practice') this.clearAll();
      });
    });
  }

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
    if (this.settings.settings().encoderMode === 'send-practice') this.sendPractice.abort();
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
