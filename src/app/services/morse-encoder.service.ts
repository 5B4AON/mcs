/**
 * Morse Code Studio
 */

import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { MORSE_TABLE, timingsFromWpm, adjustGapTimings, pauseQuarters } from '../morse-table';
import { AudioOutputService } from './audio-output.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { VibrationOutputService } from './vibration-output.service';
import { WinkeyerOutputService } from './winkeyer-output.service';
import { MidiOutputService } from './midi-output.service';
import { FirebaseRtdbService } from './firebase-rtdb.service';
import { LoopDetectionService } from './loop-detection.service';
import { LensService } from './lens.service';

/** Queue entry for playback of received characters through all matching outputs */
interface SidetoneQueueEntry { char: string; source: 'rx' | 'tx'; wpm?: number; name?: string; color?: string; }

/** The dots and dashes of the character being played so far, shown while its tones sound. */
export interface PlayingPattern {
  pattern: string;
  source: 'rx' | 'tx';
  /** Optional colour override from the input */
  color?: string;
}

/**
 * Local playback (Copy practice on this device only, local replays) is placed on the audio clock:
 * the next tokens are scheduled this far ahead of the one that is sounding, so a busy page cannot
 * stretch a gap, and the first token of a run starts after a short headroom.
 */
const LOCAL_LEAD_S = 0.2;
const LOCAL_START_S = 0.02;
/** A gap shorter than this needs no snap-to-silence event after the tone before it (see `scheduleToneAt`) */
const SNAP_GAP_MS = 35;

/** A token placed on the audio clock, waiting for its turn to start sounding. */
interface LocalToken {
  idx: number;
  endIdx: number;
  /** Audio-clock time at which it starts */
  at: number;
  /** Tones of its elements: start offset from `at` and length, in ms */
  elements: { offset: number; dur: number }[];
  /** Dots and dashes of the character, for the replay's progress */
  morse: string;
  source: 'rx' | 'tx';
}

/** A streamed text drops what it has sent from the front of the buffer once this much has been sent */
const STREAM_COMPACT_AT = 600;

/**
 * Morse Encoder Service — converts typed text to perfectly timed morse output.
 *
 * Supports two operating modes:
 *  1. 'enter' mode: User types text in a textarea, presses Enter to start
 *     sending. Good for composing messages before transmitting.
 *  2. 'live' mode: Characters are queued for sending as soon as typed.
 *     TX starts automatically. Good for real-time conversation.
 *
 * The encoder sends each character by:
 *  - Looking up its morse pattern in MORSE_TABLE
 *  - Playing audio tones (sidetone + opto) via AudioOutputService
 *  - Toggling serial port pin via SerialKeyOutputService
 *  - Timing dits, dahs, and gaps according to the configured WPM speed
 *
 * The send loop is abortable (AbortController) so TX can be stopped
 * mid-character without hanging.
 */
@Injectable({ providedIn: 'root' })
export class MorseEncoderService {
  /** The text waiting to be sent */
  readonly buffer = signal('');

  /** Index into buffer: characters up to this index have been sent */
  readonly sentIndex = signal(0);

  /** Characters dropped from the front of the buffer so far by a streamed text (see `appendText`) */
  readonly trimmed = signal(0);

  /** Whether TX is active */
  readonly isSending = signal(false);

  /**
   * Monotonically increasing counter — incremented when silence after the
   * last sent character exceeds the word-gap threshold.  The app component
   * watches this signal and pushes a space to the display buffers.
   */
  readonly wordGapCount = signal(0);

  /**
   * Emits key-down/key-up events for each morse element the encoder plays.
   * Used by the app component to animate the sprite when the encoder trigger is enabled.
   */
  readonly elementEvent$ = new Subject<{ down: boolean }>();

  /**
   * True while a replay is playing or paused. A replay uses the encoder's outputs
   * without changing the input buffer, the displayed text, Lens or word gaps.
   */
  readonly replayMode = signal(false);

  /** Symbols of the typed character being played, revealed with each tone; null between characters, in practice and in replays. */
  readonly typedPattern = signal<PlayingPattern | null>(null);

  /** Symbols of the received (RTDB) character being played, revealed with each tone; null between characters. */
  readonly receivedPattern = signal<PlayingPattern | null>(null);

