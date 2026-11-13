/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { SettingsService } from './settings.service';
import { MorseEncoderService } from './morse-encoder.service';
import { KochHelpService } from './koch-help.service';
import { MorseDecoderService } from './morse-decoder.service';
import { DisplayBufferService } from './display-buffer.service';
import { EbookService } from './ebook.service';
import { EbookCursor } from './ebook-cursor';
import { EbookPosition } from './ebook-model';
import { PracticeContentOptions, PracticeSequenceGenerator } from './practice-content';
import { PracticeFeedback, practiceAccuracy } from './practice-scoring';
import { alignKeying } from './send-practice-alignment';
import { PracticeSessionStage } from './practice.service';
import { MORSE_TABLE } from '../morse-table';
import { sendPracticeHasActiveInput, sendPracticeInputId } from '../components/settings-items/send-practice/send-practice-inputs';
import { sendKochRecommendation } from '../components/settings-items/practice/practice-ui.utils';

/** Send practice round state: no round, a prompt waiting to be keyed, or a scored round */
export type SendPracticeState = 'idle' | 'keying' | 'finished';

/** One keyed character on screen. */
export interface SendPracticeMark {
  /** The character that was keyed */
  char: string;
  /** Matched a prompt character, was wrong or repeated, or is a keyed word gap */
  result: 'correct' | 'incorrect' | 'space';
}

/** One character of the prompt on screen. */
export interface SendPromptMark {
  char: string;
  /**
   * `current` is the character to key next. `correct` and `incorrect` appear only with
   * "As you go"; `plain` is everything else, and `space` a word gap.
   */
  state: 'space' | 'plain' | 'correct' | 'incorrect' | 'current';
}

/** The keyed-text prosign that erases the last keyed character (eight dits, "error"). */
const ERASE_PROSIGN = '<HH>';

/**
 * After the keying reaches the end of the prompt (or as many characters as it has) with
 * mistakes left in, the round waits this long for corrections before it ends by itself.
 */
export const SEND_FINISH_GRACE_MS = 3500;

/** The shorter wait when the user is clearly done: the last character keyed is the prompt's last, keyed right. */
export const SEND_FINISH_SURE_MS = 1000;

/** Keys keyed this soon after a round ended are leftovers of that round, not "next". */
const NEXT_KEY_GUARD_MS = 800;

/**
 * Send Practice Service — shows a prompt and scores the keying of it.
 *
 * The mirror of Copy Practice. A prompt (random characters, words, callsigns
 * or a Koch lesson) is shown instead of played; the user keys it with any of
 * the keys picked in Settings (`sendPracticeInputs`), and the characters the
 * decoder produces for those keys are collected. RTDB entries never count.
 * The first picked key that produces a character owns the round, so two keys
 * cannot interleave. Keying `<HH>` erases the last keyed character.
 *
 * Mistakes need not be deleted: after every character the keyed stream is lined
 * up with the whole prompt (`alignKeying`), which tells where the user is, what is
 * right so far, and when they are done. With "As you go" and "At the end (Auto)" the
 * round ends by itself, at once when everything is right, otherwise after a short
 * wait for corrections; "At the end (Manual)" ends only with the Check button. After
 * a round, the next keyed character starts the next one, like pressing Start.
 *
 * Nothing here sends anything: whether keying may reach external outputs is
 * decided by `SendPracticeGateService` (default: this device only).
 */
@Injectable({ providedIn: 'root' })
export class SendPracticeService {
  /** Current round state */
  readonly state = signal<SendPracticeState>('idle');
  /** The prompt (uppercase, space-separated groups) */
  readonly referenceText = signal('');
  /** What the user keyed so far (after erasing, never ends with a space) */
  readonly keyedText = signal('');
  /** Per-character result of the finished round (empty until it is scored) */
  readonly feedback = signal<PracticeFeedback[]>([]);
  /** Current multi-round session phase; never persisted */
  readonly sessionStage = signal<PracticeSessionStage>('none');
  /** Completed round percentages for the current session */
  readonly roundScores = signal<number[]>([]);
  /** Keying speed of each completed round in WPM (0 when none was measured) */
  readonly roundSpeeds = signal<number[]>([]);
  /** Keying speed of the round on screen in WPM (0 until measured) */
  readonly keyedWpm = signal(0);

