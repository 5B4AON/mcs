/**
 * Morse Code Studio
 */

import { Injectable, signal, computed, effect, untracked } from '@angular/core';
import { SettingsService } from './settings.service';
import { DecoderSource } from './settings-common';
import { MorseEncoderService } from './morse-encoder.service';
import { KochHelpService } from './koch-help.service';
import { DisplayBufferService } from './display-buffer.service';
import { EbookService } from './ebook.service';
import { EbookFeed } from './ebook-feed';
import { EbookPosition } from './ebook-model';
import { EbookTypedTracker, TypedCell } from './ebook-typed';
import { pauseQuarters } from '../morse-table';
import { PracticeContentOptions, PracticeSequenceGenerator } from './practice-content';
import { PracticeFeedback, alignPractice, practiceAccuracy } from './practice-scoring';
import { effectivePracticeFeedbackMode } from '../components/settings-items/practice/practice-item.model';
import { ReplayUnit, lastReplayPart } from './replay-units';
import { kochRecommendation } from '../components/settings-items/practice/practice-ui.utils';

export type { PracticeFeedback } from './practice-scoring';

/** E-book playback: the encoder is fed this many characters at a time, and again when fewer than the second number are left */
const EBOOK_CHUNK_CHARS = 250;
const EBOOK_TOP_UP_AT = 120;

/** Practice playback state */
export type PracticeState = 'idle' | 'playing' | 'paused' | 'finished';
/** Current phase of a multi-round Type-along session */
export type PracticeSessionStage = 'none' | 'briefing' | 'in-progress' | 'round-feedback' | 'summary';

/**
 * Practice Service — generates sequences and manages playback state
 * for Copy Practice mode.
 *
 * The service generates a text sequence (random characters, words, or
 * callsigns), feeds it through the MorseEncoderService for audio
 * playback, and pushes decoded characters directly to the display
 * buffers (bypassing acoustic decode).  After the sequence finishes,
 * the user's typed input is compared to the reference using LCS-based
 * fuzzy alignment for per-character feedback.
 */
@Injectable({ providedIn: 'root' })
export class PracticeService {
  /** Current practice playback state */
  readonly state = signal<PracticeState>('idle');

  /** The generated reference sequence (uppercased, space-separated groups) */
  readonly referenceText = signal('');

  /**
   * The finished sequence, or the completed part of a paused sequence. For a book it is the text still in the
   * encoder's buffer (the end of what has played), without the pauses between its words.
   */
  readonly replayableText = computed(() => {
    const state = this.state();
    if (this.ebookActive()) {
      const buffer = this.encoder.buffer();
      const text = state === 'finished' ? buffer : state === 'paused' ? buffer.slice(0, this.encoder.sentIndex()) : '';
      return Array.from(text).filter(c => pauseQuarters(c) === 0).join('').trim();
    }
    if (state === 'finished') return this.referenceText();
    if (state === 'paused') return this.encoder.buffer().slice(0, this.encoder.sentIndex()).trim();
    return '';
  });

  /** Per-character feedback after a round (empty until 'finished') */
  readonly feedback = signal<PracticeFeedback[]>([]);
  /** What was typed under each reference character when the feedback was computed, in step with it */
  readonly feedbackTyped = signal<string[]>([]);

  /** User-typed input text (shared between main screen and fullscreen) */
  readonly userInput = signal('');

  /** Current multi-round session phase; never persisted */
  readonly sessionStage = signal<PracticeSessionStage>('none');
  /** Completed round percentages for the current multi-round session */
  readonly roundScores = signal<number[]>([]);
  /** Feedback mode in effect: Koch method is always Type-along */
  readonly feedbackMode = computed(() => effectivePracticeFeedbackMode(this.settings.settings()));
  /** Whether the configured Type-along exercise has multiple rounds */
  readonly isMultiRoundTypeAlong = computed(() =>
    this.feedbackMode() === 'typealong'
    && this.settings.settings().practiceContentMode !== 'ebook'
    && this.settings.settings().practiceRounds > 1
  );
  /** Whether the current practice result area shows a multi-round summary */
  readonly isSessionSummary = computed(() => this.sessionStage() === 'summary');
  /** Current round number for an active multi-round session */
  readonly currentRound = computed(() => this.roundScores().length + 1);
  /** Whether a multi-round briefing or summary is on screen (only those stages show prompt text) */
  readonly promptShowing = computed(() => this.sessionStage() === 'briefing' || this.sessionStage() === 'summary');

