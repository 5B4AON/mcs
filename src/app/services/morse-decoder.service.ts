/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { MORSE_REVERSE, timingsFromWpm } from '../morse-table';
import { AudioOutputService } from './audio-output.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { VibrationOutputService } from './vibration-output.service';
import { LoopDetectionService } from './loop-detection.service';

/**
 * Morse Decoder Service — dual-pool auto-calibrating morse decoder.
 *
 * Converts raw key-down/key-up timing events into decoded text.
 *
 * Two independent calibration pools:
 *  - **RX pool**: for incoming morse from audio inputs (mic pilot, CW tone).
 *    Auto-calibrates to the sender's speed using rolling averages of
 *    dit/dah durations and silence gaps.
 *  - **TX pool**: for locally-generated morse from keyboard / mouse / touch
 *    straight-key inputs where the operator controls timing.
 *
 * Each input (Mic, CW, Keyboard, Mouse, Touch) can be assigned to either
 * the RX or TX pool via the `keySource` property. The assignment determines
 * which pool's calibration is used for classifying dits vs dahs and timing
 * character/word boundaries.
 *
 * Perfect-timing mode:
 *  When `perfectTiming` is true (set by the iambic keyer for paddle-generated
 *  elements), the decoder uses the known keyer WPM to compute a fixed
 *  dit/dah threshold. No calibration samples are recorded because the
 *  keyer produces mathematically perfect timing that would skew the
 *  adaptive calibration meant for human-variable input.
 *
 * Auto-calibration strategy (when perfectTiming is false):
 *  - Every interval (key press or silence gap) is expressed in "dit units":
 *      dit = 1 unit, dah = 3 units, intra-char gap = 1, inter-char = 3, word = 7
 *  - Dividing each measured duration by its expected unit-count yields an
 *    estimate of the current dit-unit length.
 *  - A rolling average of these estimates converges to the sender's speed,
 *    automatically adapting to different operators.
 *
 * Output:
 *  - decodedText signal: flat string of all decoded characters
 *  - taggedOutput signal: array of {type, char} for RX/TX colour coding
 *  - rxEstimatedWpm / txEstimatedWpm signals: current speed estimates
 */
@Injectable({ providedIn: 'root' })
export class MorseDecoderService {
  /** Decoded text output */
  readonly decodedText = signal('');

  /** Current in-progress morse pattern (dits/dahs of current char) */
  readonly currentPattern = signal('');

  /** Source of the current in-progress pattern ('rx' or 'tx') */
  readonly currentSource = signal<'rx' | 'tx'>('rx');

  /**
   * Source tag for key events — determines which calibration pool is used.
   *
   * Callers set this BEFORE calling onKeyDown/onKeyUp. It controls:
   *  1. Which calibration pool (RX or TX) is used for dit/dah classification
   *  2. Which pool receives new calibration samples (when perfectTiming is false)
   *  3. The colour tag applied to decoded characters in the fullscreen modal
   *
   * Each input's source is configured in Settings (micInputSource, cwInputSource,
   * keyboardKeyerSource, mouseKeyerSource, touchKeyerSource).
   */
  keySource: 'rx' | 'tx' = 'rx';

  /**
   * Perfect-timing mode flag.
   *
   * Set to `true` by the iambic keyer when it auto-generates elements with
   * mathematically perfect durations (dit = 1 unit, dah = 3 units at WPM).
   * In this mode:
   *  - Classification uses the fixed keyer WPM threshold, not adaptive calibration
   *  - No samples are fed into any calibration pool
   *  - Silence gap timing still uses the keyer WPM for character/word boundaries
   *
   * Set to `false` for all human-timed inputs (straight key, audio detection)
   * where calibration is needed to adapt to the operator's speed.
   *
   * Callers set this BEFORE calling onKeyDown/onKeyUp.
   */
  perfectTiming = false;

