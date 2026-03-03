/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { MORSE_TABLE, timingsFromWpm } from '../morse-table';
import { AudioOutputService } from './audio-output.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { VibrationOutputService } from './vibration-output.service';
import { WinkeyerOutputService } from './winkeyer-output.service';
import { MidiOutputService } from './midi-output.service';
import { FirebaseRtdbService } from './firebase-rtdb.service';
import { LoopDetectionService } from './loop-detection.service';

/** Queue entry for playback of received characters through all matching outputs */
interface SidetoneQueueEntry { char: string; source: 'rx' | 'tx'; wpm?: number; }

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

  /** Whether TX is active */
  readonly isSending = signal(false);

  /** Currently sending (internal lock) */
  private sending = false;
  private abortController: AbortController | null = null;

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
  ) {}

  /** Enqueue text for sending */
  enqueue(text: string): void {
    this.buffer.update(b => b + text.toUpperCase());
    // In live mode, auto-start TX when characters are added
    if (this.settings.settings().encoderMode === 'live') {
      if (!this.isSending()) {
        this.startTx();
      } else {
        this.processSend();
      }
    }
  }

  /** Set entire buffer (e.g. from textarea) */
  setBuffer(text: string): void {
    const upper = text.toUpperCase();
    this.buffer.set(upper);
    // Don't reset sentIndex if the buffer just grew (append-style typing)
    if (this.sentIndex() > upper.length) {
      this.sentIndex.set(0);
    }
    // In live mode, auto-start TX when there is unsent text
    if (this.settings.settings().encoderMode === 'live' && upper.length > this.sentIndex()) {
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
    this.isSending.set(true);
    this.processSend();
  }

  /** Stop TX */
  stopTx(): void {
    this.isSending.set(false);
    this.abortController?.abort();
  }

  /** Toggle TX */
  toggleTx(): void {
    if (this.isSending()) {
      this.stopTx();
    } else {
      this.startTx();
    }
  }

  /** Clear the send buffer */
  clearBuffer(): void {
    this.stopTx();
    this.buffer.set('');
    this.sentIndex.set(0);
  }

  /** Submit text in 'enter' mode */
  submitText(text: string): void {
    this.buffer.set(text.toUpperCase());
    this.sentIndex.set(0);
    this.startTx();
  }

  // ---- internal send loop ----

  /**
   * Extract the next token from the buffer.
   * Returns either a single character or a prosign pattern (e.g., '<SK>').
   * Updates the provided index to point past the extracted token.
   */
  private extractToken(buffer: string, startIdx: number): { token: string; endIdx: number } {
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
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      while (this.isSending() && this.sentIndex() < this.buffer().length) {
        if (signal.aborted) break;

        const idx = this.sentIndex();
        const { token, endIdx } = this.extractToken(this.buffer(), idx);

        // Forward to WinKeyer (as TX source) — WinKeyer handles its own timing
        this.winkeyerOutput.forwardDecodedChar(token, 'tx');

        // Forward to MIDI output (as TX source) — plays elements at encoder WPM
        this.midiOutput.forwardDecodedChar(token, 'tx');

        // Forward to Firebase RTDB output (as TX source)
        this.rtdbOutput.forwardEncoderChar(token, this.settings.settings().encoderWpm);

        await this.sendCharacter(token, signal);
        this.sentIndex.set(endIdx);

        if (signal.aborted) break;

        // Inter-character space (3 dit units) — already included after last element
        // If next char is space, we handle it in sendCharacter
      }
    } finally {
      this.sending = false;
      if (this.sentIndex() >= this.buffer().length) {
        this.isSending.set(false);
      }
    }
  }

  private async sendCharacter(char: string, signal: AbortSignal): Promise<void> {
    const timings = timingsFromWpm(this.settings.settings().encoderWpm);

    if (char === ' ') {
      // Word space = 7 dit units total; 3 already elapsed as inter-char
      await this.sleep(timings.interWord - timings.interChar, signal);
      return;
    }

    const morse = MORSE_TABLE[char];
    if (!morse) return; // skip unknown chars

    for (let i = 0; i < morse.length; i++) {
      if (signal.aborted) return;

      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;

      // Play tone, pulse serial, and vibrate for the element duration
      await Promise.all([
        this.audioOutput.scheduleTone(duration, 'tx'),
        this.serialOutput.schedulePulse(duration, 'tx'),
        this.vibrationOutput.schedulePulse(duration, 'tx'),
      ]);

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
  enqueueRxPlayback(char: string, source: 'rx' | 'tx' = 'rx', wpm?: number): void {
    this.sidetoneQueue.push({ char, source, wpm });
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
        await this.playRxChar(entry.char, entry.source, entry.wpm);
      }
    } finally {
      this.sidetonePlaying = false;
    }
  }

  private async playRxChar(char: string, source: 'rx' | 'tx', wpm?: number): Promise<void> {
    // Skip output if loop is suppressed
    if (this.loopDetection.isSuppressed) return;
    const timings = timingsFromWpm(wpm ?? this.settings.settings().encoderWpm);

    if (char === ' ') {
      await this.sleepMs(timings.interWord - timings.interChar);
      return;
    }

    const morse = MORSE_TABLE[char];
    if (!morse) return;

    for (let i = 0; i < morse.length; i++) {
      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;

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
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
