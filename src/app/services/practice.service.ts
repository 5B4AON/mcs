/**
 * Morse Code Studio
 */

import { Injectable, signal, computed } from '@angular/core';
import { SettingsService, DecoderSource } from './settings.service';
import { MorseEncoderService } from './morse-encoder.service';
import { DisplayBufferService } from './display-buffer.service';
import { PRACTICE_WORDS } from '../data/practice-words';
import { CALLSIGN_PREFIXES } from '../data/callsign-prefixes';
import { MORSE_TABLE } from '../morse-table';

/** Practice playback state */
export type PracticeState = 'idle' | 'playing' | 'paused' | 'finished';

/** Per-character feedback entry after a round completes */
export interface PracticeFeedback {
  /** The reference character */
  ref: string;
  /** 'correct' | 'incorrect' | 'missed' */
  result: 'correct' | 'incorrect' | 'missed';
}

/** Punctuation characters that have morse encodings */
const PUNCTUATION_CHARS = Object.keys(MORSE_TABLE).filter(
  ch => ch.length === 1 && !/[A-Z0-9 ]/.test(ch)
);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

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

  /** Accuracy percentage (correct / total reference chars, ignoring spaces) */
  readonly accuracy = computed(() => {
    const fb = this.feedback();
    if (fb.length === 0) return 0;
    const chars = fb.filter(f => f.ref !== ' ');
    if (chars.length === 0) return 0;
    const correct = chars.filter(f => f.result === 'correct').length;
    return Math.round((correct / chars.length) * 100);
  });

  /** Index into usedWordIndices to track word-list progression */
  private usedWordIndices = new Set<number>();

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

  /** Retry the same sequence */
  retry(): void {
    const text = this.referenceText();
    if (!text) return;
    this.feedback.set([]);
    this.playSequence(text);
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
  }

  /** Stop and reset (called when switching away from practice mode) */
  reset(): void {
    this.abort();
    this.referenceText.set('');
    this.usedWordIndices.clear();
  }

  /**
   * Compute per-character feedback by aligning user input to the
   * reference text using longest common subsequence (LCS).
   * Spaces are treated as regular characters — the user must type
   * them to get a correct match.
   */
  computeFeedback(userInput: string): void {
    const ref = this.referenceText().toUpperCase();
    const usr = userInput.toUpperCase();

    // Build LCS table
    const m = ref.length;
    const n = usr.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = ref[i - 1] === usr[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // Backtrack to find which ref indices were matched by the LCS
    const matched = new Set<number>();
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (ref[i - 1] === usr[j - 1]) {
        matched.add(i - 1);
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    // Build per-character feedback:
    // Walk ref and user input in parallel. Matched chars are 'correct'.
    // Unmatched ref chars (skipped by user) are 'missed' (grey).
    // Chars where the user typed something wrong are 'incorrect' (red) —
    // detected when the user consumed input but ref wasn't matched.
    const result: PracticeFeedback[] = [];
    let userIdx = 0;
    for (let ri = 0; ri < m; ri++) {
      if (matched.has(ri)) {
        result.push({ ref: ref[ri], result: 'correct' });
        // Advance userIdx to the matching user char
        while (userIdx < n && usr[userIdx] !== ref[ri]) userIdx++;
        userIdx++;
      } else {
        // Check if user typed an incorrect char at this position
        // (user has remaining input that didn't match)
        if (userIdx < n && !this.isUpcomingMatch(usr, userIdx, ref, ri, matched)) {
          result.push({ ref: ref[ri], result: 'incorrect' });
          userIdx++;
        } else {
          result.push({ ref: ref[ri], result: 'missed' });
        }
      }
    }

    this.feedback.set(result);
  }

  /**
   * Check if the user's next input char matches an upcoming ref char
   * that is in the LCS. If so, the current ref char was skipped (missed),
   * not incorrectly typed.
   */
  private isUpcomingMatch(usr: string, userIdx: number, ref: string, refIdx: number, matched: Set<number>): boolean {
    // Look ahead in ref for the next matched char
    for (let ri = refIdx + 1; ri < ref.length; ri++) {
      if (matched.has(ri) && usr[userIdx] === ref[ri]) return true;
      if (matched.has(ri)) break; // next match is a different char
    }
    return false;
  }

  // ---- Sequence generation ----

  private generateSequence(): string {
    const s = this.settings.settings();
    switch (s.practiceContentMode) {
      case 'characters': return this.generateCharacters();
      case 'words': return this.generateWords();
      case 'callsigns': return this.generateCallsigns();
    }
  }

  private recentChars: string[] = [];

  private generateCharacters(): string {
    const s = this.settings.settings();
    let pool = '';
    if (s.practiceIncludeLetters) pool += LETTERS;
    if (s.practiceIncludeNumbers) pool += DIGITS;
    if (s.practiceIncludePunctuation) pool += PUNCTUATION_CHARS.join('');
    if (!pool) pool = LETTERS; // fallback

    // Keep a history window to avoid repeating the same character too soon.
    // Window size scales with pool size but stays reasonable.
    const historySize = Math.min(Math.floor(pool.length / 2), 10);

    const groups: string[] = [];
    for (let g = 0; g < s.practiceGroupCount; g++) {
      let group = '';
      for (let c = 0; c < s.practiceCharGroupSize; c++) {
        const ch = this.pickNonRecentChar(pool, historySize);
        group += ch;
      }
      groups.push(group);
    }
    return groups.join(' ');
  }

  private pickNonRecentChar(pool: string, historySize: number): string {
    // Try to pick a character not in the recent history
    for (let attempt = 0; attempt < 20; attempt++) {
      const ch = pool[Math.floor(Math.random() * pool.length)];
      if (!this.recentChars.includes(ch)) {
        this.recentChars.push(ch);
        if (this.recentChars.length > historySize) this.recentChars.shift();
        return ch;
      }
    }
    // Fallback: pick any random character
    const ch = pool[Math.floor(Math.random() * pool.length)];
    this.recentChars.push(ch);
    if (this.recentChars.length > historySize) this.recentChars.shift();
    return ch;
  }

  private generateWords(): string {
    const s = this.settings.settings();
    const lengths = s.practiceWordLengths;
    const filtered = PRACTICE_WORDS
      .map((w, i) => ({ word: w, index: i }))
      .filter(e => lengths.includes(e.word.length));

    if (filtered.length === 0) return this.generateCharacters(); // fallback

    // Bias toward earlier (more common) words using weighted random
    // Also avoid duplicates within the current set of used indices
    const available = filtered.filter(e => !this.usedWordIndices.has(e.index));
    const source = available.length >= s.practiceGroupCount ? available : filtered;

    // If we've exhausted most words, reset the used set
    if (available.length < s.practiceGroupCount) {
      this.usedWordIndices.clear();
    }

    const picked: string[] = [];
    const pickedIndices = new Set<number>();
    for (let i = 0; i < s.practiceGroupCount; i++) {
      // Weighted random: bias toward lower indices (more common words)
      // Using an exponential distribution: index = floor(|random²| * length)
      let attempts = 0;
      let entry = source[0];
      while (attempts < 50) {
        const r = Math.random();
        const idx = Math.floor(r * r * source.length);
        entry = source[idx];
        if (!pickedIndices.has(entry.index)) break;
        attempts++;
      }
      picked.push(entry.word.toUpperCase());
      pickedIndices.add(entry.index);
      this.usedWordIndices.add(entry.index);
    }
    return picked.join(' ');
  }

  private generateCallsigns(): string {
    const s = this.settings.settings();
    const calls: string[] = [];
    for (let i = 0; i < s.practiceGroupCount; i++) {
      calls.push(this.randomCallsign());
    }
    return calls.join(' ');
  }

  private randomCallsign(): string {
    const entry = CALLSIGN_PREFIXES[Math.floor(Math.random() * CALLSIGN_PREFIXES.length)];
    const digit = entry.digits.length > 0
      ? String(entry.digits[Math.floor(Math.random() * entry.digits.length)])
      : '';
    const suffixLen = 1 + Math.floor(Math.random() * 3); // 1–3
    let suffix = '';
    for (let i = 0; i < suffixLen; i++) {
      suffix += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    return `${entry.prefix}${digit}${suffix}`;
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
    this.displayBuffers.pushSent(source, char, name, color);
  }
}
