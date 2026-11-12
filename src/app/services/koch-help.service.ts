/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { MorseEncoderService } from './morse-encoder.service';
import { MORSE_TABLE } from '../morse-table';
import { kochNewChars } from '../data/koch-lessons';

/** Which practice the lesson help belongs to. */
export type KochHelpKind = 'copy' | 'send';

/** One new character of the lesson as the help overlay shows it. */
export interface KochHelpCell {
  char: string;
  /** The full dots and dashes of the character */
  morse: string;
  /** The part already sounded */
  revealed: string;
  state: 'pending' | 'playing' | 'done';
}

/** How long the overlay stays after the sound ends. */
const OVERLAY_LINGER_MS = 600;

/** How long each number of the countdown is shown. */
const COUNTDOWN_STEP_MS = 800;

/** What the overlay is showing. */
type KochHelpMode = 'help' | 'countdown' | null;

/**
 * Koch Help Service — plays the characters a Koch lesson introduces and shows them with their
 * dots and dashes, before the lesson starts (Copy and Send practice).
 *
 * The sound is a local-only encoder replay (sidetone and vibration, never an external route);
 * the overlay follows the encoder's `replayProgress`. The first Start of each lesson in a page
 * session plays it automatically (`beforeRound`); the learner then presses Start again, which
 * shows a 3, 2, 1 countdown in the same overlay before the round begins. The help button plays
 * it again on request (`toggle`), also while a lesson is paused.
 */
@Injectable({ providedIn: 'root' })
export class KochHelpService {
  /** What the overlay shows: the lesson's characters, the countdown, or nothing */
  readonly mode = signal<KochHelpMode>(null);

  /** The overlay is on screen (while playing and for a moment after, or during the countdown) */
  readonly visible = computed(() => this.mode() !== null);

  /** Characters of the introduction being shown */
  private readonly chars = signal<string[]>([]);
  /** The sound has ended; the overlay is lingering */
  private readonly finished = signal(false);
  /** The number shown during the countdown */
  private readonly count = signal(0);

  /** The introduction sound is playing */
  readonly playing = computed(() => this.mode() === 'help' && !this.finished());

  /** One cell per character with how much of it has sounded */
  readonly cells = computed<KochHelpCell[]>(() => {
    if (this.mode() === 'countdown') {
      return [{ char: String(this.count()), morse: '', revealed: '', state: 'playing' as const }];
    }
    const done = this.finished();
    const progress = this.encoder.replayProgress();
    // The replay text is "K M": character i sits at index 2i
    const current = progress ? Math.floor(progress.index / 2) : -1;
    return this.chars().map((char, i) => {
      const morse = MORSE_TABLE[char] ?? '';
      if (done || i < current) return { char, morse, revealed: morse, state: 'done' as const };
      if (i === current) return { char, morse, revealed: progress?.pattern ?? '', state: 'playing' as const };
      return { char, morse, revealed: '', state: 'pending' as const };
    });
  });

  /** Lessons already introduced in this page session ("copy:3") */
  private readonly introduced = new Set<string>();
  /** Lessons whose next Start shows the countdown (the help has just played) */
  private readonly countdownDue = new Set<string>();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private settings: SettingsService,
    private encoder: MorseEncoderService,
  ) {
    encoder.replayCompleted$.subscribe(() => this.onCompleted());
    // A replay that ends without completing was stopped or cleared: close the overlay
    effect(() => {
      if (this.playing() && !this.encoder.replayPending()) this.dismiss();
    });
  }

  /** The practice mode in use when it is a Koch lesson, otherwise null. */
  kind(): KochHelpKind | null {
    const s = this.settings.settings();
    if (s.encoderMode === 'practice' && s.practiceContentMode === 'koch') return 'copy';
    if (s.encoderMode === 'send-practice' && s.sendPracticeContentMode === 'koch') return 'send';
    return null;
  }

  /** Play the current lesson's characters, or stop them while they play. */
  toggle(): void {
    if (this.playing()) {
      this.encoder.stopReplay();
      this.dismiss();
      return;
    }
    if (this.mode() === 'countdown') return;
    const kind = this.kind();
    if (kind && this.play(this.lesson(kind)) && !this.introduced.has(this.key(kind))) {
      this.introduced.add(this.key(kind));
      this.countdownDue.add(this.key(kind));
    }
  }

  /**
   * Called by a practice before it begins a round. The first start of a Koch lesson plays the
   * introduction and the learner presses Start again; that start shows the countdown and then
   * calls `proceed`. Returns true when it took over (the caller does nothing), false when the
   * caller should begin the round itself.
   */
  beforeRound(kind: KochHelpKind, proceed: () => void): boolean {
    // Start pressed during the countdown: the round begins at once
    if (this.mode() === 'countdown') {
      this.cancelPending();
      return false;
    }
    if (this.kind() !== kind) return false;
    const key = this.key(kind);
    if (!this.introduced.has(key)) {
      this.introduced.add(key);
      if (!this.play(this.lesson(kind))) return false;
      this.countdownDue.add(key);
      return true;
    }
    // Start pressed during the introduction: skip the rest of it
    if (this.playing()) {
      this.encoder.stopReplay();
      this.dismiss();
    }
    if (this.countdownDue.delete(key)) {
      this.startCountdown(proceed);
      return true;
    }
    return false;
  }

  /** Drop a countdown that is running (the practice was aborted or started at once). */
  cancelPending(): void {
    if (this.mode() === 'countdown') this.dismiss();
  }

  private key(kind: KochHelpKind): string {
    return `${kind}:${this.lesson(kind)}`;
  }

  private lesson(kind: KochHelpKind | null): number {
    const s = this.settings.settings();
    return kind === 'send' ? s.sendPracticeKochLesson : s.practiceKochLesson;
  }

  private play(lesson: number): boolean {
    const chars = [...kochNewChars(lesson)];
    if (!this.encoder.startReplay(chars.join(' '), true)) return false;
    this.chars.set(chars);
    this.finished.set(false);
    this.clearTimers();
    this.mode.set('help');
    return true;
  }

  private startCountdown(proceed: () => void): void {
    this.clearTimers();
    this.count.set(3);
    this.mode.set('countdown');
    this.countdownTimer = setInterval(() => {
      if (this.count() > 1) {
        this.count.update(n => n - 1);
        return;
      }
      this.dismiss();
      proceed();
    }, COUNTDOWN_STEP_MS);
  }

  private onCompleted(): void {
    if (!this.playing()) return;
    this.finished.set(true);
    this.clearTimers();
    this.hideTimer = setTimeout(() => this.dismiss(), OVERLAY_LINGER_MS);
  }

  private dismiss(): void {
    this.clearTimers();
    this.mode.set(null);
    this.finished.set(false);
  }

  private clearTimers(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