  /** True while Send practice is the active mode */
  readonly active = computed(() => this.settings.settings().encoderMode === 'send-practice');
  /** True while the content is an e-book: the book is keyed along, with no rounds or scoring */
  readonly ebookMode = computed(() => this.active() && this.settings.settings().sendPracticeContentMode === 'ebook');
  /** Check mode in effect (Koch method always checks at the end) */
  readonly checkMode = computed(() => this.settings.settings().sendPracticeCheckMode);
  /** Whether at least one picked key can currently produce keying */
  readonly inputsReady = computed(() => sendPracticeHasActiveInput(this.settings.settings()));
  /** Whether the session has more than one round */
  readonly isMultiRound = computed(() => this.settings.settings().sendPracticeRounds > 1
    && this.settings.settings().sendPracticeContentMode !== 'ebook');
  readonly isSessionSummary = computed(() => this.sessionStage() === 'summary');
  readonly currentRound = computed(() => this.roundScores().length + 1);
  /** Whether a multi-round briefing or summary is on screen (only those stages show prompt text) */
  readonly promptShowing = computed(() => this.sessionStage() === 'briefing' || this.sessionStage() === 'summary');
  /** The prompt is playing as sound ("Hear it first") */
  readonly promptPlaying = computed(() => this.encoder.replayPending());

  readonly accuracy = computed(() => practiceAccuracy(this.feedback()));
  readonly averageRoundScore = computed(() => {
    const scores = this.roundScores();
    return scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : 0;
  });
  /** Average speed of the rounds that measured one */
  readonly averageSpeed = computed(() => {
    const speeds = this.roundSpeeds().filter(wpm => wpm > 0);
    return speeds.length ? Math.round(speeds.reduce((total, wpm) => total + wpm, 0) / speeds.length) : 0;
  });

  /** The last Koch lesson was passed on screen: drives the fireworks */
  readonly kochFinished = computed(() => {
    const accuracy = this.sessionStage() === 'summary'
      ? this.averageRoundScore()
      : (!this.isMultiRound() && this.feedback().length > 0 ? this.accuracy() : 0);
    return sendKochRecommendation(this.settings.settings(), accuracy)?.kind === 'complete';
  });

  /** Where the keyed characters stand against the whole prompt (spaces left out of both) */
  readonly alignment = computed(() => alignKeying(this.promptChars(), this.keyedChars()));

  /**
   * What was keyed, each character marked right or wrong by the alignment: a character
   * that matched is right, a wrong or repeated one is wrong, however many came before it.
   */
  readonly keyedMarks = computed<SendPracticeMark[]>(() => {
    const marks = this.alignment().keyed;
    let n = 0;
    return [...this.keyedText()].map(char => char === ' '
      ? { char, result: 'space' as const }
      : { char, result: marks[n++] });
  });

  /**
   * The prompt for display: the character to key next is `current` in every check mode;
   * "As you go" also marks what is already right or wrong.
   */
  readonly promptMarks = computed<SendPromptMark[]>(() => {
    const a = this.alignment();
    const live = this.checkMode() === 'live';
    const keying = this.state() === 'keying';
    let n = 0;
    return [...this.referenceText()].map(char => {
      if (char === ' ') return { char, state: 'space' as const };
      const i = n++;
      if (keying && i === a.position) return { char, state: 'current' as const };
      if (live && i < a.position) return { char, state: a.ref[i] === 'correct' ? 'correct' as const : 'incorrect' as const };
      return { char, state: 'plain' as const };
    });
  });

  /** The character to key next (empty when nothing is left to key) */
  readonly hintChar = computed(() => this.promptChars()[this.alignment().position] ?? '');
  /** Dots and dashes of that character */
  readonly hintPattern = computed(() => MORSE_TABLE[this.hintChar()] ?? '');