  /** Position in the replay text and the symbols of the character being played, revealed with each tone; null when no replay is active. */
  readonly replayProgress = signal<{ index: number; pattern: string } | null>(null);

  /** Emits when a replay has played to its end (not when it is stopped or cleared). */
  readonly replayCompleted$ = new Subject<void>();

  /** The current replay stays on this device (set by startReplay, reset with replayMode). */
  private replayLocalOnly = false;
  private replayText = '';
  private readonly replayIndex = signal(0);
  private replayForwardedIndex = -1;
  /**
   * Counts sends that ran to the end of the buffer in Live mode. The buffer is emptied right
   * after, so the display uses this to know the last characters were really sent and still have
   * to be shown; a buffer emptied any other way (Clear, backspace) was discarded.
   */
  readonly sendCompletions = signal(0);

  /** A replay that has not finished: playing, or paused and waiting for the TX button. */
  readonly replayPending = computed(() => this.replayMode() && this.replayIndex() < this.replayText.length);

  /** Timers of the things shown or felt while a local token plays (sprite, replay progress, vibration); they never carry the timing */
  private localTimers = new Set<ReturnType<typeof setTimeout>>();
  private localActive = false;
  private localKeyDown = false;

  /** The buffer is fed with `appendText`, so what has been sent is dropped from its front as it goes */
  private streaming = false;

  /** Currently sending (internal lock) */
  private sending = false;
  private abortController: AbortController | null = null;
  /** Buffer index of the character last forwarded to WinKeyer, MIDI and RTDB, while it has not finished playing */
  private forwardedIndex = -1;
  private wordGapTimer: ReturnType<typeof setTimeout> | null = null;

  /** Queue and lock for sidetone-only playback of incoming RTDB chars */
  private sidetoneQueue: SidetoneQueueEntry[] = [];
  private sidetonePlaying = false;

  constructor(
    private settings: SettingsService,
    private audioOutput: AudioOutputService,
    private serialOutput: SerialKeyOutputService,
    private vibrationOutput: VibrationOutputService,
    private midiOutput: MidiOutputService,
    private winkeyerOutput: WinkeyerOutputService,
    private rtdbOutput: FirebaseRtdbService,
    private loopDetection: LoopDetectionService,
    private lens: LensService,
  ) {}

  /** Enqueue text for sending */
  enqueue(text: string): void {
    this.streaming = false;
    const previous = this.buffer();
    const next = previous + text.toUpperCase();
    this.resetForwardedIfTokenChanged(previous, next);
    this.buffer.set(next);
    // In live mode, auto-start TX when characters are added
    if (this.settings.settings().encoderMode === 'live' && !this.replayMode()) {
      if (!this.isSending()) {
        this.startTx();
      } else {
        this.processSend();
      }
    }
  }

  /** Set entire buffer (e.g. from textarea) */
  setBuffer(text: string): void {
    this.streaming = false;
    this.trimmed.set(0);
    const upper = text.toUpperCase();
    const oldSent = this.sentIndex();
    const oldBuf = this.buffer();
    this.resetForwardedIfTokenChanged(oldBuf, upper);
    this.buffer.set(upper);
    // If the already-sent prefix no longer matches the start of the new
    // buffer the old sentIndex is meaningless (e.g. completely different
    // text after a mode switch).  Reset to 0 so all characters are sent.
    // When the prefix still matches, clamp to the new length to handle
    // backspace edits without re-sending already-sent characters.
    if (oldSent > 0) {
      const prefixLen = Math.min(oldSent, upper.length);
      if (oldBuf.slice(0, prefixLen) !== upper.slice(0, prefixLen)) {
        this.sentIndex.set(0);
      } else if (oldSent > upper.length) {
        this.sentIndex.set(upper.length);
      }
    }
    // In live mode, auto-start TX when there is unsent text
    if (this.settings.settings().encoderMode === 'live' && !this.replayMode() && upper.length > this.sentIndex()) {
      if (!this.isSending()) {
        this.startTx();
      } else {
        // Already sending — kick the loop in case it finished and is idle
        this.processSend();
      }
    }
  }