  /** The result on screen completes the last Koch lesson with a recommendation to celebrate (drives the fireworks) */
  readonly kochFinished = computed(() => {
    const accuracy = this.sessionStage() === 'summary'
      ? this.averageRoundScore()
      : (!this.isMultiRoundTypeAlong() && this.feedback().length > 0 ? this.accuracy() : 0);
    return kochRecommendation(this.settings.settings(), accuracy)?.kind === 'complete';
  });

  /** Unweighted average of the completed round percentages */
  readonly averageRoundScore = computed(() => {
    const scores = this.roundScores();
    return scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : 0;
  });

  /** Accuracy percentage (correct / total reference chars, ignoring spaces) */
  readonly accuracy = computed(() => practiceAccuracy(this.feedback()));

  /** Builds the sequences and remembers recent characters and used words */
  private readonly generator = new PracticeSequenceGenerator();
  private replayReturnState: 'paused' | 'finished' | null = null;

  /**
   * True when a replay has ended and the practice is back at the paused place: it then waits
   * for Resume (button or Enter), which the play buttons point out by pulsing.
   */
  readonly awaitingResume = signal(false);

  /** The e-book being played (null for the other content), and where each character of the encoder's buffer sits in the book */
  private ebookFeed: EbookFeed | null = null;
  private ebookPositions: EbookPosition[] = [];
  private ebookTrimmed = 0;
  private ebookFeeding = false;
  /** Changes whenever a playback starts or ends, so a read that was under way for an earlier one is dropped */
  private ebookRun = 0;
  private readonly ebookActive = signal(false);
  /** Lines what is typed up with the characters played, for the reader to draw under them (Type-along with a book) */
  private readonly ebookTyped = new EbookTypedTracker();
  /** For each character of the encoder's buffer: how many played characters (not pauses) came before it */
  private ebookSlotsBefore: number[] = [];
  /** How many characters of the book have started to sound, the one sounding included */
  private readonly ebookPlayed = signal(0);
  /** The displayed characters whose cell changed, in order; each reader keeps its own place in it (see `ebookCellsSince`) */
  private ebookCellLog: string[] = [];
  private ebookCellLogBase = 0;
  /** Counts changes of the cells under the book, for the readers to pick them up with `ebookCellsSince()` */
  readonly ebookTypedRevision = signal(0);

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
    private displayBuffers: DisplayBufferService,
    private kochHelp: KochHelpService,
    private ebook: EbookService,
  ) {
    // The reader follows the character that is sounding, and the encoder is topped up as it plays
    effect(() => {
      const sent = this.encoder.sentIndex();
      const trimmed = this.encoder.trimmed();
      untracked(() => this.onEbookProgress(sent, trimmed));
    });
    // What is typed lines up under the characters of the book that have played
    effect(() => {
      const typed = this.feedbackMode() === 'typealong' ? this.userInput() : '';
      const played = this.ebookPlayed();
      untracked(() => this.alignEbookTyping(typed, played));
    });
    // The reading cannot be jumped while the book plays itself
    effect(() => {
      const playing = this.ebookActive() && this.state() === 'playing';
      untracked(() => this.ebook.playing.set(playing));
    });
  }

  /**
   * Generate a new sequence and start playback. In a Koch lesson the first start plays the new
   * characters, and the start after that counts down first (see `KochHelpService.beforeRound`).
   */
  start(): void {
    if (this.kochHelp.beforeRound('copy', () => this.start())) return;
    this.begin();
  }

  private begin(): void {
    if (this.settings.settings().practiceContentMode === 'ebook') {
      this.beginEbook();
      return;
    }
    const text = this.generateSequence();
    this.referenceText.set(text);
    this.feedback.set([]);
    this.userInput.set('');
    this.playSequence(text);
  }

  /**
   * Advance a Type-along session without changing the single-round flow.
   *
   * Multi-round sessions show a briefing before playback and retain only
   * round percentages until the summary is shown.
   */
  advanceTypeAlongSession(): void {
    // A book is checked once it has finished and the learner says so (the typing may not be done), then read again
    if (this.settings.settings().practiceContentMode === 'ebook') {
      if (this.state() === 'finished' && this.feedback().length === 0) this.scoreEbook();
      else this.start();
      return;
    }
    if (!this.isMultiRoundTypeAlong()) {
      if (this.state() === 'finished' && this.feedback().length === 0) {
        this.computeFeedback(this.userInput());
        return;
      }
      if (this.state() === 'finished') {
        this.next();
      } else {
        this.start();
      }
      return;
    }

    switch (this.sessionStage()) {
      case 'none':
        this.sessionStage.set('briefing');
        return;
      case 'briefing':
        this.startMultiRound();
        return;
      case 'in-progress':
        if (this.state() === 'finished' && this.feedback().length === 0) {
          this.computeFeedback(this.userInput());
          this.roundScores.update(scores => [...scores, this.accuracy()]);
          this.sessionStage.set('round-feedback');
        }
        return;
      case 'round-feedback':
        if (this.roundScores().length >= this.settings.settings().practiceRounds) {
          this.feedback.set([]);
          this.userInput.set('');
          this.sessionStage.set('summary');
        } else {
          this.startMultiRound();
        }
        return;
      case 'summary':
        this.roundScores.set([]);
        this.referenceText.set('');
        this.feedback.set([]);
        this.userInput.set('');
        this.state.set('idle');
        this.sessionStage.set('briefing');
    }
  }

  /** Retry the same sequence */
  retry(): void {
    const text = this.referenceText();
    if (!text) return;
    this.feedback.set([]);
    this.playSequence(text);
  }

  /** True when a paused sequence stopped in the middle of a group, word or callsign. */
  readonly pausedMidWord = computed(() => {
    if (this.state() !== 'paused') return false;
    const buffer = this.encoder.buffer();
    const sent = this.encoder.sentIndex();
    // The pauses a book puts between its words count as gaps
    const gap = (c: string): boolean => c === ' ' || pauseQuarters(c) > 0;
    return sent > 0 && sent < buffer.length && !gap(buffer[sent - 1]) && !gap(buffer[sent]);
  });

  /**
   * Replay the end of the completed part of a paused or finished sequence (all of it by default)
   * without drawing it again. A word or group replay from a pause in the middle of one starts at
   * the full one before it.
   */
  replay(unit: ReplayUnit = 'line'): void {
    const state = this.state();
    if (state !== 'paused' && state !== 'finished') return;
    const text = lastReplayPart(this.replayableText(), unit, this.pausedMidWord());
    if (!text || !this.encoder.startReplay(text)) return;
    this.replayReturnState = state;
    this.awaitingResume.set(false);
    this.state.set('playing');
  }

  /** Stop a replay and return to the paused or finished sequence. */
  stopReplay(): void {
    this.encoder.stopReplay();
    if (this.replayReturnState !== null) {
      this.awaitingResume.set(this.replayReturnState === 'paused');
      this.state.set(this.replayReturnState);
      this.replayReturnState = null;
    }
  }

  /** Generate a new sequence and start */
  next(): void {
    this.start();
  }

  /** Pause playback; the character that is sounding finishes first, so resume goes on with the next one. */
  pause(): void {
    if (this.state() === 'playing') {
      this.encoder.pauseTx();
      this.state.set('paused');
    }
  }

  /** Resume playback from where we left off */
  resume(): void {
    if (this.state() === 'paused') {
      this.awaitingResume.set(false);
      // The score of a book is of what has played so far: playing on starts a new look
      if (this.ebookFeed) {
        this.feedback.set([]);
      }
      // The reading was moved while paused (a click, the Book dialog): play on from there
      if (this.ebookFeed) {
        const here = this.ebookPositions[this.encoder.sentIndex()];
        const now = this.ebook.position();
        if (!here || here.block !== now.block || here.at !== now.at) {
          this.beginEbook();
          return;
        }
      }
      // A lesson help playing over the pause gives way to the lesson
      if (this.replayReturnState === null && this.encoder.replayMode()) this.encoder.stopReplay();
      this.state.set('playing');
      this.encoder.startTx();
    }
  }

  /** Abort current practice session */
  abort(): void {
    this.endEbook();
    this.kochHelp.cancelPending();
    this.encoder.stopTx();
    this.encoder.clearBuffer();
    this.replayReturnState = null;
    this.awaitingResume.set(false);
    this.state.set('idle');
    this.feedback.set([]);
    this.userInput.set('');
    this.sessionStage.set('none');
    this.roundScores.set([]);
  }

  /**
   * Move to a Koch lesson from the results and return to the idle practice
   * state, so the next Start plays the new lesson. Starts no output.
   */
  goToKochLesson(lesson: number): void {
    this.settings.update({ practiceKochLesson: lesson });
    this.abort();
    this.referenceText.set('');
    this.displayBuffers.clearAll();
  }

  /** Stop and reset (called when switching away from practice mode) */
  reset(): void {
    this.abort();
    this.referenceText.set('');
    this.generator.clearUsedWords();
  }

  /**
   * Compute per-character feedback by aligning user input to the
   * reference text (longest common subsequence, see practice-scoring.ts).
   */
  computeFeedback(userInput: string): void {
    const { feedback, typedUnder } = alignPractice(this.referenceText(), userInput);
    this.feedbackTyped.set(typedUnder);
    this.feedback.set(feedback);
  }

  /**
   * Label the next type-along action for the visible control and guide.
   */
  typeAlongActionLabel(): string {
    if (this.state() === 'playing') return 'Pause';
    if (this.state() === 'paused') return 'Resume';
    if (this.settings.settings().practiceContentMode === 'ebook') {
      return this.state() === 'finished' && this.feedback().length === 0 ? 'Validate' : 'Start';
    }
    if (!this.isMultiRoundTypeAlong()) {
      return this.state() === 'finished' && this.feedback().length === 0
        ? 'Validate'
        : this.state() === 'finished'
          ? 'Next sequence'
          : 'Start';
    }
    switch (this.sessionStage()) {
      case 'none': return 'Show session briefing';
      case 'briefing': return 'Start round 1';
      case 'in-progress': return 'Validate';
      case 'round-feedback':
        return this.roundScores().length >= this.settings.settings().practiceRounds
          ? 'View session summary'
          : `Start round ${this.currentRound()}`;
      case 'summary': return 'Start new session';
    }
  }

  // ---- Sequence generation ----

  private generateSequence(): string {
    const s = this.settings.settings();
    const options: PracticeContentOptions = {
      contentMode: s.practiceContentMode,
      groupCount: s.practiceGroupCount,
      charGroupSize: s.practiceCharGroupSize,
      includeLetters: s.practiceIncludeLetters,
      includeNumbers: s.practiceIncludeNumbers,
      includePunctuation: s.practiceIncludePunctuation,
      kochLesson: s.practiceKochLesson,
      wordLengths: s.practiceWordLengths,
    };
    return this.generator.generate(options);
  }

  // ---- Playback ----

  private playSequence(text: string): void {
    // Clear previous display + encoder state
    this.displayBuffers.clearAll();
    this.encoder.clearBuffer();
    this.replayReturnState = null;
    this.awaitingResume.set(false);

    this.state.set('playing');

    // Feed text into encoder for audio playback
    this.encoder.submitText(text);
  }

  /** Start the next playback round in the current multi-round session. */
  private startMultiRound(): void {
    if (this.kochHelp.beforeRound('copy', () => this.startMultiRound())) return;
    this.sessionStage.set('in-progress');
    this.start();
  }

  /**
   * Called by the app component when the encoder finishes sending
   * (isSending transitions from true to false while in practice mode).
   */
  onEncoderFinished(): void {
    if (this.state() !== 'playing') return;
    // A replay of what has played (also in a book) ends back at the place it started from
    if (this.encoder.replayPending()) {
      this.state.set('paused');
      return;
    }
    if (this.replayReturnState !== null) {
      this.awaitingResume.set(this.replayReturnState === 'paused');
      this.state.set(this.replayReturnState);
      this.replayReturnState = null;
      return;
    }
    if (this.ebookFeed) {
      // The buffer ran dry: more of the book is read, or this was the end
      if (this.ebookFeeding) return;
      if (!this.ebookFeed.done) {
        void this.feedEbook();
        return;
      }
      if (this.encoder.sentIndex() < this.encoder.buffer().length) {
        this.state.set('paused');
      } else {
        this.ebook.reportPosition(this.ebookFeed.endPosition);
        this.state.set('finished');

      }
      return;
    }
    this.state.set(this.encoder.sentIndex() < this.encoder.buffer().length ? 'paused' : 'finished');
  }

  // ---- E-book playback ----

  /** Play the book from the reading position (the start again when it has been played to the end). */
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
    this.endEbook();
    this.encoder.clearBuffer();
    this.replayReturnState = null;
    this.awaitingResume.set(false);
    this.referenceText.set('');
    this.feedback.set([]);
    this.userInput.set('');
    this.ebookFeed = new EbookFeed(window, this.ebook.position());
    this.ebookActive.set(true);
    this.state.set('playing');
    void this.feedEbook();
  }

  /** Forget the e-book playback (the reading position stays where it is). */
  private endEbook(): void {
    this.ebookRun++;
    this.ebookFeed = null;
    this.markEbookTyped(this.ebookTyped.reset());
    this.ebookSlotsBefore = [];
    this.ebookPlayed.set(0);
    this.ebookPositions = [];
    this.ebookTrimmed = 0;
    this.ebookFeeding = false;
    this.ebookActive.set(false);
  }

  /** Read the next piece of the book into the encoder, and start it if it had run dry. */
  private async feedEbook(): Promise<void> {
    const feed = this.ebookFeed;
    if (!feed || this.ebookFeeding || feed.done) return;
    const run = this.ebookRun;
    this.ebookFeeding = true;
    try {
      const chunk = await feed.next(EBOOK_CHUNK_CHARS);
      if (run !== this.ebookRun) return;
      if (chunk) {
        this.trackEbookChunk(chunk.text, chunk.positions);
        this.ebookPositions.push(...chunk.positions);
        this.encoder.appendText(chunk.text);
      }
    } catch {
      // The file could not be read any further: stop here, with the reading where it was
      if (run === this.ebookRun) this.abort();
      return;
    } finally {
      if (run === this.ebookRun) this.ebookFeeding = false;
    }
    if (this.state() !== 'playing' || this.encoder.isSending()) return;
    if (this.encoder.sentIndex() < this.encoder.buffer().length) this.encoder.startTx();
    else this.onEncoderFinished();
  }

  /** How many played characters there are up to and including the buffer's token at an index (a pause or a prosign adds none). */
  private ebookSlotsThrough(index: number): number {
    const buffer = this.encoder.buffer();
    if (index >= buffer.length) return this.ebookTyped.slotCount;
    const { endIdx } = this.encoder.extractToken(buffer, index);
    return this.ebookSlotsBefore[endIdx] ?? this.ebookTyped.slotCount;
  }

  /** The encoder has moved on: the reader follows the sounding character, and the buffer is topped up. */
  private onEbookProgress(sent: number, trimmed: number): void {
    const feed = this.ebookFeed;
    if (!feed) return;
    if (trimmed > this.ebookTrimmed) {
      this.ebookPositions.splice(0, trimmed - this.ebookTrimmed);
      this.ebookSlotsBefore.splice(0, trimmed - this.ebookTrimmed);
      this.ebookTrimmed = trimmed;
    }
    const before = this.ebookSlotsBefore[sent];
    this.ebookPlayed.set(before === undefined
      ? this.ebookTyped.slotCount
      : this.ebookSlotsThrough(sent));
    const here = this.ebookPositions[sent];
    if (here) this.ebook.reportPosition(here);
    else if (feed.done) this.ebook.reportPosition(feed.endPosition);
    if (this.ebookPositions.length - sent < EBOOK_TOP_UP_AT && !feed.done) void this.feedEbook();
  }

  /**
   * Note which characters of a piece of the book are played (pauses are not) and where each sits, for the typing to line up with.
   * A prosign such as <AR> is not typed and not scored: it has no slot, and the gap after it, when a gap came before it, is dropped.
   */
  private trackEbookChunk(text: string, positions: EbookPosition[]): void {
    let chars = '';
    const slotPositions: EbookPosition[] = [];
    let count = this.ebookTyped.slotCount;
    let last = this.ebookTyped.lastChar;
    for (let i = 0; i < text.length;) {
      const { token, endIdx } = this.encoder.extractToken(text, i);
      for (let k = i; k < endIdx; k++) this.ebookSlotsBefore.push(count);
      const sign = token.length > 1 && pauseQuarters(token) === 0;
      if (!sign && pauseQuarters(token) === 0 && !(token === ' ' && last === ' ')) {
        chars += token;
        slotPositions.push(positions[i]);
        count++;
        last = token;
      }
      i = endIdx;
    }
    this.ebookTyped.addSlots(chars, slotPositions);
  }

  private alignEbookTyping(typed: string, played: number): void {
    if (!this.ebookFeed && typed === '') return;
    this.markEbookTyped(this.ebookTyped.update(typed, played));

  }

  private markEbookTyped(keys: string[]): void {
    if (!keys.length) return;
    this.ebookCellLog.push(...keys);
    if (this.ebookCellLog.length > 4000) {
      this.ebookCellLog.splice(0, 2000);
      this.ebookCellLogBase += 2000;
    }
    this.ebookTypedRevision.update(n => n + 1);
  }

  /** Where the log of changed cells ends now; a reader that has seen everything up to it asks `ebookCellsSince` with it. */
  ebookCellLogEnd(): number {
    return this.ebookCellLogBase + this.ebookCellLog.length;
  }

  /**
   * The cells of the book's displayed characters that changed since `position` in the log (a position from `ebookCellLogEnd`),
   * each with what to draw: the typed text under it and how it compares so far. A reader that is new, or has fallen too far
   * behind, passes -1 and gets every cell there is. Every reader (the main screen's and the full screen's) keeps its own place,
   * so none of them takes the changes from another.
   */
  ebookCellsSince(position: number): [string, TypedCell][] {
    const keys = position < this.ebookCellLogBase
      ? this.ebookTyped.cellKeys()
      : new Set(this.ebookCellLog.slice(position - this.ebookCellLogBase));
    return [...keys].map(key => [key, this.ebookTyped.cell(key)]);
  }

  /** Score a book against what was typed so far: every character that has played is correct, wrong or missed. */
  private scoreEbook(): void {
    this.feedback.set(this.ebookTyped.feedback(this.ebookPlayed()));
  }

  /**
   * Push a single practice character into the display buffers.
   * Called from the app component's encoder sentIndex watcher
   * when practice mode is active, instead of the normal pushSent.
   */
  pushPracticeChar(char: string): void {
    const s = this.settings.settings();
    // The e-book reader shows the text itself
    if (s.practiceContentMode === 'ebook') return;
    const source: DecoderSource = s.practiceSource;
    const name = s.practiceName || undefined;
    const color = s.practiceColor || undefined;
    this.displayBuffers.pushSent(source, char, name, color, true);
  }
}