  private readonly generator = new PracticeSequenceGenerator();
  private lockedInput: string | null = null;
  private wpmSamples: number[] = [];
  private lastTaggedLen = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private finishedAt = 0;
  private lessonJump = false;
  /** The e-book being keyed (null when none): the character to key next, and the position last shown for it */
  private ebookCursor: EbookCursor | null = null;
  private ebookShown: EbookPosition | null = null;

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
    private decoder: MorseDecoderService,
    private displayBuffers: DisplayBufferService,
    private kochHelp: KochHelpService,
    private ebook: EbookService,
  ) {
    // Collect the keying of the picked keys while a prompt waits to be keyed
    effect(() => {
      const tagged = this.decoder.taggedOutput();
      untracked(() => {
        if (tagged.length < this.lastTaggedLen) this.lastTaggedLen = tagged.length;
        for (let i = this.lastTaggedLen; i < tagged.length; i++) this.accept(tagged[i]);
        this.lastTaggedLen = tagged.length;
      });
    });

    // The reading was moved from outside (a click on the text, the Book dialog): the next character is the one there
    effect(() => {
      const moved = this.ebook.position();
      this.ebook.revision();
      untracked(() => this.followEbook(moved));
    });

    // A click on the text would also key when the mouse is one of the keys: only the Book dialog moves the reading then
    effect(() => {
      const s = this.settings.settings();
      const locked = this.ebookMode() && s.mouseKeyerEnabled && s.sendPracticeInputs.includes('mouse');
      untracked(() => this.ebook.jumpLocked.set(locked));
    });

    // Switching the content away from the book ends the reading
    effect(() => {
      if (!this.ebookMode()) untracked(() => this.ebookCursor && this.abort());
    });

    // Leaving Send practice from anywhere (Settings, presets, the wizard) drops the round
    effect(() => {
      if (!this.active()) {
        untracked(() => {
          if (this.state() !== 'idle' || this.sessionStage() !== 'none' || this.referenceText() !== '') this.reset();
        });
      }
    });
  }

  /** Label of the single action button for the current state. */
  actionLabel(): string {
    if (!this.isMultiRound()) {
      return this.state() === 'keying' ? 'Check' : this.state() === 'finished' ? 'Next sequence' : 'Start';
    }
    switch (this.sessionStage()) {
      case 'none': return 'Show session briefing';
      case 'briefing': return 'Start round 1';
      case 'in-progress': return 'Check';
      case 'round-feedback':
        return this.roundScores().length >= this.settings.settings().sendPracticeRounds
          ? 'View session summary'
          : `Start round ${this.currentRound()}`;
      case 'summary': return 'Start new session';
    }
  }

  /** The one action: start, check, next round or next session step, by the current state. */
  advance(): void {
    if (!this.inputsReady() && this.state() === 'idle') return;
    if (this.ebookMode()) {
      this.beginEbook();
      return;
    }
    if (!this.isMultiRound()) {
      if (this.state() === 'keying') this.checkNow();
      else this.start();
      return;
    }
    switch (this.sessionStage()) {
      case 'none':
        this.sessionStage.set('briefing');
        return;
      case 'briefing':
        this.startRound();
        return;
      case 'in-progress':
        if (this.state() === 'keying') this.checkNow();
        return;
      case 'round-feedback':
        if (this.roundScores().length >= this.settings.settings().sendPracticeRounds) {
          this.feedback.set([]);
          this.keyedText.set('');
          this.sessionStage.set('summary');
        } else {
          this.startRound();
        }
        return;
      case 'summary':
        this.roundScores.set([]);
        this.roundSpeeds.set([]);
        this.referenceText.set('');
        this.feedback.set([]);
        this.keyedText.set('');
        this.keyedWpm.set(0);
        this.state.set('idle');
        this.sessionStage.set('briefing');
    }
  }

  /**
   * Generate a new prompt and wait for the keying. In a Koch lesson the first start plays the new
   * characters, and the start after that counts down first (see `KochHelpService.beforeRound`).
   */
  start(): void {
    if (this.kochHelp.beforeRound('send', () => this.start())) return;
    this.begin();
  }

  private begin(): void {
    if (this.settings.settings().sendPracticeContentMode === 'ebook') {
      this.beginEbook();
      return;
    }
    this.stopPrompt();
    this.clearGrace();
    this.referenceText.set(this.generator.generate(this.contentOptions()));
    this.feedback.set([]);
    this.keyedText.set('');
    this.keyedWpm.set(0);
    this.lockedInput = null;
    this.wpmSamples = [];
    // Nothing from before the prompt may count, and no half-keyed character may linger
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.state.set('keying');
  }

  /** Score what was keyed so far and end the round. */
  checkNow(): void {
    if (this.state() === 'keying' && !this.ebookMode()) this.finishRound();
  }

  /** Play the character to key next as sound on this device only ("Hear it first"). */
  playPrompt(): void {
    const next = this.hintChar();
    if (next && this.state() === 'keying') this.encoder.startReplay(next, true);
  }

  /** Stop the prompt sound. */
  stopPrompt(): void {
    if (this.encoder.replayPending()) this.encoder.stopReplay();
  }

  /** Abort the round or session without a result. */
  abort(): void {
    this.ebookCursor = null;
    this.ebookShown = null;
    this.kochHelp.cancelPending();
    this.stopPrompt();
    this.clearGrace();
    this.state.set('idle');
    this.feedback.set([]);
    this.keyedText.set('');
    this.keyedWpm.set(0);
    this.lockedInput = null;
    this.wpmSamples = [];
    this.sessionStage.set('none');
    this.roundScores.set([]);
    this.roundSpeeds.set([]);
  }

  /** Stop and forget everything (called when leaving Send practice). */
  reset(): void {
    this.abort();
    this.referenceText.set('');
    this.generator.clearUsedWords();
  }

  /**
   * Move to a Koch lesson from the results and start its first round straight away
   * (nothing is sent anywhere). The lesson change would also clear the screen through
   * `ClearService`; `takeLessonJump()` tells it this change is ours.
   */
  goToKochLesson(lesson: number): void {
    this.lessonJump = this.settings.settings().sendPracticeKochLesson !== lesson;
    this.settings.update({ sendPracticeKochLesson: lesson });
    this.abort();
    this.referenceText.set('');
    this.displayBuffers.clearAll();
    if (this.isMultiRound()) {
      // If the lesson help takes over, the briefing waits for the next Start
      this.sessionStage.set('briefing');
      this.startRound();
    } else {
      this.start();
    }
  }

  /** True once after `goToKochLesson` changed the lesson: the screen must not be cleared for it. */
  takeLessonJump(): boolean {
    const jump = this.lessonJump;
    this.lessonJump = false;
    return jump;
  }

  private startRound(): void {
    if (this.kochHelp.beforeRound('send', () => this.startRound())) return;
    this.sessionStage.set('in-progress');
    this.start();
  }

  private contentOptions(): PracticeContentOptions {
    const s = this.settings.settings();
    return {
      contentMode: s.sendPracticeContentMode,
      groupCount: s.sendPracticeGroupCount,
      charGroupSize: s.sendPracticeCharGroupSize,
      includeLetters: s.sendPracticeIncludeLetters,
      includeNumbers: s.sendPracticeIncludeNumbers,
      includePunctuation: s.sendPracticeIncludePunctuation,
      kochLesson: s.sendPracticeKochLesson,
      wordLengths: s.sendPracticeWordLengths,
    };
  }

  /** Take one decoded entry into the round if it comes from a picked key. */
  private accept(entry: ReturnType<MorseDecoderService['taggedOutput']>[number]): void {
    if (entry.fromRtdb) return;
    const id = sendPracticeInputId(entry.inputPath);
    if (!id || !this.settings.settings().sendPracticeInputs.includes(id)) return;

    if (this.ebookMode()) {
      this.acceptEbook(entry, id);
      return;
    }

    // Without a round on screen (the first one, or after a result), the next keyed character
    // starts one, like pressing the button; that character is only the trigger
    if (this.state() !== 'keying') {
      if (entry.char !== ' ' && this.active() && Date.now() - this.finishedAt > NEXT_KEY_GUARD_MS) this.advance();
      return;
    }
    if (this.lockedInput && this.lockedInput !== id) return;

    const keyed = this.keyedText();
    if (entry.char === ' ') {
      // A word gap; leading and repeated gaps carry nothing
      if (keyed !== '' && !keyed.endsWith(' ')) this.keyedText.set(keyed + ' ');
      return;
    }
    this.lockedInput = id;
    if (entry.char === ERASE_PROSIGN) {
      this.keyedText.set(keyed.trimEnd().slice(0, -1));
    } else {
      // Other prosigns cannot match a single prompt character
      this.keyedText.set(keyed + (entry.char.length === 1 ? entry.char : '?'));
      if (entry.wpm) this.wpmSamples.push(entry.wpm);
    }
    this.evaluateProgress();
  }

  // ---- E-book ----

  /** Start keying the book from the reading position (the start again when it has been keyed to the end). */
  private beginEbook(): void {
    if (!this.ebook.loaded()) return;
    if (this.ebook.atEnd) {
      void this.ebook.startOver().then(() => {
        if (!this.ebook.atEnd) this.beginEbook();
      });
      return;
    }
    const window = this.ebook.text;
    if (!window) return;
    this.stopPrompt();
    this.clearGrace();
    this.referenceText.set('');
    this.feedback.set([]);
    this.keyedText.set('');
    this.lockedInput = null;
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.ebookCursor = new EbookCursor(window, this.ebook.position());
    this.state.set('keying');
    this.showEbook();
  }

  /** A character arrived from a picked key. */
  private acceptEbook(entry: ReturnType<MorseDecoderService['taggedOutput']>[number], id: string): void {
    // Without the book being keyed, the next keyed character starts it, like pressing the button
    if (this.state() !== 'keying') {
      if (entry.char === ' ' || !this.active() || Date.now() - this.finishedAt <= NEXT_KEY_GUARD_MS) return;
      this.beginEbook();
      if (this.state() !== 'keying') return;
    }
    // Word gaps and the error prosign carry nothing here: only the right character moves the reading on,
    // so any of the picked keys may be used (there is nothing for two keys to interleave)
    if (entry.char === ' ' || entry.char === ERASE_PROSIGN) return;
    const cursor = this.ebookCursor;
    const expected = cursor?.current;
    if (!cursor || !expected) return;
    if (entry.char.length === 1 && entry.char.toUpperCase() === expected.char) {
      cursor.advance();
      this.showEbook();
    }
  }

  /** Show the character to key next in the reader, or finish at the end of the book. */
  private showEbook(): void {
    const cursor = this.ebookCursor;
    if (!cursor) return;
    this.ebookShown = cursor.position;
    this.ebook.reportPosition(cursor.position);
    if (cursor.ended) {
      this.ebookCursor = null;
      this.finishedAt = Date.now();
      this.state.set('finished');
    } else if (cursor.pending) {
      // The next block is still being read
      void cursor.window.ensure(cursor.blockIndex).then(() => {
        if (this.ebookCursor !== cursor) return;
        cursor.settle();
        this.showEbook();
      });
    }
  }

  /** The reading was moved from outside while keying: the character to key next is the one there. */
  private followEbook(moved: EbookPosition): void {
    const cursor = this.ebookCursor;
    const window = this.ebook.text;
    if (!cursor || !window) return;
    const shown = this.ebookShown;
    if (cursor.window === window && shown && shown.block === moved.block && shown.at === moved.at) return;
    this.ebookCursor = new EbookCursor(window, moved);
    this.showEbook();
  }

  /**
   * Decide after each keyed character whether the round is over. Everything right ends it
   * at once. Once the keying has reached the end of the prompt, or is as long as the prompt,
   * with mistakes still in it, the user gets a few seconds for corrections (any further
   * character restarts the wait) before the round ends by itself. "At the end (Manual)"
   * never ends by itself.
   */
  private evaluateProgress(): void {
    this.clearGrace();
    if (this.checkMode() === 'manual' || this.state() !== 'keying') return;
    const a = this.alignment();
    const total = this.promptChars().length;
    if (total > 0 && a.position === total && a.ref.every(mark => mark === 'correct')) {
      this.finishRound();
    } else if (a.position >= total || a.keyed.length >= total) {
      // Clearly done: the character just keyed is right and is the prompt's last one
      const sure = a.position === total && a.ref[total - 1] === 'correct' && a.keyed[a.keyed.length - 1] === 'correct';
      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        if (this.state() === 'keying') this.finishRound();
      }, sure ? SEND_FINISH_SURE_MS : SEND_FINISH_GRACE_MS);
    }
  }

  private clearGrace(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  /** The prompt without its word gaps */
  private promptChars(): string[] {
    return [...this.referenceText()].filter(ch => ch !== ' ');
  }

  /** The keyed characters without word gaps */
  private keyedChars(): string[] {
    return [...this.keyedText()].filter(ch => ch !== ' ');
  }

  private finishRound(): void {
    this.clearGrace();
    const keyed = this.keyedText().trimEnd();
    this.keyedText.set(keyed);
    // Result per prompt character; word gaps are never scored
    const marks = this.alignment().ref;
    let n = 0;
    this.feedback.set([...this.referenceText()].map((ref): PracticeFeedback => {
      if (ref === ' ') return { ref, result: 'correct' };
      const mark = marks[n++];
      return { ref, result: mark === 'correct' ? 'correct' : mark === 'incorrect' ? 'incorrect' : 'missed' };
    }));
    const wpm = this.wpmSamples.length
      ? Math.round(this.wpmSamples.reduce((total, w) => total + w, 0) / this.wpmSamples.length)
      : 0;
    this.keyedWpm.set(wpm);
    this.finishedAt = Date.now();
    this.state.set('finished');
    if (this.isMultiRound()) {
      this.roundScores.update(scores => [...scores, this.accuracy()]);
      this.roundSpeeds.update(speeds => [...speeds, wpm]);
      this.sessionStage.set('round-feedback');
    }
  }
}
