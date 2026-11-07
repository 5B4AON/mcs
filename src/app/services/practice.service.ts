/**
 * Morse Code Studio
 */

import { Injectable, signal, computed } from '@angular/core';
import { SettingsService } from './settings.service';
import { DecoderSource } from './settings-common';
import { MorseEncoderService } from './morse-encoder.service';
import { DisplayBufferService } from './display-buffer.service';
import { PracticeContentOptions, PracticeSequenceGenerator } from './practice-content';
import { PracticeFeedback, computePracticeFeedback, practiceAccuracy } from './practice-scoring';
import { effectivePracticeFeedbackMode } from '../components/settings-items/practice/practice-item.model';
import { kochRecommendation } from '../components/settings-items/practice/practice-ui.utils';

export type { PracticeFeedback } from './practice-scoring';

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

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
    private displayBuffers: DisplayBufferService,
  ) {}

  /** Generate a new sequence and start playback */
  start(): void {
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

  /**
   * Play the finished sequence again as sound only. The text on screen is not
   * touched or drawn again; the state follows playback so the practice button
   * pauses and resumes it like any other practice playback.
   */
  replay(): void {
    const text = this.referenceText();
    if (!text || this.state() !== 'finished') return;
    this.state.set('playing');
    this.encoder.startReplay(text);
  }

  /** Stop a replay for good (not a pause) and go back to the finished state. */
  stopReplay(): void {
    this.encoder.clearBuffer();
    if (this.state() === 'playing' || this.state() === 'paused') this.state.set('finished');
  }

  /** Generate a new sequence and start */
  next(): void {
    this.start();
  }

  /** Pause playback (finishes current character) */
  pause(): void {
    if (this.state() === 'playing') {
      this.encoder.stopTx();
      this.state.set('paused');
    }
  }

  /** Resume playback from where we left off */
  resume(): void {
    if (this.state() === 'paused') {
      this.state.set('playing');
      this.encoder.startTx();
    }
  }

  /** Abort current practice session */
  abort(): void {
    this.encoder.stopTx();
    this.encoder.clearBuffer();
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

    this.state.set('playing');

    // Feed text into encoder for audio playback
    this.encoder.submitText(text);
  }

  /** Start the next playback round in the current multi-round session. */
  private startMultiRound(): void {
    this.sessionStage.set('in-progress');
    this.start();
  }

  /**
   * Called by the app component when the encoder finishes sending
   * (isSending transitions from true to false while in practice mode).
   */
  onEncoderFinished(): void {
    if (this.state() === 'playing') {
      this.state.set('finished');
    }
  }

  /**
   * Push a single practice character into the display buffers.
   * Called from the app component's encoder sentIndex watcher
   * when practice mode is active, instead of the normal pushSent.
   */
  pushPracticeChar(char: string): void {
    const s = this.settings.settings();
    const source: DecoderSource = s.practiceSource;
    const name = s.practiceName || undefined;
    const color = s.practiceColor || undefined;
    this.displayBuffers.pushSent(source, char, name, color, true);
  }
}
