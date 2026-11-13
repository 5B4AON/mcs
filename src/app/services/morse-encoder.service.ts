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
 * Everything the encoder plays (typed text, practice, replays, relayed playback) is placed on the audio
 * clock: the next tokens are scheduled this far ahead of the one that is sounding, so a busy page cannot
 * stretch a gap, and the first token of a run starts after a short headroom.
 */
const TIMELINE_LEAD_S = 0.2;
const TIMELINE_START_S = 0.02;
/**
 * The outputs that time themselves are handed a token this long before it sounds, with its exact start
 * time (MIDI places its notes from it), and the sent index moves then too.
 */
const TIMELINE_FORWARD_S = 0.03;
/** A gap shorter than this needs no snap-to-silence event after the tone before it (see `scheduleToneAt`) */
const SNAP_GAP_MS = 35;

/** A token placed on the audio clock, waiting for its turn to start sounding. */
interface TimelineToken {
  token: string;
  idx: number;
  endIdx: number;
  /** Audio-clock time at which it starts */
  at: number;
  /** Tones of its elements: start offset from `at` and length, in ms */
  elements: { offset: number; dur: number }[];
  /** Dots and dashes of the character, for the progress shown while it plays */
  morse: string;
  source: 'rx' | 'tx';
  /** The character is handed to WinKeyer, MIDI and the relay when it starts (not for local-only playback) */
  external: boolean;
  /** Who the typed character is shown for in Lens; null in practice and replays */
  lens: { source: 'rx' | 'tx'; name?: string; color?: string } | null;
}

/** A received (relay) character placed on the audio clock. */
interface RxToken {
  char: string;
  at: number;
  elements: { offset: number; dur: number }[];
  morse: string;
  source: 'rx' | 'tx';
  name?: string;
  color?: string;
  /** Output is suppressed (loop detection): Lens still shows the character */
  suppressed: boolean;
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

  /** Timers of the things shown or felt while a local token plays (sprite, Lens, symbols, vibration); they never carry the timing */
  private timelineTimers = new Set<ReturnType<typeof setTimeout>>();
  private timelineActive = false;
  private timelineKeyDown = false;

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
    if (this.timelineActive) this.cancelTimeline();
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
      await this.runTimeline(signal, replay);
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

  // ---- Playback on the audio clock ----

  /** The timings of the current speed and Farnsworth settings. */
  private currentTimings(s: ReturnType<SettingsService['settings']>): ReturnType<typeof timingsFromWpm> {
    const fwSource = s.encoderMode === 'practice' ? s.practiceSource : s.encoderSource;
    return adjustGapTimings(timingsFromWpm(s.encoderWpm), s.encoderWpm, fwSource, s);
  }

  /** The page-clock time (ms) of an audio-clock time; without audio the timeline already runs on the page clock. */
  private perfOf(t: number): number {
    return this.audioOutput.perfTimeOf(t) ?? t * 1000;
  }

