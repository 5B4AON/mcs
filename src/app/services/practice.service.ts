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
import { PracticeContentOptions, PracticeSequenceGenerator } from './practice-content';
import { PracticeFeedback, computePracticeFeedback, practiceAccuracy } from './practice-scoring';
import { effectivePracticeFeedbackMode } from '../components/settings-items/practice/practice-item.model';
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

  /** The finished sequence, or the completed part of a paused sequence. */
  readonly replayableText = computed(() => {
    if (this.state() === 'finished') return this.referenceText();
    if (this.state() === 'paused') return this.encoder.buffer().slice(0, this.encoder.sentIndex()).trim();
    return '';
  });

  /** Per-character feedback after a round (empty until 'finished') */
  readonly feedback = signal<PracticeFeedback[]>([]);

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

  /** The e-book being played (null for the other content), and where each character of the encoder's buffer sits in the book */
  private ebookFeed: EbookFeed | null = null;
  private ebookPositions: EbookPosition[] = [];
  private ebookTrimmed = 0;
  private ebookFeeding = false;
  /** Changes whenever a playback starts or ends, so a read that was under way for an earlier one is dropped */
  private ebookRun = 0;
  private readonly ebookActive = signal(false);

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

  /** Replay the completed part of a paused or finished sequence without drawing it again. */
  replay(): void {
    const state = this.state();
    if (state !== 'paused' && state !== 'finished') return;
    const text = this.replayableText();
    if (!text || !this.encoder.startReplay(text)) return;
    this.replayReturnState = state;
    this.state.set('playing');
  }

  /** Stop a replay and return to the paused or finished sequence. */
  stopReplay(): void {
    this.encoder.stopReplay();
    if (this.replayReturnState !== null) {
      this.state.set(this.replayReturnState);
      this.replayReturnState = null;
    }
  }

  /** Generate a new sequence and start */
  next(): void {
    this.start();
  }

  /** Pause playback; an interrupted character is retried on resume. */
  pause(): void {
    if (this.state() === 'playing') {
      this.encoder.stopTx();
      this.state.set('paused');
    }
  }

  /** Resume playback from where we left off */
  resume(): void {
    if (this.state() === 'paused') {
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
    this.feedback.set(computePracticeFeedback(this.referenceText(), userInput));
  }

  /**
   * Label the next type-along action for the visible control and guide.
   */
  typeAlongActionLabel(): string {
    if (this.state() === 'playing') return 'Pause';
    if (this.state() === 'paused') return 'Resume';
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
    if (this.encoder.replayPending()) {
      this.state.set('paused');
    } else if (this.replayReturnState !== null) {
      this.state.set(this.replayReturnState);
      this.replayReturnState = null;
    } else {
      this.state.set(this.encoder.sentIndex() < this.encoder.buffer().length ? 'paused' : 'finished');
    }
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

  /** The encoder has moved on: the reader follows the sounding character, and the buffer is topped up. */
  private onEbookProgress(sent: number, trimmed: number): void {
    const feed = this.ebookFeed;
    if (!feed) return;
    if (trimmed > this.ebookTrimmed) {
      this.ebookPositions.splice(0, trimmed - this.ebookTrimmed);
      this.ebookTrimmed = trimmed;
    }
    const here = this.ebookPositions[sent];
    if (here) this.ebook.reportPosition(here);
    else if (feed.done) this.ebook.reportPosition(feed.endPosition);
    if (this.ebookPositions.length - sent < EBOOK_TOP_UP_AT && !feed.done) void this.feedEbook();
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
