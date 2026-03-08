/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService, InputPath } from './settings.service';
import { MORSE_REVERSE, timingsFromWpm } from '../morse-table';
import { AudioOutputService } from './audio-output.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { VibrationOutputService } from './vibration-output.service';
import { MidiOutputService } from './midi-output.service';
import { LoopDetectionService } from './loop-detection.service';

/**
 * Options for onKeyDown / onKeyUp calls.
 */
export interface DecoderKeyOptions {
  /** True for keyer-generated elements with mathematically perfect timing */
  perfectTiming?: boolean;
  /** True when the event originated from MIDI input (prevents echo loops) */
  fromMidi?: boolean;
  /** True when the event originated from serial input (prevents echo loops) */
  fromSerial?: boolean;
}

/**
 * Per-input decoder pipeline state.
 *
 * Each input path (e.g. 'mic', 'keyboardStraightKey', 'midiPaddle') gets
 * its own independent pipeline with timing state and pattern buffer. This
 * prevents simultaneous inputs from corrupting each other's decode state.
 */
/** Output categories tracked per-pipeline for independent ref counting. */
type PipelineOutput = 'audio' | 'serial' | 'vibration' | 'midi';

interface DecoderPipeline {
  source: 'rx' | 'tx';
  perfectTiming: boolean;
  fromMidi: boolean;
  fromSerial: boolean;
  keyDownTime: number;
  keyUpTime: number;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  wordTimer: ReturnType<typeof setTimeout> | null;
  pattern: string;
  /**
   * True after this pipeline has emitted a trailing space for the current
   * word. Prevents duplicate spaces and — critically — prevents a
   * late-firing word timer on pipeline A from inserting a space into
   * the taggedOutput after pipeline B has already started a new line.
   * Reset to false when the next character is decoded on this pipeline.
   */
  trailingSpaceEmitted: boolean;
  /**
   * Set of outputs that THIS pipeline currently has activated (key-down).
   * Used during keyUp to decrement only the ref counts this pipeline
   * incremented — ensuring that no pipeline can hold open outputs that
   * another pipeline activated.
   */
  activatedOutputs: Set<PipelineOutput>;
}

/**
 * Morse Decoder Service — multi-pipeline auto-calibrating morse decoder.
 *
 * Converts raw key-down/key-up timing events into decoded text.
 *
 * **Per-input pipelines:**
 *  Every input source (mic, CW audio, keyboard straight key, keyboard paddle,
 *  mouse, touch, MIDI straight key, MIDI paddle) gets its own independent
 *  decoder pipeline. Each pipeline maintains its own timing state (keyDown
 *  time, keyUp time, silence/word timers) and in-progress pattern buffer.
 *  This means simultaneous inputs do not corrupt each other's decode state.
 *
 * **Two shared calibration pools:**
 *  - **RX pool**: for incoming morse from audio inputs (mic pilot, CW tone).
 *    Auto-calibrates to the sender's speed using rolling averages of
 *    dit/dah durations and silence gaps.
 *  - **TX pool**: for locally-generated morse from keyboard / mouse / touch
 *    straight-key inputs where the operator controls timing.
 *
 * Each input's source ('rx' or 'tx') determines which calibration pool is
 * used for dit/dah classification and which pool receives calibration samples.
 *
 * **Perfect-timing mode:**
 *  When `perfectTiming` is true (set by the iambic keyer for paddle-generated
 *  elements), the pipeline uses the known keyer WPM to compute a fixed
 *  dit/dah threshold. No calibration samples are recorded because the
 *  keyer produces mathematically perfect timing.
 *
 * **Auto-calibration strategy** (when perfectTiming is false):
 *  - Every interval is expressed in "dit units" (dit=1, dah=3, gaps=1/3/7)
 *  - A rolling median of dit-unit estimates converges to the sender's speed
 *
 * Output:
 *  - decodedText signal: flat string of all decoded characters
 *  - taggedOutput signal: array of {type, char, inputPath} for colour coding
 *  - rxCurrentPattern / txCurrentPattern: per-source in-progress patterns
 *  - rxEstimatedWpm / txEstimatedWpm: current speed estimates
 */