  /** Start TX */
  startTx(): void {
    // Enter mode: drop spaces at the end of the message, and at its start when sending has not begun
    if (!this.replayMode() && this.settings.settings().encoderMode === 'enter') {
      const sent = this.sentIndex();
      const text = this.buffer();
      const tail = sent === 0 ? text.trim() : text.slice(sent).trimEnd();
      const trimmed = text.slice(0, sent) + tail;
      if (trimmed !== text) this.buffer.set(trimmed);
    }
    this.isSending.set(true);
    this.processSend();
  }

  /** Stop TX */
  stopTx(): void {
    this.isSending.set(false);
    this.abortController?.abort();
    this.cancelWordGapTimer();
    if (this.localActive) this.cancelLocal();
  }

  /** Toggle TX */
  toggleTx(): void {
    if (this.isSending()) {
      this.stopTx();
    } else {
      this.startTx();
    }
  }

  /**
   * Add text to the end of the buffer without replacing it and without starting to send (a long text
   * is fed in pieces: e-book playback). Text that has been sent is dropped from the front as it
   * goes, so the buffer stays small; `trimmed` counts what was dropped, which keeps
   * `trimmed() + sentIndex()` the number of characters sent since the text started.
   */
  appendText(text: string): void {
    if (!this.streaming) {
      this.streaming = true;
      this.trimmed.set(0);
    }
    this.buffer.update(b => b + text.toUpperCase());
  }

  /** Drop what a streamed text has sent from the front of the buffer. */
  private compactStream(): number {
    const sent = this.sentIndex();
    if (!this.streaming || sent < STREAM_COMPACT_AT) return 0;
    this.buffer.update(b => b.slice(sent));
    this.sentIndex.set(0);
    this.trimmed.update(t => t + sent);
    return sent;
  }

  /** Clear the send buffer */
  clearBuffer(): void {
    this.stopTx();
    this.resetReplay();
    this.streaming = false;
    this.trimmed.set(0);
    this.buffer.set('');
    this.sentIndex.set(0);
    this.forwardedIndex = -1;
    this.cancelWordGapTimer();
  }

  /** Submit text in 'enter' mode */
  submitText(text: string): void {
    this.streaming = false;
    this.trimmed.set(0);
    this.buffer.set(text.toUpperCase());
    this.sentIndex.set(0);
    this.forwardedIndex = -1;
    this.startTx();
  }