  /**
   * Tagged output — each decoded character/space is paired with its source.
   * Used by the fullscreen modal to colour RX vs TX text.
   */
  readonly taggedOutput = signal<{ type: 'rx' | 'tx'; char: string; userName?: string; fromRtdb?: boolean; wpm?: number }[]>([]);

  // ---- RX calibration (audio input — mic / CW) ----
  readonly rxEstimatedWpm = signal(12);
  readonly rxAvgDit = signal(100);
  readonly rxAvgDah = signal(300);
  private rxDitSamples: number[] = [];
  private rxDahSamples: number[] = [];
  private rxDitUnitSamples: number[] = [];

  // ---- TX calibration (keyer — keyboard / mouse / touch) ----
  readonly txEstimatedWpm = signal(12);
  readonly txAvgDit = signal(100);
  readonly txAvgDah = signal(300);
  private txDitSamples: number[] = [];
  private txDahSamples: number[] = [];
  private txDitUnitSamples: number[] = [];

  private readonly MAX_UNIT_SAMPLES = 40;
  private readonly MAX_SAMPLES = 20;

  private keyDownTime = 0;
  private keyUpTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private wordTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private settings: SettingsService,
    private audioOutput: AudioOutputService,
    private serialOutput: SerialKeyOutputService,
    private vibrationOutput: VibrationOutputService,
    private loopDetection: LoopDetectionService,
  ) {
    this.resetCalibration();
  }

  /** Reset both RX and TX calibration back to defaults */
  resetCalibration(): void {
    this.resetRxCalibration();
    this.resetTxCalibration();
  }

  /** Reset RX auto-calibration back to defaults */
  resetRxCalibration(): void {
    const t = timingsFromWpm(this.settings.settings().rxDecoderWpm);
    this.rxAvgDit.set(t.dit);
    this.rxAvgDah.set(t.dah);
    this.rxDitSamples = [];
    this.rxDahSamples = [];
    this.rxDitUnitSamples = [];
    this.rxEstimatedWpm.set(this.settings.settings().rxDecoderWpm);
  }

  /** Reset TX auto-calibration back to defaults */
  resetTxCalibration(): void {
    const t = timingsFromWpm(this.settings.settings().txDecoderWpm);
    this.txAvgDit.set(t.dit);
    this.txAvgDah.set(t.dah);
    this.txDitSamples = [];
    this.txDahSamples = [];
    this.txDitUnitSamples = [];
    this.txEstimatedWpm.set(this.settings.settings().txDecoderWpm);
  }

  /**
   * Call when key goes DOWN.
   *
   * Measures the silence gap since the previous key-up. For human-timed
   * inputs (perfectTiming = false), the gap is classified and fed into
   * the active calibration pool (RX or TX per keySource). For keyer-
   * generated elements (perfectTiming = true), the gap is still used
   * for character/word boundary detection but no calibration occurs.
   */
  onKeyDown(): void {
    const now = performance.now();

    // If there was a previous key-up, measure the silence gap
    if (this.keyUpTime > 0) {
      const silenceMs = now - this.keyUpTime;
      this.handleSilence(silenceMs);

      // Only feed silence gaps into calibration for human-timed input
      if (!this.perfectTiming) {
        const ditEst = this.currentAvgDit();
        if (silenceMs < ditEst * 2) {
          this.addDitUnitSample(silenceMs / 1);   // intra-char = 1 unit
        } else if (silenceMs < ditEst * 5) {
          this.addDitUnitSample(silenceMs / 3);   // inter-char = 3 units
        } else {
          this.addDitUnitSample(silenceMs / 7);   // word gap = 7 units
        }
      }
    }

    // Cancel pending timers
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.wordTimer) { clearTimeout(this.wordTimer); this.wordTimer = null; }

    this.keyDownTime = now;

    // Activate output tone, serial key, and vibration (unless loop suppressed)
    if (!this.loopDetection.isSuppressed) {
      this.audioOutput.keyDown(this.keySource);
      this.serialOutput.keyDown(this.keySource);
      this.vibrationOutput.keyDown(this.keySource);
    }
  }

  /**
   * Call when key goes UP.
   *
   * Measures the key-down duration and classifies it as dit or dah.
   *
   * - **perfectTiming = true** (keyer paddle output): Uses a fixed threshold
   *   computed from keyerWpm. No calibration samples are recorded because
   *   the keyer produces exact timing that should not influence adaptive pools.
   *
   * - **perfectTiming = false** (straight key / audio input): Uses the
   *   adaptive threshold from the active calibration pool (RX or TX per
   *   keySource). Duration samples are recorded to update the pool's
   *   rolling average and estimated WPM.
   */
  onKeyUp(): void {
    const now = performance.now();
    if (this.keyDownTime === 0) return;

    const durationMs = now - this.keyDownTime;
    this.keyUpTime = now;

    // Deactivate output tone, serial key, and vibration
    this.audioOutput.keyUp();
    this.serialOutput.keyUp();
    this.vibrationOutput.keyUp();

    // Choose threshold: fixed keyer timing for perfect elements,
    // adaptive calibration for human-timed input
    const threshold = this.perfectTiming
      ? this.getKeyerThreshold()
      : this.currentThreshold();

    if (durationMs < threshold) {
      this.currentPattern.update(p => p + '.');
      this.currentSource.set(this.keySource);
      if (!this.perfectTiming) {
        this.pushSample(this.currentDitSamples(), durationMs);
        this.currentAvgDitSignal().set(this.avg(this.currentDitSamples()));
        this.addDitUnitSample(durationMs / 1);   // dit = 1 unit
      }
    } else {
      this.currentPattern.update(p => p + '-');
      this.currentSource.set(this.keySource);
      if (!this.perfectTiming) {
        this.pushSample(this.currentDahSamples(), durationMs);
        this.currentAvgDahSignal().set(this.avg(this.currentDahSamples()));
        this.addDitUnitSample(durationMs / 3);   // dah = 3 units
      }
    }

    // Start silence timers for character/word boundary detection.
    // Use keyer WPM timing for perfect elements, adaptive dit average otherwise.
    const du = this.perfectTiming
      ? timingsFromWpm(this.settings.settings().keyerWpm).dit
      : this.currentAvgDit();
    const charTimeout = du * 2.5; // ~3 dit units
    const wordTimeout = du * 6;   // ~7 dit units

    this.silenceTimer = setTimeout(() => {
      this.finishCharacter();
    }, charTimeout);

    this.wordTimer = setTimeout(() => {
      this.finishWord();
    }, wordTimeout);
  }

  /** Clear all decoded text */
  clearOutput(): void {
    this.decodedText.set('');
    this.currentPattern.set('');
    this.taggedOutput.set([]);
  }

  // ---- source-routed helpers ----
  //
  // These methods route reads/writes to the correct calibration pool
  // (RX or TX) based on the current `keySource` value. This avoids
  // duplicating the onKeyDown/onKeyUp logic for each pool.

  /** Get avgDit value for the current source's calibration pool */
  private currentAvgDit(): number {
    return this.keySource === 'tx' ? this.txAvgDit() : this.rxAvgDit();
  }

  /** Get the avgDit WritableSignal for the current source (for .set()) */
  private currentAvgDitSignal() {
    return this.keySource === 'tx' ? this.txAvgDit : this.rxAvgDit;
  }

  /** Get the avgDah WritableSignal for the current source (for .set()) */
  private currentAvgDahSignal() {
    return this.keySource === 'tx' ? this.txAvgDah : this.rxAvgDah;
  }

  /** Get dit duration samples array for the current source's pool */
  private currentDitSamples(): number[] {
    return this.keySource === 'tx' ? this.txDitSamples : this.rxDitSamples;
  }

  /** Get dah duration samples array for the current source's pool */
  private currentDahSamples(): number[] {
    return this.keySource === 'tx' ? this.txDahSamples : this.rxDahSamples;
  }

  /** Get dit-unit estimate samples array for the current source's pool */
  private currentDitUnitSamples(): number[] {
    return this.keySource === 'tx' ? this.txDitUnitSamples : this.rxDitUnitSamples;
  }

  /** Get estimated WPM WritableSignal for the current source's pool */
  private currentEstimatedWpmSignal() {
    return this.keySource === 'tx' ? this.txEstimatedWpm : this.rxEstimatedWpm;
  }

  /**
   * Current WPM for the active source — used to tag decoded characters.
   * Keyer (perfectTiming) uses the fixed keyer WPM setting;
   * all other inputs use the auto-calibrated pool estimate.
   */
  private currentSourceWpm(): number {
    if (this.perfectTiming) return this.settings.settings().keyerWpm;
    return this.keySource === 'tx' ? this.txEstimatedWpm() : this.rxEstimatedWpm();
  }

  /**
   * Dit/dah threshold for the current source's adaptive calibration pool.
   * Mid-point between the pool's rolling dit and dah averages.
   */
  private currentThreshold(): number {
    const avgDit = this.keySource === 'tx' ? this.txAvgDit() : this.rxAvgDit();
    const avgDah = this.keySource === 'tx' ? this.txAvgDah() : this.rxAvgDah();
    return (avgDit + avgDah) / 2;
  }

  /**
   * Dit/dah threshold for keyer-generated elements (perfect timing).
   * Computed from the known keyerWpm setting — mid-point between
   * the standard dit (1 unit) and dah (3 units) durations.
   */
  private getKeyerThreshold(): number {
    const t = timingsFromWpm(this.settings.settings().keyerWpm);
    return (t.dit + t.dah) / 2;
  }

  // ---- internals ----

  /**
   * Process a silence gap for character/word boundary detection.
   * Uses the appropriate dit-unit estimate: keyer WPM for perfect timing,
   * or the active calibration pool's avgDit for human-timed input.
   */
  private handleSilence(silenceMs: number): void {
    const ditUnit = this.perfectTiming
      ? timingsFromWpm(this.settings.settings().keyerWpm).dit
      : this.currentAvgDit();
    const wordThreshold = ditUnit * 6;
    if (silenceMs > wordThreshold) {
      this.finishCharacter();
      this.finishWord();
    } else {
      const charThreshold = ditUnit * 2.5;
      if (silenceMs > charThreshold) {
        this.finishCharacter();
      }
    }
  }

  private finishCharacter(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }

    const pattern = this.currentPattern();
    if (!pattern) return;

    const char = MORSE_REVERSE[pattern] || '?';
    const wpm = this.currentSourceWpm();
    this.decodedText.update(t => t + char);
    this.taggedOutput.update(arr => [...arr, { type: this.keySource, char, wpm }]);
    this.currentPattern.set('');
  }

  private finishWord(): void {
    if (this.wordTimer) { clearTimeout(this.wordTimer); this.wordTimer = null; }
    this.finishCharacter();

    const text = this.decodedText();
    if (text.length > 0 && !text.endsWith(' ')) {
      const wpm = this.currentSourceWpm();
      this.decodedText.update(t => t + ' ');
      this.taggedOutput.update(arr => [...arr, { type: this.keySource, char: ' ', wpm }]);
    }
  }

  private pushSample(arr: number[], value: number): void {
    arr.push(value);
    if (arr.length > this.MAX_SAMPLES) arr.shift();
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 100;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /** Add a dit-unit estimate and recalculate WPM for the current source */
  private addDitUnitSample(ditUnitMs: number): void {
    // Sanity: reject extreme outliers (< 10ms or > 1000ms per dit-unit)
    if (ditUnitMs < 10 || ditUnitMs > 1000) return;

    const samples = this.currentDitUnitSamples();
    samples.push(ditUnitMs);
    if (samples.length > this.MAX_UNIT_SAMPLES) {
      samples.shift();
    }

    // Median is more robust than mean against outliers
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDitMs = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    const wpm = Math.round(1200 / medianDitMs);
    this.currentEstimatedWpmSignal().set(Math.max(1, Math.min(60, wpm)));
  }
}