  /**
   * Play the text with the timing kept on the audio clock. Every token's start is the previous start plus
   * the previous length, computed in audio time, so tones, gaps, letter gaps, word gaps and pauses are exact
   * whatever the page is doing. Tokens are placed about `TIMELINE_LEAD_S` ahead of the one sounding; the
   * timers here only wake the loop and move the sent index (the highlight) just before a token starts. The
   * sidetone and the opto output are placed on the audio clock and the serial pulses at the page-clock
   * times that belong to it; WinKeyer and the relay are handed each character then, and MIDI with its exact
   * start time, from which it places its notes with Web MIDI timestamps. A pause or
   * stop drops what is placed, and the token that was sounding is played again in full on resume.
   */
  private async runTimeline(signal: AbortSignal, replay: boolean): Promise<void> {
    const text = (): string => replay ? this.replayText : this.buffer();
    const index = (): number => replay ? this.replayIndex() : this.sentIndex();
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
    this.timelineActive = true;
    const queue: TimelineToken[] = [];
    let cursor = index();
    // When the next token to place starts
    let next = clock() + TIMELINE_START_S;
    try {
      for (;;) {
        // Place tokens until the audio clock has enough of them ahead
        while (cursor < text().length && next - clock() < TIMELINE_LEAD_S && !signal.aborted) {
          const { token, endIdx } = this.extractToken(text(), cursor);
          // The page stalled for longer than the look-ahead: carry on from now rather than in the past
          if (next < clock()) next = clock() + 0.005;
          const placed = this.placeToken(token, cursor, endIdx, next, replay);
          queue.push(placed.token);
          next += placed.lengthMs / 1000;
          cursor = endIdx;
        }
        if (signal.aborted) return;

        if (queue.length === 0) {
          if (cursor < text().length) {
            await wait(next - TIMELINE_LEAD_S);
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

        const head = queue.shift() as TimelineToken;
        // Wake a little early, so the outputs that time themselves can be handed the exact start time
        await wait(head.at - TIMELINE_FORWARD_S);
        if (signal.aborted) return;
        // The token that was sounding when a pause came is played again: its index has not changed
        if (head.idx !== index()) {
          const dropped = setIndex(head.idx);
          if (dropped) {
            cursor -= dropped;
            for (const q of queue) {
              q.idx -= dropped;
              q.endIdx -= dropped;
            }
          }
        }
        if (head.external) this.forwardToken(head.token, index(), replay, this.perfOf(head.at));
        await wait(head.at);
        if (signal.aborted) return;
        this.startToken(head, replay);
      }
    } finally {
      this.timelineActive = false;
      if (signal.aborted) this.cancelTimeline();
    }
  }

  /**
   * Place the dits and dahs of a character at `at`: sidetone and opto on the audio clock, and, when `serial`
   * is set, the serial pulses at the matching page-clock times. Returns each element's start offset and length.
   */
  private placeElements(
    morse: string, at: number, timings: ReturnType<typeof timingsFromWpm>, source: 'rx' | 'tx', serial: boolean,
  ): { elements: { offset: number; dur: number }[]; lengthMs: number } {
    const elements: { offset: number; dur: number }[] = [];
    let offset = 0;
    for (let i = 0; i < morse.length; i++) {
      const dur = morse[i] === '.' ? timings.dit : timings.dah;
      const last = i === morse.length - 1;
      const t = at + offset / 1000;
      this.audioOutput.scheduleToneAt(t, dur, source, last || timings.intraChar > SNAP_GAP_MS);
      if (serial) this.serialOutput.schedulePulseAt(this.perfOf(t), dur, source);
      elements.push({ offset, dur });
      offset += dur + (last ? 0 : timings.intraChar);
    }
    return { elements, lengthMs: offset + timings.interChar };
  }

  /** Put one token on the audio clock at `at` and say how long it takes (its sound, the gap after it, or a pause). */
  private placeToken(
    token: string, idx: number, endIdx: number, at: number, replay: boolean,
  ): { token: TimelineToken; lengthMs: number } {
    const s = this.settings.settings();
    const timings = this.currentTimings(s);
    const source = s.encoderSource;
    const external = !this.isLocalOnly(s);
    // Lens follows typed text; Copy Practice has its own view
    const lens = s.encoderMode === 'practice' || replay
      ? null
      : { source, name: s.encoderName || undefined, color: s.encoderColor || undefined };
    const placed: TimelineToken = { token, idx, endIdx, at, elements: [], morse: '', source, external, lens };

    const quarters = pauseQuarters(token);
    if (quarters > 0) return { token: placed, lengthMs: timings.interWord * quarters / 4 };
    // A word gap is 7 dit units; the 3 after the last element of the letter before it are already counted
    if (token === ' ') return { token: placed, lengthMs: timings.interWord - timings.interChar };
    const morse = MORSE_TABLE[token];
    if (!morse) return { token: placed, lengthMs: 0 };

    placed.morse = morse;
    const { elements, lengthMs } = this.placeElements(morse, at, timings, source, external);
    placed.elements = elements;
    return { token: placed, lengthMs };
  }

  /** Hand a character to WinKeyer, MIDI and the relay, once: a character played again after a pause is not sent twice. */
  private forwardToken(token: string, idx: number, replay: boolean, startAt: number): void {
    if (pauseQuarters(token) > 0) return;
    const forwarded = replay ? this.replayForwardedIndex : this.forwardedIndex;
    if (forwarded === idx) return;
    if (replay) this.replayForwardedIndex = idx;
    else this.forwardedIndex = idx;
    const es = this.settings.settings();
    const source = es.encoderSource;
    // WinKeyer handles its own timing; MIDI places its notes at exact times from the start time it is given
    this.winkeyerOutput.forwardDecodedChar(token, source);
    this.midiOutput.forwardDecodedChar(token, source, undefined, false, false, startAt);
    this.rtdbOutput.forwardEncoderChar(token, es.encoderWpm, es.encoderSource, es.encoderName, es.encoderColor);
  }

  /** A token has started sounding: the sprite, Lens, the symbols and the vibration follow its elements. */
  private startToken(q: TimelineToken, replay: boolean): void {
    this.typedPattern.set(null);
    if (replay) this.replayProgress.set({ index: q.idx, pattern: '' });
    if (q.lens && q.token !== ' ' && pauseQuarters(q.token) === 0) this.lens.show('encoder', q.lens, '', q.token, q.morse);
    q.elements.forEach((e, i) => {
      this.timelineLater(e.offset, () => {
        this.timelineKeyDown = true;
        this.elementEvent$.next({ down: true });
        void this.vibrationOutput.schedulePulse(e.dur, q.source);
        const pattern = q.morse.slice(0, i + 1);
        if (this.replayMode()) this.replayProgress.update(p => p && { ...p, pattern });
        if (q.lens) {
          this.lens.show('encoder', q.lens, pattern, q.token, q.morse);
          this.typedPattern.set({ pattern, source: q.source, color: q.lens.color });
        }
      });
      this.timelineLater(e.offset + e.dur, () => {
        this.timelineKeyDown = false;
        this.elementEvent$.next({ down: false });
      });
    });
  }

  private timelineLater(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timelineTimers.delete(id);
      fn();
    }, ms);
    this.timelineTimers.add(id);
  }