@Injectable({ providedIn: 'root' })
export class MorseDecoderService {
  /** Decoded text output */
  readonly decodedText = signal('');

  /**
   * Per-source aggregate in-progress patterns.
   * All RX-source pipelines' patterns concatenated, and same for TX.
   * Used by the fullscreen modal to show correctly-coloured cursor patterns.
   */
  readonly rxCurrentPattern = signal('');
  readonly txCurrentPattern = signal('');

  /**
   * Current in-progress pattern — most recently modified pipeline's pattern.
   * Used by the main decoder panel cursor display.
   */
  readonly currentPattern = signal('');

  /**
   * Tagged output — each decoded character/space is paired with its source,
   * input path, and metadata. Used for conversation display and output
   * forwarding (RTDB, MIDI, WinKeyer).
   */
  readonly taggedOutput = signal<{
    type: 'rx' | 'tx';
    char: string;
    inputPath?: InputPath;
    userName?: string;
    fromRtdb?: boolean;
    fromMidi?: boolean;
    fromSerial?: boolean;
    wpm?: number;
  }[]>([]);

  // ---- RX calibration pool (shared across all RX-source pipelines) ----
  readonly rxEstimatedWpm = signal(12);
  readonly rxAvgDit = signal(100);
  readonly rxAvgDah = signal(300);
  private rxDitSamples: number[] = [];
  private rxDahSamples: number[] = [];
  private rxDitUnitSamples: number[] = [];

  // ---- TX calibration pool (shared across all TX-source pipelines) ----
  readonly txEstimatedWpm = signal(12);
  readonly txAvgDit = signal(100);
  readonly txAvgDah = signal(300);
  private txDitSamples: number[] = [];
  private txDahSamples: number[] = [];
  private txDitUnitSamples: number[] = [];

  private readonly MAX_UNIT_SAMPLES = 40;
  private readonly MAX_SAMPLES = 20;

  /** Per-input pipeline state — each InputPath has independent decode state */
  private pipelines = new Map<InputPath, DecoderPipeline>();

  /**
   * Per-output reference counts.
   *
   * Each output type is independently reference-counted. A pipeline only
   * increments the counters for outputs it actually activated (tracked in
   * `pipeline.activatedOutputs`), and only decrements those same counters
   * on keyUp. This guarantees:
   *
   * - No pipeline can hold open an output that another pipeline activated.
   * - The same isolation principle applies uniformly to ALL input types
   *   (MIDI, CW tone detector, mic, keyboard, mouse, touch).
   *
   * **Activation rules** (defined in onKeyDown):
   *
   * | Pipeline type                       | audio | serial | vibration | midi |
   * |-------------------------------------|-------|--------|-----------|------|
   * | Receive (mic, cwAudio, MIDI, Serial)|   ✓   |   ✗    |     ✓     |  ✗   |
   * | Local keyer (keyboard/mouse/touch)  |   ✓   |   ✓    |     ✓     |  ✓   |
   *
   * Receive pipelines (mic, cwAudio, MIDI straight/paddle, Serial
   * straight/paddle) must NOT activate serial or MIDI output. Their
   * signals may originate from the same physical chain — serial output
   * keys the radio whose CW feeds back into the CW detector or mic,
   * MIDI output echoes on the common MIDI bus, and serial input pins
   * may cross-talk with serial output pins on the same adapter.
   * Activating these would create a feedback loop.
   *
   * Local keyer pipelines (keyboard, mouse, touch) represent operator
   * intent to transmit and legitimately drive all outputs.
   */
  private audioOutputRefCount = 0;
  private serialOutputRefCount = 0;
  private vibrationOutputRefCount = 0;
  private midiOutputRefCount = 0;

