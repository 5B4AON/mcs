/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';

/**
 * Loop Detection Service — detects and breaks feedback loops between
 * outputs and inputs.
 *
 * A feedback loop can occur when hardware or software routes an output
 * signal back into an input. For example:
 *  - Serial port key output → radio transmitter → radio receiver → CW audio input
 *  - Opto key output → radio → remote RTDB station → RTDB input
 *
 * Detection strategy:
 *  Maintains two sliding windows of recently output and recently input
 *  characters with timestamps. If a sequence of N or more consecutive
 *  characters appears in both windows within a configurable time
 *  tolerance, a loop is declared.
 *
 * Suppression:
 *  When a loop is detected, the `loopDetected` signal is set to true.
 *  Output services should check this signal and refuse to activate when
 *  true. After a cooldown period with no further loop matches, the
 *  suppression is automatically lifted.
 *
 * Not all character matches indicate a loop — the operator may
 * legitimately re-key the same characters. The detector requires
 * a minimum sequence length (default 3 chars) and a tight time
 * window (default 5 seconds) to reduce false positives.
 */

interface TimestampedChar {
  char: string;
  time: number;
}

@Injectable({ providedIn: 'root' })
export class LoopDetectionService {
  /** True when a feedback loop has been detected and outputs are suppressed */
  readonly loopDetected = signal(false);

  /** Human-readable message describing the detected loop */
  readonly loopMessage = signal<string | null>(null);

  /** Minimum consecutive matching characters to trigger loop detection */
  private readonly MIN_SEQUENCE = 6;

  /** Maximum time window (ms) between output and input for a match */
  private readonly TIME_WINDOW_MS = 5000;

  /** Cooldown (ms) after last loop detection before auto-clearing */
  private readonly COOLDOWN_MS = 8000;

  /** Maximum buffer size to prevent unbounded memory growth */
  private readonly MAX_BUFFER = 50;

  /** Recently output characters (sent by encoder, keyer, RTDB, etc.) */
  private outputBuffer: TimestampedChar[] = [];

  /** Recently input characters (received from decoder) */
  private inputBuffer: TimestampedChar[] = [];

  /** Timer for auto-clearing loop suppression */
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  /** Number of consecutive loop detections (for escalating cooldowns) */
  private consecutiveDetections = 0;

  /**
   * Record a character that was sent to an output.
   * Call this whenever a decoded character is forwarded to any output
   * (WinKeyer, RTDB, serial, opto, sidetone).
   */
  recordOutput(char: string): void {
    if (char === ' ') return; // ignore spaces — too common
    const now = performance.now();
    this.outputBuffer.push({ char, time: now });
    this.trimBuffer(this.outputBuffer, now);
  }

  /**
   * Record a character that arrived from an input source.
   * Call this whenever the decoder produces a new character from
   * any input (mic, CW audio, RTDB incoming).
   *
   * @returns true if a loop was detected (caller should suppress outputs)
   */
  recordInput(char: string): boolean {
    if (char === ' ') return this.loopDetected(); // ignore spaces
    const now = performance.now();
    this.inputBuffer.push({ char, time: now });
    this.trimBuffer(this.inputBuffer, now);

    if (this.checkForLoop(now)) {
      this.triggerSuppression();
      return true;
    }
    return this.loopDetected();
  }

  /** Manually clear loop suppression (e.g. user acknowledges the warning) */
  clearLoop(): void {
    this.loopDetected.set(false);
    this.loopMessage.set(null);
    this.consecutiveDetections = 0;
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  /** Check whether outputs should be suppressed */
  get isSuppressed(): boolean {
    return this.loopDetected();
  }

  // ---- Internal ----

  /**
   * Check if the most recent input characters match a recent output sequence.
   *
   * Strategy: Take the last MIN_SEQUENCE chars from the input buffer and
   * look for the same sequence in the output buffer within the time window.
   */
  private checkForLoop(now: number): boolean {
    if (this.inputBuffer.length < this.MIN_SEQUENCE) return false;
    if (this.outputBuffer.length < this.MIN_SEQUENCE) return false;

    // Extract last MIN_SEQUENCE input characters
    const recentInput = this.inputBuffer.slice(-this.MIN_SEQUENCE);
    const inputSequence = recentInput.map(c => c.char).join('');
    const inputStartTime = recentInput[0].time;

    // Search for this sequence in the output buffer within time window
    // The output should have occurred BEFORE the input (output → delay → input)
    for (let i = 0; i <= this.outputBuffer.length - this.MIN_SEQUENCE; i++) {
      const candidate = this.outputBuffer.slice(i, i + this.MIN_SEQUENCE);
      const candidateSequence = candidate.map(c => c.char).join('');

      if (candidateSequence !== inputSequence) continue;

      // Check timing: output should precede input within the time window
      const outputTime = candidate[0].time;
      const timeDiff = inputStartTime - outputTime;

      // Output should have happened before input, within the window
      // Allow a small negative tolerance for near-simultaneous events
      if (timeDiff >= -500 && timeDiff <= this.TIME_WINDOW_MS) {
        return true;
      }
    }

    return false;
  }

  private triggerSuppression(): void {
    this.consecutiveDetections++;
    this.loopDetected.set(true);
    this.loopMessage.set(
      `Feedback loop detected! The same character sequence appeared in both output and input ` +
      `within ${(this.TIME_WINDOW_MS / 1000).toFixed(0)}s. Outputs are temporarily suppressed ` +
      `to break the loop. Check your hardware wiring for unintended signal paths.`
    );

    // Clear after cooldown (escalate for repeated detections)
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
    }
    const cooldown = this.COOLDOWN_MS * Math.min(this.consecutiveDetections, 4);
    this.cooldownTimer = setTimeout(() => {
      // Only auto-clear if no new loop is detected
      this.loopDetected.set(false);
      this.loopMessage.set(null);
      // Reset buffers to prevent immediate re-trigger
      this.outputBuffer = [];
      this.inputBuffer = [];
    }, cooldown);
  }

  /** Remove entries older than the time window */
  private trimBuffer(buffer: TimestampedChar[], now: number): void {
    const cutoff = now - this.TIME_WINDOW_MS * 2; // keep 2x window for sequence matching
    while (buffer.length > 0 && buffer[0].time < cutoff) {
      buffer.shift();
    }
    // Hard limit
    while (buffer.length > this.MAX_BUFFER) {
      buffer.shift();
    }
  }
}