  /** Drop what the timeline has placed on the audio clock, its serial pulses and its pending timers. */
  private cancelTimeline(): void {
    for (const id of this.timelineTimers) clearTimeout(id);
    this.timelineTimers.clear();
    this.audioOutput.cancelScheduledTones();
    this.serialOutput.cancelPulses();
    if (this.timelineKeyDown) {
      this.timelineKeyDown = false;
      this.elementEvent$.next({ down: false });
    }
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
      await this.runRxTimeline();
    } finally {
      this.sidetonePlaying = false;
    }
  }

  /**
   * Play received (relay) characters on the same audio-clock timeline as typed text: each starts where the
   * previous one ends, tones go on the audio clock and the serial pulses at the matching page-clock times.
   * Characters keep arriving while it runs, so it places what is queued and goes on from its own end.
   */
  private async runRxTimeline(): Promise<void> {
    const clock = (): number => this.audioOutput.clockTime() ?? performance.now() / 1000;
    const wait = (until: number): Promise<void> => this.sleepMs(Math.max(0, (until - clock()) * 1000));
    await this.audioOutput.ready();
    const pending: RxToken[] = [];
    let next = clock() + TIMELINE_START_S;
    for (;;) {
      while (this.sidetoneQueue.length > 0 && next - clock() < TIMELINE_LEAD_S) {
        const entry = this.sidetoneQueue.shift() as SidetoneQueueEntry;
        if (next < clock()) next = clock() + 0.005;
        const placed = this.placeRxChar(entry, next);
        pending.push(placed.token);
        next += placed.lengthMs / 1000;
      }
      if (pending.length === 0) {
        if (this.sidetoneQueue.length > 0) {
          await wait(next - TIMELINE_LEAD_S);
          continue;
        }
        await wait(next);
        this.receivedPattern.set(null);
        if (this.sidetoneQueue.length > 0) continue;
        return;
      }
      const head = pending.shift() as RxToken;
      await wait(head.at);
      this.startRxChar(head);
    }
  }

  /** Put a received character on the audio clock at `at`; returns how long it takes. */
  private placeRxChar(entry: SidetoneQueueEntry, at: number): { token: RxToken; lengthMs: number } {
    const { char, source, wpm, name, color } = entry;
    const morse = char === ' ' ? '' : MORSE_TABLE[char] ?? '';
    const placed: RxToken = { char, at, elements: [], morse, source, name, color, suppressed: false };
    // Skip output if loop is suppressed (Lens still shows the received character)
    if (this.loopDetection.isSuppressed) {
      placed.suppressed = true;
      return { token: placed, lengthMs: 0 };
    }
    const charWpm = wpm ?? this.settings.settings().encoderWpm;
    const timings = adjustGapTimings(timingsFromWpm(charWpm), charWpm, source, this.settings.settings());
    if (char === ' ') return { token: placed, lengthMs: timings.interWord - timings.interChar };
    if (!morse) return { token: placed, lengthMs: 0 };
    // Played through all outputs based on their forward settings
    const { elements, lengthMs } = this.placeElements(morse, at, timings, source, true);
    placed.elements = elements;
    return { token: placed, lengthMs };
  }

  /** A received character has started sounding: Lens, the symbols and the vibration follow its elements. */
  private startRxChar(q: RxToken): void {
    const meta = { source: q.source, name: q.name, color: q.color };
    this.receivedPattern.set(null);
    if (q.suppressed) {
      if (q.char !== ' ' && q.morse) this.lens.show('rtdb', meta, q.morse, q.char);
      return;
    }
    if (q.char === ' ') return;
    this.lens.show('rtdb', meta, '', q.char, q.morse);
    q.elements.forEach((e, i) => {
      setTimeout(() => {
        const pattern = q.morse.slice(0, i + 1);
        this.lens.show('rtdb', meta, pattern, q.char, q.morse);
        this.receivedPattern.set({ pattern, source: q.source, color: q.color });
        void this.vibrationOutput.schedulePulse(e.dur, q.source);
      }, e.offset);
    });
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