  /**
   * Replay text already on screen without changing a paused input buffer.
   * The TX button pauses and resumes the replay; clearing the input stops both.
   * With `localOnly` it plays as sidetone and vibration only, never to serial, MIDI,
   * WinKeyer or RTDB (Send practice's "Hear it first").
   * Returns false if there is nothing to replay or playback is already active.
   */
  startReplay(text: string, localOnly = false): boolean {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || this.isSending() || this.replayPending()) return false;
    this.replayText = clean.toUpperCase();
    this.replayIndex.set(0);
    this.replayForwardedIndex = -1;
    this.replayLocalOnly = localOnly;
    this.replayMode.set(true);
    this.startTx();
    return true;
  }

  /** Stop a replay without discarding the paused input buffer. */
  stopReplay(): void {
    if (!this.replayMode()) return;
    this.stopTx();
    this.resetReplay();
  }

  private resetReplay(): void {
    this.replayMode.set(false);
    this.replayProgress.set(null);
    this.replayText = '';
    this.replayIndex.set(0);
    this.replayForwardedIndex = -1;
    this.replayLocalOnly = false;
  }

  private resetForwardedIfTokenChanged(previous: string, next: string): void {
    const index = this.forwardedIndex;
    if (index >= 0 && (index >= previous.length || index >= next.length
        || this.extractToken(previous, index).token !== this.extractToken(next, index).token)) {
      this.forwardedIndex = -1;
    }
  }

  // ---- internal send loop ----

  /** Copy practice on "Local audio and vibration", or a replay started local-only: external outputs stay silent. */
  private isLocalOnly(s: { encoderMode: string; practicePipeline: string }): boolean {
    return (s.encoderMode === 'practice' && s.practicePipeline === 'local')
      || (this.replayMode() && this.replayLocalOnly);
  }

  /**
   * Extract the next token from the buffer.
   * Returns either a single character or a prosign pattern (e.g., '<SK>').
   * The returned endIdx points past the extracted token.
   */
  extractToken(buffer: string, startIdx: number): { token: string; endIdx: number } {
    if (buffer[startIdx] === '<') {
      const endIdx = buffer.indexOf('>', startIdx);
      if (endIdx !== -1 && endIdx > startIdx + 1) {
        const prosignPattern = buffer.substring(startIdx, endIdx + 1);
        // Check if it matches prosign format: <[A-Z]+>
        if (/^<[A-Z]+>$/.test(prosignPattern)) {
          return { token: prosignPattern, endIdx: endIdx + 1 };
        }
      }
    }
    // Return single character
    return { token: buffer[startIdx], endIdx: startIdx + 1 };
  }

  private async processSend(): Promise<void> {
    if (this.sending) return; // already in loop
    this.sending = true;
    this.cancelWordGapTimer();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const replay = this.replayMode();

    try {
      const local = this.isLocalOnly(this.settings.settings());
      if (local) await this.runLocal(signal, replay);
      while (!local && this.isSending() && (replay
        ? this.replayIndex() < this.replayText.length
        : this.sentIndex() < this.buffer().length)) {
        if (signal.aborted) break;

        const idx = replay ? this.replayIndex() : this.sentIndex();
        const { token, endIdx } = this.extractToken(replay ? this.replayText : this.buffer(), idx);

        const es = this.settings.settings();
        const source = es.encoderSource;
        const isPracticeLocal = this.isLocalOnly(es);

        // Skip external outputs when practice mode or a local-only replay uses local audio only. A character that was
        // interrupted by a pause is played again in full on resume but forwarded only once,
        // because the external outputs time and send it themselves.
        const forwardedIndex = replay ? this.replayForwardedIndex : this.forwardedIndex;
        if (!isPracticeLocal && forwardedIndex !== idx && pauseQuarters(token) === 0) {
          if (replay) this.replayForwardedIndex = idx;
          else this.forwardedIndex = idx;

          // Forward to WinKeyer (as encoder source) — WinKeyer handles its own timing
          this.winkeyerOutput.forwardDecodedChar(token, source);

          // Forward to MIDI output (as encoder source) — plays elements at encoder WPM
          this.midiOutput.forwardDecodedChar(token, source);

          // Forward to Firebase RTDB output (as encoder source)
          this.rtdbOutput.forwardEncoderChar(token, es.encoderWpm, es.encoderSource, es.encoderName, es.encoderColor);
        }

        if (replay) this.replayProgress.set({ index: idx, pattern: '' });
        await this.sendCharacter(token, signal);

        // A character cut short by Stop/Pause does not count as sent: it plays again in full on resume
        if (signal.aborted) break;
        if (replay) {
          this.replayForwardedIndex = -1;
          this.replayIndex.set(endIdx);
        } else {
          this.forwardedIndex = -1;
          this.sentIndex.set(endIdx);
          this.compactStream();
        }
        this.typedPattern.set(null);

        // Inter-character space (3 dit units) — already included after last element
        // If next char is space, we handle it in sendCharacter
      }
    } finally {
      this.sending = false;
      this.typedPattern.set(null);
      if (signal.aborted) {
        // A new send or replay may have started while the interrupted tone was finishing.
        if (this.isSending()) void this.processSend();
      } else if (replay && this.replayIndex() >= this.replayText.length) {
        this.isSending.set(false);
        this.replayCompleted$.next();
        this.resetReplay();
      } else if (!replay && this.sentIndex() >= this.buffer().length) {
        this.isSending.set(false);
        // In live mode, clear the buffer when sending completes
        // In enter mode, keep the buffer so it's visible until manually cleared
        if (this.settings.settings().encoderMode === 'live') {
          if (!signal.aborted && this.buffer().length > 0) this.sendCompletions.update(n => n + 1);
          this.buffer.set('');
          this.sentIndex.set(0);
        }
        // Start a word-gap timer — if no new characters arrive before it
        // fires, a space is pushed to the display buffers (mirroring the
        // decoder's word-boundary detection).
        this.startWordGapTimer();
      }
    }
  }

  // ---- Local playback on the audio clock ----

  /** The timings of the current speed and Farnsworth settings (the same as `sendCharacter` uses). */
  private currentTimings(s: ReturnType<SettingsService['settings']>): ReturnType<typeof timingsFromWpm> {
    const fwSource = s.encoderMode === 'practice' ? s.practiceSource : s.encoderSource;
    return adjustGapTimings(timingsFromWpm(s.encoderWpm), s.encoderWpm, fwSource, s);
  }

  /**
   * Play the text on this device only, with the timing kept on the audio clock. Every token's start
   * is the previous start plus the previous length, computed in audio time, so tones, gaps, letter
   * gaps, word gaps and pauses are exact whatever the page is doing. Tokens are placed about
   * `LOCAL_LEAD_S` ahead of the one sounding; the timers here only wake the loop and move the sent
   * index (the highlight) when a token starts. A pause or stop drops what is placed, and the token
   * that was sounding is played again in full on resume, as before.
   */
  private async runLocal(signal: AbortSignal, replay: boolean): Promise<void> {
    const text = (): string => replay ? this.replayText : this.buffer();
    // Moves the index to a token (or the end) and returns how many characters a streamed text dropped
    const setIndex = (i: number): number => {
      if (replay) {
        this.replayForwardedIndex = -1;
        this.replayIndex.set(i);
        return 0;
      }
      this.forwardedIndex = -1;
      this.sentIndex.set(i);
      return this.compactStream();
    };
    const clock = (): number => this.audioOutput.clockTime() ?? performance.now() / 1000;
    const wait = (until: number): Promise<void> => this.sleep(Math.max(0, (until - clock()) * 1000), signal);

    await this.audioOutput.ready();
    if (signal.aborted) return;
    this.localActive = true;
    const queue: LocalToken[] = [];
    let cursor = replay ? this.replayIndex() : this.sentIndex();
    // When the next token to place starts
    let next = clock() + LOCAL_START_S;
    try {
      for (;;) {
        // Place tokens until the audio clock has enough of them ahead
        while (cursor < text().length && next - clock() < LOCAL_LEAD_S && !signal.aborted) {
          const { token, endIdx } = this.extractToken(text(), cursor);
          // The page stalled for longer than the look-ahead: carry on from now rather than in the past
          if (next < clock()) next = clock() + 0.005;
          const placed = this.placeLocalToken(token, cursor, endIdx, next);
          queue.push(placed.token);
          next += placed.lengthMs / 1000;
          cursor = endIdx;
        }
        if (signal.aborted) return;

        if (queue.length === 0) {
          if (cursor < text().length) {
            await wait(next - LOCAL_LEAD_S);
            if (signal.aborted) return;
            continue;
          }
          // Everything has started: the last token still has to finish
          await wait(next);
          if (signal.aborted) return;
          const dropped = setIndex(cursor);
          cursor -= dropped;
          // More text may have arrived meanwhile: the timeline goes on from here without a gap
          if (cursor < text().length) continue;
          return;
        }

        const head = queue.shift() as LocalToken;
        await wait(head.at);
        if (signal.aborted) return;
        const dropped = setIndex(head.idx);
        if (dropped) {
          cursor -= dropped;
          for (const q of queue) {
            q.idx -= dropped;
            q.endIdx -= dropped;
          }
        }
        this.showLocalToken(head, replay);
      }
    } finally {
      this.localActive = false;
      if (signal.aborted) this.cancelLocal();
    }
  }

  /** Put one token on the audio clock at `at` and say how long it takes (its sound, the gap after it, or a pause). */
  private placeLocalToken(
    token: string, idx: number, endIdx: number, at: number,
  ): { token: LocalToken; lengthMs: number } {
    const s = this.settings.settings();
    const timings = this.currentTimings(s);
    const source = s.encoderSource;
    const placed: LocalToken = { idx, endIdx, at, elements: [], morse: '', source };

    const quarters = pauseQuarters(token);
    if (quarters > 0) return { token: placed, lengthMs: timings.interWord * quarters / 4 };
    // A word gap is 7 dit units; the 3 after the last element of the letter before it are already counted
    if (token === ' ') return { token: placed, lengthMs: timings.interWord - timings.interChar };
    const morse = MORSE_TABLE[token];
    if (!morse) return { token: placed, lengthMs: 0 };

    placed.morse = morse;
    let offset = 0;
    for (let i = 0; i < morse.length; i++) {
      const dur = morse[i] === '.' ? timings.dit : timings.dah;
      const last = i === morse.length - 1;
      this.audioOutput.scheduleToneAt(at + offset / 1000, dur, source, last || timings.intraChar > SNAP_GAP_MS);
      placed.elements.push({ offset, dur });
      offset += dur + (last ? 0 : timings.intraChar);
    }
    return { token: placed, lengthMs: offset + timings.interChar };
  }

  /** A token has started sounding: the sprite, the replay progress and the vibration follow its elements. */
  private showLocalToken(q: LocalToken, replay: boolean): void {
    if (replay) this.replayProgress.set({ index: q.idx, pattern: '' });
    q.elements.forEach((e, i) => {
      this.localLater(e.offset, () => {
        this.localKeyDown = true;
        this.elementEvent$.next({ down: true });
        void this.vibrationOutput.schedulePulse(e.dur, q.source);
        if (this.replayMode()) this.replayProgress.update(p => p && { ...p, pattern: q.morse.slice(0, i + 1) });
      });
      this.localLater(e.offset + e.dur, () => {
        this.localKeyDown = false;
        this.elementEvent$.next({ down: false });
      });
    });
  }

  private localLater(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.localTimers.delete(id);
      fn();
    }, ms);
    this.localTimers.add(id);
  }

  /** Drop what local playback has placed on the audio clock and its pending timers. */
  private cancelLocal(): void {
    for (const id of this.localTimers) clearTimeout(id);
    this.localTimers.clear();
    this.audioOutput.cancelScheduledTones();
    if (this.localKeyDown) {
      this.localKeyDown = false;
      this.elementEvent$.next({ down: false });
    }
  }

  private async sendCharacter(char: string, signal: AbortSignal): Promise<void> {
    const s = this.settings.settings();
    const baseTimings = timingsFromWpm(s.encoderWpm);
    const fwSource = s.encoderMode === 'practice' ? s.practiceSource : s.encoderSource;
    const timings = adjustGapTimings(baseTimings, s.encoderWpm, fwSource, s);
    const source = s.encoderSource;

    // A pause (e-book playback): silence for a number of quarter word gaps, nothing played or shown
    const pause = pauseQuarters(char);
    if (pause > 0) {
      await this.sleep(timings.interWord * pause / 4, signal);
      return;
    }

    if (char === ' ') {
      // Word space = 7 dit units total; 3 already elapsed as inter-char
      await this.sleep(timings.interWord - timings.interChar, signal);
      return;
    }

    const morse = MORSE_TABLE[char];
    // Lens follows playback; Copy Practice has its own view
    const lensMeta = s.encoderMode === 'practice' || this.replayMode()
      ? null
      : { source, name: s.encoderName || undefined, color: s.encoderColor || undefined };
    if (lensMeta) this.lens.show('encoder', lensMeta, '', char, morse ?? '');
    if (!morse) return; // skip unknown chars

    for (let i = 0; i < morse.length; i++) {
      if (signal.aborted) return;

      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;
      if (this.replayMode()) this.replayProgress.update(p => p && { ...p, pattern: morse.slice(0, i + 1) });
      if (lensMeta) {
        this.lens.show('encoder', lensMeta, morse.slice(0, i + 1), char, morse);
        this.typedPattern.set({ pattern: morse.slice(0, i + 1), source, color: lensMeta.color });
      }

      // Emit element-start for sprite animation
      this.elementEvent$.next({ down: true });

      // Play tone, pulse serial, and vibrate for the element duration
      const isPracticeLocal = this.isLocalOnly(s);
      if (isPracticeLocal) {
        await Promise.all([
          this.audioOutput.scheduleTone(duration, source),
          this.vibrationOutput.schedulePulse(duration, source),
        ]);
      } else {
        await Promise.all([
          this.audioOutput.scheduleTone(duration, source),
          this.serialOutput.schedulePulse(duration, source),
          this.vibrationOutput.schedulePulse(duration, source),
        ]);
      }

      // Emit element-end for sprite animation
      this.elementEvent$.next({ down: false });

      if (signal.aborted) return;

      // Intra-character space (1 dit unit) — except after last element
      if (i < morse.length - 1) {
        await this.sleep(timings.intraChar, signal);
      }
    }

    // Inter-character space (3 dit units)
    await this.sleep(timings.interChar, signal);
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const id = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    });
  }

  /**
   * Start the word-gap timer.  Called when the send loop finishes
   * naturally (all characters sent).  The timer fires after the
   * remaining word-gap silence (interWord − interChar, since
   * sendCharacter already adds an inter-char gap after the last
   * element).  When it fires it increments wordGapCount so the
   * display effect can push a space.
   */
  private startWordGapTimer(): void {
    this.cancelWordGapTimer();
    if (this.replayMode()) return;
    const s = this.settings.settings();
    const baseTimings = timingsFromWpm(s.encoderWpm);
    const fwSource = s.encoderMode === 'practice' ? s.practiceSource : s.encoderSource;
    const timings = adjustGapTimings(baseTimings, s.encoderWpm, fwSource, s);
    const delay = timings.interWord - timings.interChar;
    this.wordGapTimer = setTimeout(() => {
      this.wordGapTimer = null;
      this.wordGapCount.update(n => n + 1);
    }, delay);
  }

  private cancelWordGapTimer(): void {
    if (this.wordGapTimer) {
      clearTimeout(this.wordGapTimer);
      this.wordGapTimer = null;
    }
  }

  // ──────────────────────────────────────────────
  //  Sidetone-only playback for incoming RTDB chars
  // ──────────────────────────────────────────────

  /**
   * Play a character as sidetone only — no radio keying, serial output,
   * vibration, or buffer changes. Used for incoming RTDB characters so
   * the user hears the received morse without retransmitting it.
   *
   * @deprecated Prefer enqueueRxPlayback() for full output routing.
   */
  enqueueSidetone(char: string): void {
    this.enqueueRxPlayback(char);
  }

  /**
   * Play a received character through all outputs whose forward mode
   * includes the given source. Used for incoming RTDB characters.
   * @param wpm Optional WPM from the remote sender; falls back to local encoderWpm
   */
  enqueueRxPlayback(char: string, source: 'rx' | 'tx' = 'rx', wpm?: number, name?: string, color?: string): void {
    this.sidetoneQueue.push({ char, source, wpm, name, color });
    if (!this.sidetonePlaying) {
      this.processSidetoneQueue();
    }
  }

  private async processSidetoneQueue(): Promise<void> {
    if (this.sidetonePlaying) return;
    this.sidetonePlaying = true;

    try {
      while (this.sidetoneQueue.length > 0) {
        const entry = this.sidetoneQueue.shift()!;
        await this.playRxChar(entry.char, entry.source, entry.wpm, entry.name, entry.color);
      }
    } finally {
      this.sidetonePlaying = false;
    }
  }

  private async playRxChar(char: string, source: 'rx' | 'tx', wpm?: number, name?: string, color?: string): Promise<void> {
    const lensMeta = { source, name, color };
    // Skip output if loop is suppressed (Lens still shows the received character)
    if (this.loopDetection.isSuppressed) {
      const morse = MORSE_TABLE[char];
      if (char !== ' ' && morse) this.lens.show('rtdb', lensMeta, morse, char);
      return;
    }
    const charWpm = wpm ?? this.settings.settings().encoderWpm;
    const baseTimings = timingsFromWpm(charWpm);
    const timings = adjustGapTimings(baseTimings, charWpm, source, this.settings.settings());

    if (char === ' ') {
      await this.sleepMs(timings.interWord - timings.interChar);
      return;
    }

    const morse = MORSE_TABLE[char];
    this.lens.show('rtdb', lensMeta, '', char, morse ?? '');
    if (!morse) return;

    for (let i = 0; i < morse.length; i++) {
      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;
      this.lens.show('rtdb', lensMeta, morse.slice(0, i + 1), char, morse);
      this.receivedPattern.set({ pattern: morse.slice(0, i + 1), source, color });

      // Play through all outputs based on their forward settings
      await Promise.all([
        this.audioOutput.scheduleTone(duration, source),
        this.serialOutput.schedulePulse(duration, source),
        this.vibrationOutput.schedulePulse(duration, source),
      ]);

      // Intra-character space
      if (i < morse.length - 1) {
        await this.sleepMs(timings.intraChar);
      }
    }

    // Inter-character space
    await this.sleepMs(timings.interChar);
    this.receivedPattern.set(null);
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