  constructor(
    private settings: SettingsService,
    private audioOutput: AudioOutputService,
    private serialOutput: SerialKeyOutputService,
    private vibrationOutput: VibrationOutputService,
    private midiOutput: MidiOutputService,
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
   * Call when key goes DOWN on a specific input pipeline.
   *
   * Measures the silence gap since the previous key-up on this pipeline.
   * For human-timed inputs (perfectTiming = false), the gap is classified
   * and fed into the active calibration pool (RX or TX per source).
   *
   * @param path    Identifies which input the event comes from
   * @param source  Which calibration pool to use ('rx' or 'tx')
   * @param opts    Optional flags (perfectTiming, fromMidi)
   */
  onKeyDown(path: InputPath, source: 'rx' | 'tx', opts?: DecoderKeyOptions): void {
    const pipeline = this.getOrCreatePipeline(path, source, opts);
    const now = performance.now();

    // If there was a previous key-up on this pipeline, measure the silence gap
    if (pipeline.keyUpTime > 0) {
      const silenceMs = now - pipeline.keyUpTime;
      this.handleSilence(pipeline, path, silenceMs);

      // Only feed silence gaps into calibration for human-timed input
      if (!pipeline.perfectTiming) {
        const ditEst = this.avgDitForSource(source);
        if (silenceMs < ditEst * 2) {
          this.addDitUnitSample(source, silenceMs / 1);   // intra-char = 1 unit
        } else if (silenceMs < ditEst * 5) {
          this.addDitUnitSample(source, silenceMs / 3);   // inter-char = 3 units
        } else {
          this.addDitUnitSample(source, silenceMs / 7);   // word gap = 7 units
        }
      }
    }

    // Cancel pending timers for this pipeline
    if (pipeline.silenceTimer) { clearTimeout(pipeline.silenceTimer); pipeline.silenceTimer = null; }
    if (pipeline.wordTimer) { clearTimeout(pipeline.wordTimer); pipeline.wordTimer = null; }

    pipeline.keyDownTime = now;

    // Activate outputs for this pipeline — per-pipeline tracking ensures
    // independent reference counting. Each pipeline records which outputs
    // it activated so that onKeyUp only decrements those same ref counts.
    //
    // Receive pipelines (mic, cwAudio, MIDI, Serial) activate ONLY
    // monitoring outputs (sidetone + vibration). They must NOT drive
    // serial or MIDI output because their signal may originate from the
    // same physical chain — creating a feedback loop.
    //
    // Local keyer pipelines (keyboard, mouse, touch) represent operator
    // intent to transmit and activate ALL outputs.
    if (!this.loopDetection.isSuppressed) {
      const isReceive = path === 'mic' || path === 'cwAudio' || pipeline.fromMidi || pipeline.fromSerial;

      // Sidetone / audio: all pipelines (monitoring)
      pipeline.activatedOutputs.add('audio');
      this.audioOutputRefCount++;
      this.audioOutput.keyDown(source);

      // Vibration: all pipelines (haptic monitoring)
      pipeline.activatedOutputs.add('vibration');
      this.vibrationOutputRefCount++;
      this.vibrationOutput.keyDown(source);

      // Serial output: local keyer pipelines only.
      // Receive pipelines must not key the radio — the received signal
      // may BE from that radio, so keying it would create a loop.
      if (!isReceive) {
        pipeline.activatedOutputs.add('serial');
        this.serialOutputRefCount++;
        this.serialOutput.keyDown(source);
      }

      // MIDI output: local keyer pipelines only.
      // Receive pipelines must not echo onto the MIDI bus or radio chain.
      if (!isReceive) {
        pipeline.activatedOutputs.add('midi');
        this.midiOutputRefCount++;
        this.midiOutput.keyDown(source);
      }
    }
  }

  /**
   * Call when key goes UP on a specific input pipeline.
   *
   * Measures the key-down duration and classifies it as dit or dah.
   *
   * @param path    Identifies which input the event comes from
   * @param source  Which calibration pool to use ('rx' or 'tx')
   * @param opts    Optional flags (perfectTiming, fromMidi)
   */
  onKeyUp(path: InputPath, source: 'rx' | 'tx', opts?: DecoderKeyOptions): void {
    const pipeline = this.getOrCreatePipeline(path, source, opts);
    const now = performance.now();
    if (pipeline.keyDownTime === 0) return;

    const durationMs = now - pipeline.keyDownTime;
    pipeline.keyUpTime = now;

    // Per-pipeline output deactivation: only decrement ref counts for
    // outputs that THIS pipeline activated. This ensures no pipeline can
    // hold open outputs that belong to another pipeline.
    for (const output of pipeline.activatedOutputs) {
      switch (output) {
        case 'audio':
          if (--this.audioOutputRefCount <= 0) { this.audioOutputRefCount = 0; this.audioOutput.keyUp(); }
          break;
        case 'serial':
          if (--this.serialOutputRefCount <= 0) { this.serialOutputRefCount = 0; this.serialOutput.keyUp(); }
          break;
        case 'vibration':
          if (--this.vibrationOutputRefCount <= 0) { this.vibrationOutputRefCount = 0; this.vibrationOutput.keyUp(); }
          break;
        case 'midi':
          if (--this.midiOutputRefCount <= 0) { this.midiOutputRefCount = 0; this.midiOutput.keyUp(); }
          break;
      }
    }
    pipeline.activatedOutputs.clear();

    // Choose threshold: fixed keyer timing for perfect elements,
    // adaptive calibration for human-timed input
    const threshold = pipeline.perfectTiming
      ? this.getKeyerThreshold()
      : this.thresholdForSource(source);

    if (durationMs < threshold) {
      pipeline.pattern += '.';
      if (!pipeline.perfectTiming) {
        this.pushSample(this.ditSamplesForSource(source), durationMs);
        this.avgDitSignalForSource(source).set(this.avg(this.ditSamplesForSource(source)));
        this.addDitUnitSample(source, durationMs / 1);   // dit = 1 unit
      }
    } else {
      pipeline.pattern += '-';
      if (!pipeline.perfectTiming) {
        this.pushSample(this.dahSamplesForSource(source), durationMs);
        this.avgDahSignalForSource(source).set(this.avg(this.dahSamplesForSource(source)));
        this.addDitUnitSample(source, durationMs / 3);   // dah = 3 units
      }
    }

    this.updatePatternSignals(pipeline);

    // Start silence timers for character/word boundary detection.
    // Use keyer WPM timing for perfect elements, adaptive dit average otherwise.
    const du = pipeline.perfectTiming
      ? timingsFromWpm(this.settings.settings().keyerWpm).dit
      : this.avgDitForSource(source);
    const charTimeout = du * 2.5; // ~3 dit units
    const wordTimeout = du * 6;   // ~7 dit units

    pipeline.silenceTimer = setTimeout(() => {
      this.finishCharacter(pipeline, path);
    }, charTimeout);

    pipeline.wordTimer = setTimeout(() => {
      this.finishWord(pipeline, path);
    }, wordTimeout);
  }

  /** Clear all decoded text and pipeline state */
  clearOutput(): void {
    this.decodedText.set('');
    this.taggedOutput.set([]);
    for (const p of this.pipelines.values()) {
      if (p.silenceTimer) clearTimeout(p.silenceTimer);
      if (p.wordTimer) clearTimeout(p.wordTimer);
    }
    this.pipelines.clear();
    const anyOutputActive = this.audioOutputRefCount > 0 || this.serialOutputRefCount > 0
      || this.vibrationOutputRefCount > 0 || this.midiOutputRefCount > 0;
    if (anyOutputActive) {
      this.audioOutputRefCount = 0;
      this.serialOutputRefCount = 0;
      this.vibrationOutputRefCount = 0;
      this.midiOutputRefCount = 0;
      this.audioOutput.keyUp();
      this.serialOutput.keyUp();
      this.vibrationOutput.keyUp();
      this.midiOutput.keyUp();
    }
    this.rxCurrentPattern.set('');
    this.txCurrentPattern.set('');
    this.currentPattern.set('');
  }

  // ---- Pipeline management ----

  /** Get or create a pipeline for an input path */
  private getOrCreatePipeline(path: InputPath, source: 'rx' | 'tx', opts?: DecoderKeyOptions): DecoderPipeline {
    let pipeline = this.pipelines.get(path);
    if (!pipeline) {
      pipeline = {
        source,
        perfectTiming: opts?.perfectTiming ?? false,
        fromMidi: opts?.fromMidi ?? false,
        fromSerial: opts?.fromSerial ?? false,
        keyDownTime: 0,
        keyUpTime: 0,
        silenceTimer: null,
        wordTimer: null,
        pattern: '',
        trailingSpaceEmitted: false,
        activatedOutputs: new Set<PipelineOutput>(),
      };
      this.pipelines.set(path, pipeline);
    } else {
      // Update mutable options (source/flags may change between calls)
      pipeline.source = source;
      pipeline.perfectTiming = opts?.perfectTiming ?? false;
      pipeline.fromMidi = opts?.fromMidi ?? false;
      pipeline.fromSerial = opts?.fromSerial ?? false;
    }
    return pipeline;
  }

  // ---- Source-routed calibration helpers ----

  /** Get avgDit for a calibration pool */
  private avgDitForSource(source: 'rx' | 'tx'): number {
    return source === 'tx' ? this.txAvgDit() : this.rxAvgDit();
  }

  /** Get the avgDit WritableSignal for a pool */
  private avgDitSignalForSource(source: 'rx' | 'tx') {
    return source === 'tx' ? this.txAvgDit : this.rxAvgDit;
  }

  /** Get the avgDah WritableSignal for a pool */
  private avgDahSignalForSource(source: 'rx' | 'tx') {
    return source === 'tx' ? this.txAvgDah : this.rxAvgDah;
  }

  /** Get dit samples array for a pool */
  private ditSamplesForSource(source: 'rx' | 'tx'): number[] {
    return source === 'tx' ? this.txDitSamples : this.rxDitSamples;
  }

  /** Get dah samples array for a pool */
  private dahSamplesForSource(source: 'rx' | 'tx'): number[] {
    return source === 'tx' ? this.txDahSamples : this.rxDahSamples;
  }

  /** Get dit-unit samples array for a pool */
  private ditUnitSamplesForSource(source: 'rx' | 'tx'): number[] {
    return source === 'tx' ? this.txDitUnitSamples : this.rxDitUnitSamples;
  }

  /** Get estimated WPM WritableSignal for a pool */
  private estimatedWpmSignalForSource(source: 'rx' | 'tx') {
    return source === 'tx' ? this.txEstimatedWpm : this.rxEstimatedWpm;
  }

  /**
   * Dit/dah threshold for a calibration pool.
   * Mid-point between the pool's rolling dit and dah averages.
   */
  private thresholdForSource(source: 'rx' | 'tx'): number {
    const avgDit = source === 'tx' ? this.txAvgDit() : this.rxAvgDit();
    const avgDah = source === 'tx' ? this.txAvgDah() : this.rxAvgDah();
    return (avgDit + avgDah) / 2;
  }

  /**
   * Dit/dah threshold for keyer-generated elements (perfect timing).
   * Computed from the known keyerWpm setting.
   */
  private getKeyerThreshold(): number {
    const t = timingsFromWpm(this.settings.settings().keyerWpm);
    return (t.dit + t.dah) / 2;
  }

  /**
   * Get the WPM for a pipeline — keyer WPM for perfect timing,
   * or the auto-calibrated pool estimate otherwise.
   */
  private pipelineWpm(pipeline: DecoderPipeline): number {
    if (pipeline.perfectTiming) return this.settings.settings().keyerWpm;
    return pipeline.source === 'tx' ? this.txEstimatedWpm() : this.rxEstimatedWpm();
  }

  // ---- Pattern signal management ----

  /**
   * Update all pattern-related signals after a pipeline's pattern changes.
   * Aggregates patterns by source across all pipelines.
   */
  private updatePatternSignals(activePipeline: DecoderPipeline): void {
    let rx = '', tx = '';
    for (const p of this.pipelines.values()) {
      if (p.pattern) {
        if (p.source === 'rx') rx += p.pattern;
        else tx += p.pattern;
      }
    }
    this.rxCurrentPattern.set(rx);
    this.txCurrentPattern.set(tx);
    // Backward-compat: show most recently modified pipeline's state
    this.currentPattern.set(activePipeline.pattern);
  }

  // ---- Internals ----

  /**
   * Process a silence gap for character/word boundary detection on a pipeline.
   */
  private handleSilence(pipeline: DecoderPipeline, path: InputPath, silenceMs: number): void {
    const ditUnit = pipeline.perfectTiming
      ? timingsFromWpm(this.settings.settings().keyerWpm).dit
      : this.avgDitForSource(pipeline.source);
    const wordThreshold = ditUnit * 6;
    if (silenceMs > wordThreshold) {
      this.finishCharacter(pipeline, path);
      this.finishWord(pipeline, path);
    } else {
      const charThreshold = ditUnit * 2.5;
      if (silenceMs > charThreshold) {
        this.finishCharacter(pipeline, path);
      }
    }
  }

  /** Finish the current character on a specific pipeline */
  private finishCharacter(pipeline: DecoderPipeline, path: InputPath): void {
    if (pipeline.silenceTimer) { clearTimeout(pipeline.silenceTimer); pipeline.silenceTimer = null; }

    const pattern = pipeline.pattern;
    if (!pattern) return;

    const char = MORSE_REVERSE[pattern] || '?';
    const wpm = this.pipelineWpm(pipeline);
    this.decodedText.update(t => t + char);
    const fromMidi = pipeline.fromMidi || undefined;
    const fromSerial = pipeline.fromSerial || undefined;
    this.taggedOutput.update(arr => [...arr, {
      type: pipeline.source, char, inputPath: path, wpm, fromMidi, fromSerial,
    }]);
    pipeline.pattern = '';
    // A real character was decoded — allow a future trailing space
    pipeline.trailingSpaceEmitted = false;
    this.updatePatternSignals(pipeline);
  }

  /**
   * Finish the current word on a specific pipeline.
   *
   * Uses a per-pipeline flag (trailingSpaceEmitted) AND a break-in check
   * to suppress stale trailing spaces:
   *  1. trailingSpaceEmitted prevents duplicate spaces within the same pipeline.
   *  2. If the most recent non-space character in taggedOutput belongs to a
   *     DIFFERENT pipeline, a break-in has occurred and this space would
   *     appear after the line change — suppress it entirely.
   */
  private finishWord(pipeline: DecoderPipeline, path: InputPath): void {
    if (pipeline.wordTimer) { clearTimeout(pipeline.wordTimer); pipeline.wordTimer = null; }
    this.finishCharacter(pipeline, path);

    if (!pipeline.trailingSpaceEmitted) {
      pipeline.trailingSpaceEmitted = true;

      // Check if another pipeline has produced output since this pipeline's
      // last character.  If so, emitting this space would create an unwanted
      // entry after the line break (e.g. a stale TX space appearing after
      // a new RX line has started).
      const tagged = this.taggedOutput();
      for (let i = tagged.length - 1; i >= 0; i--) {
        if (tagged[i].char !== ' ') {
          if (tagged[i].inputPath !== path) return; // break-in — suppress space
          break; // same pipeline — allow the space
        }
      }

      const wpm = this.pipelineWpm(pipeline);
      const fromMidi = pipeline.fromMidi || undefined;
      const fromSerial = pipeline.fromSerial || undefined;
      this.decodedText.update(t => t + ' ');
      this.taggedOutput.update(arr => [...arr, {
        type: pipeline.source, char: ' ', inputPath: path, wpm, fromMidi, fromSerial,
      }]);
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

  /** Add a dit-unit estimate and recalculate WPM for a calibration pool */
  private addDitUnitSample(source: 'rx' | 'tx', ditUnitMs: number): void {
    // Sanity: reject extreme outliers (< 10ms or > 1000ms per dit-unit)
    if (ditUnitMs < 10 || ditUnitMs > 1000) return;

    const samples = this.ditUnitSamplesForSource(source);
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
    this.estimatedWpmSignalForSource(source).set(Math.max(1, Math.min(60, wpm)));
  }
}
