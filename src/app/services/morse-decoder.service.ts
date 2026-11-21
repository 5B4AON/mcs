/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, InputPath } from './settings.service';
import { OutputForward } from './settings-common';
import { MORSE_REVERSE, timingsFromWpm } from '../morse-table';
import { AudioOutputService } from './audio-output.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { VibrationOutputService } from './vibration-output.service';
import { MidiOutputService } from './midi-output.service';
import { LoopDetectionService } from './loop-detection.service';
import { LensService } from './lens.service';
import { SendPracticeGateService } from './send-practice-gate.service';
import {
  analyseElements, MAX_ELEMENT_MS, MIN_ELEMENT_MS, pushElement, unitFromDitDah,
} from './decoder-calibration';

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
  /**
   * True when the audio comes from a loaded audio file: it is heard on the
   * speakers by itself, so the sidetone and vibration stay quiet, and the
   * text is marked so it can be kept off the outputs.
   */
  fromFile?: boolean;
  /** Optional display name (e.g. MIDI mapping name or RTDB callsign) */
  name?: string;
  /** Optional text colour override (CSS colour string from MIDI mapping) */
  color?: string;
  /**
   * True when the input classifies its own elements and gaps (the CW tone
   * detector does it on the audio clock): key events then only drive the
   * monitoring outputs, and text arrives through externalPattern(),
   * externalCharacter() and externalWord().
   */
  externalTiming?: boolean;
}

/** One decoded character or space with its source and metadata */
export interface TaggedEntry {
  type: 'rx' | 'tx';
  char: string;
  inputPath?: InputPath;
  name?: string;
  color?: string;
  fromRtdb?: boolean;
  fromMidi?: boolean;
  fromSerial?: boolean;
  /** Decoded from a loaded audio file */
  fromFile?: boolean;
  /** Not a character: the text that follows starts a new line (the CW tone decoder locked onto another signal) */
  newLine?: boolean;
  wpm?: number;
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
  externalTiming: boolean;
  fromMidi: boolean;
  fromSerial: boolean;
  fromFile: boolean;
  name: string;
  color: string;
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
 *  - The latest key-down times of a pool (`decoder-calibration.ts`) are split into a short and a
 *    long group, the dits and the dahs; their medians set the dit/dah threshold and the speed
 *  - What was keyed lately decides, not what the decoder believed before, so a wrong belief
 *    cannot keep itself alive: after a long hold or a big change of speed correct keying is
 *    followed again within a few characters
 *  - A key-down held longer than a dah at about 3 WPM still reads as a dah but is not learned from,
 *    and pauses never teach the speed
 *
 * Output:
 *  - taggedOutput signal: the newest decoded entries {type, char, inputPath} (older ones rotate out);
 *    read new ones with taggedSince() and the running count taggedTotal
 *  - rxCurrentPattern / txCurrentPattern: per-source in-progress patterns
 *  - rxEstimatedWpm / txEstimatedWpm: current speed estimates
 */
@Injectable({ providedIn: 'root' })
export class MorseDecoderService {
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

  /** Announces every key-down on any input pipeline (before outputs are activated); used to point out that audio is stopped */
  readonly keyDown$ = new Subject<{ path: InputPath; fromFile: boolean }>();

  /**
   * Tagged output — each decoded character/space is paired with its source,
   * input path, and metadata. Used for output forwarding (RTDB, MIDI,
   * WinKeyer) and Send practice. Only the newest TAGGED_KEEP entries are
   * kept: consumers only need the entries they have not seen yet, and the
   * display buffers hold the text. `taggedTotal` counts every entry since
   * the last clear, so a consumer can tell which ones are new.
   */
  readonly taggedOutput = signal<TaggedEntry[]>([]);

  /** Entries added since the last clear (not just those still kept) */
  taggedTotal = 0;

  private readonly TAGGED_KEEP = 1000;

  /** Add one tagged entry; the oldest ones rotate out. */
  pushTagged(entry: TaggedEntry): void {
    this.taggedTotal++;
    this.taggedOutput.update(arr => (
      arr.length >= this.TAGGED_KEEP ? [...arr.slice(arr.length - this.TAGGED_KEEP + 1), entry] : [...arr, entry]
    ));
  }

  /**
   * The entries added after the first `seen` ones (a consumer's last
   * `taggedTotal`). After a clear, or if it fell further behind than the
   * kept entries, it gets everything that is still there. Reads the signal,
   * so an effect that calls it runs again when entries arrive.
   */
  taggedSince(seen: number): TaggedEntry[] {
    const kept = this.taggedOutput();
    const firstKept = this.taggedTotal - kept.length;
    const from = seen > this.taggedTotal ? 0 : Math.max(seen, firstKept);
    return kept.slice(from - firstKept);
  }

  // ---- RX calibration pool (shared across all RX-source pipelines) ----
  readonly rxEstimatedWpm = signal(12);
  readonly rxAvgDit = signal(100);
  readonly rxAvgDah = signal(300);
  private rxElementSamples: number[] = [];

  // ---- TX calibration pool (shared across all TX-source pipelines) ----
  readonly txEstimatedWpm = signal(12);
  readonly txAvgDit = signal(100);
  readonly txAvgDah = signal(300);
  private txElementSamples: number[] = [];

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
    private lens: LensService,
    private sendPracticeGate: SendPracticeGateService,
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
    this.rxElementSamples = [];
    this.rxEstimatedWpm.set(this.settings.settings().rxDecoderWpm);
  }

  /** Reset TX auto-calibration back to defaults */
  resetTxCalibration(): void {
    const t = timingsFromWpm(this.settings.settings().txDecoderWpm);
    this.txAvgDit.set(t.dit);
    this.txAvgDah.set(t.dah);
    this.txElementSamples = [];
    this.txEstimatedWpm.set(this.settings.settings().txDecoderWpm);
  }

  /**
   * Call when key goes DOWN on a specific input pipeline.
   *
   * Measures the silence gap since the previous key-up on this pipeline and
   * uses it to end the character or the word in progress. Silences are never
   * fed into the calibration: a pause tells nothing about the speed.
   *
   * @param path    Identifies which input the event comes from
   * @param source  Which calibration pool to use ('rx' or 'tx')
   * @param opts    Optional flags (perfectTiming, fromMidi)
   */
  onKeyDown(path: InputPath, source: 'rx' | 'tx', opts?: DecoderKeyOptions): void {
    const pipeline = this.getOrCreatePipeline(path, source, opts);
    const now = performance.now();
    this.keyDown$.next({ path, fromFile: pipeline.fromFile });

    // If there was a previous key-up on this pipeline, measure the silence gap
    if (pipeline.keyUpTime > 0 && !pipeline.externalTiming) {
      const silenceMs = now - pipeline.keyUpTime;
      this.handleSilence(pipeline, path, silenceMs);
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

      // Sidetone / audio: all pipelines (monitoring), except a file that is heard by itself
      if (!pipeline.fromFile) {
        pipeline.activatedOutputs.add('audio');
        this.audioOutputRefCount++;
        this.audioOutput.keyDown(source);

        // Vibration: all pipelines (haptic monitoring)
        pipeline.activatedOutputs.add('vibration');
        this.vibrationOutputRefCount++;
        this.vibrationOutput.keyDown(source);
      }

      // Serial output: local keyer pipelines only.
      // Receive pipelines must not key the radio — the received signal
      // may BE from that radio, so keying it would create a loop.
      // Exception: when the user has enabled per-mapping relay from a
      // specific serial input to specific serial output(s).
      // Send practice on "This device only" keeps serial and MIDI silent.
      const externalAllowed = !this.sendPracticeGate.blocked();
      if (externalAllowed && !isReceive) {
        pipeline.activatedOutputs.add('serial');
        this.serialOutputRefCount++;
        this.serialOutput.keyDown(source);
      } else if (externalAllowed && pipeline.fromSerial) {
        const idx = this.extractInputIndex(path, 'serial');
        const outMappings = this.settings.settings().serialOutputMappings;
        if (idx !== undefined && this.hasRelayOutput(outMappings, idx, source)) {
          pipeline.activatedOutputs.add('serial');
          this.serialOutputRefCount++;
          this.serialOutput.keyDown(source, idx);
        }
      }

      // MIDI output: local keyer pipelines only.
      // Receive pipelines must not echo onto the MIDI bus or radio chain.
      // Exception: when the user has enabled per-mapping relay from a
      // specific MIDI input to specific MIDI output(s).
      if (externalAllowed && !isReceive) {
        pipeline.activatedOutputs.add('midi');
        this.midiOutputRefCount++;
        this.midiOutput.keyDown(source);
      } else if (externalAllowed && pipeline.fromMidi) {
        const idx = this.extractInputIndex(path, 'midi');
        const outMappings = this.settings.settings().midiOutputMappings;
        if (idx !== undefined && this.hasRelayOutput(outMappings, idx, source)) {
          pipeline.activatedOutputs.add('midi');
          this.midiOutputRefCount++;
          this.midiOutput.keyDown(source, idx);
        }
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

    if (pipeline.externalTiming) return;

    // Choose threshold: fixed keyer timing for perfect elements,
    // adaptive calibration for human-timed input
    const threshold = pipeline.perfectTiming
      ? this.getKeyerThreshold()
      : this.thresholdForSource(source);

    pipeline.pattern += durationMs < threshold ? '.' : '-';
    if (!pipeline.perfectTiming) this.learnElement(source, durationMs);

    this.updatePatternSignals(pipeline);
    // Use keyer WPM timing for perfect elements, adaptive dit average otherwise.
    const du = pipeline.perfectTiming
      ? timingsFromWpm(this.settings.settings().keyerWpm).dit
      : this.avgDitForSource(source);
    this.lens.show(`decoder:${path}`, this.lensMeta(pipeline), pipeline.pattern, null, pipeline.pattern, du);

    // Start silence timers for character/word boundary detection.
    const charTimeout = du * 2.5; // ~3 dit units
    const wordTimeout = du * 6;   // ~7 dit units

    pipeline.silenceTimer = setTimeout(() => {
      this.finishCharacter(pipeline, path);
    }, charTimeout);

    pipeline.wordTimer = setTimeout(() => {
      this.finishWord(pipeline, path);
    }, wordTimeout);
  }

  // ---- Inputs that classify their own timing (CW tone detector) ----

  /** Show the dots and dashes received so far for the character in progress */
  externalPattern(path: InputPath, source: 'rx' | 'tx', pattern: string, opts: DecoderKeyOptions, unitMs: number): void {
    const pipeline = this.getOrCreatePipeline(path, source, { ...opts, externalTiming: true });
    pipeline.pattern = pattern;
    this.updatePatternSignals(pipeline);
    this.lens.show(`decoder:${path}`, this.lensMeta(pipeline), pattern, null, pattern, unitMs);
  }

  /** Add a finished character, classified by the input itself */
  externalCharacter(path: InputPath, source: 'rx' | 'tx', pattern: string, opts: DecoderKeyOptions, wpm: number): void {
    const pipeline = this.getOrCreatePipeline(path, source, { ...opts, externalTiming: true });
    this.setEstimatedWpm(source, wpm);
    pipeline.pattern = pattern;
    this.finishCharacter(pipeline, path);
  }

  /** Add a word space, decided by the input itself */
  externalWord(path: InputPath, source: 'rx' | 'tx', opts: DecoderKeyOptions): void {
    const pipeline = this.getOrCreatePipeline(path, source, { ...opts, externalTiming: true });
    this.finishWord(pipeline, path);
  }

  /** The input locked onto a signal: what follows starts a new line */
  externalNewLine(path: InputPath, source: 'rx' | 'tx', opts: DecoderKeyOptions): void {
    const pipeline = this.getOrCreatePipeline(path, source, { ...opts, externalTiming: true });
    this.finishCharacter(pipeline, path);
    this.pushTagged({
      type: source, char: '\n', newLine: true, inputPath: path,
      fromFile: pipeline.fromFile || undefined, name: pipeline.name || undefined, color: pipeline.color || undefined,
    });
    // A word space after this would start the new line with a blank
    pipeline.trailingSpaceEmitted = true;
  }

  /** Drop the character in progress on one input (for example when it stops) */
  clearPattern(path: InputPath): void {
    const pipeline = this.pipelines.get(path);
    if (!pipeline || !pipeline.pattern) return;
    pipeline.pattern = '';
    this.updatePatternSignals(pipeline);
  }

  /** Speed measured by an input that classifies its own timing */
  private setEstimatedWpm(source: 'rx' | 'tx', wpm: number): void {
    if (!(wpm > 0)) return;
    this.estimatedWpmSignalForSource(source).set(Math.max(1, Math.min(60, Math.round(wpm))));
  }

  /** Clear all decoded text and pipeline state */
  clearOutput(): void {
    this.taggedTotal = 0;
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
    this.lens.reset();
  }

  // ---- Pipeline management ----

  /** Get or create a pipeline for an input path */
  private getOrCreatePipeline(path: InputPath, source: 'rx' | 'tx', opts?: DecoderKeyOptions): DecoderPipeline {
    let pipeline = this.pipelines.get(path);
    if (!pipeline) {
      pipeline = {
        source,
        perfectTiming: opts?.perfectTiming ?? false,
        externalTiming: opts?.externalTiming ?? false,
        fromMidi: opts?.fromMidi ?? false,
        fromSerial: opts?.fromSerial ?? false,
        fromFile: opts?.fromFile ?? false,
        name: opts?.name ?? '',
        color: opts?.color ?? '',
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
      pipeline.externalTiming = opts?.externalTiming ?? false;
      pipeline.fromMidi = opts?.fromMidi ?? false;
      pipeline.fromSerial = opts?.fromSerial ?? false;
      pipeline.fromFile = opts?.fromFile ?? false;
      pipeline.name = opts?.name ?? '';
      pipeline.color = opts?.color ?? '';
    }
    return pipeline;
  }

  // ---- Source-routed calibration helpers ----

  /** Get avgDit for a calibration pool */
  private avgDitForSource(source: 'rx' | 'tx'): number {
    return source === 'tx' ? this.txAvgDit() : this.rxAvgDit();
  }

  /** Get avgDah for a calibration pool */
  private avgDahForSource(source: 'rx' | 'tx'): number {
    return source === 'tx' ? this.txAvgDah() : this.rxAvgDah();
  }

  /** Get the latest key-down times of a pool */
  private elementSamplesForSource(source: 'rx' | 'tx'): number[] {
    return source === 'tx' ? this.txElementSamples : this.rxElementSamples;
  }

  /** Get the avgDit WritableSignal for a pool */
  private avgDitSignalForSource(source: 'rx' | 'tx') {
    return source === 'tx' ? this.txAvgDit : this.rxAvgDit;
  }

  /** Get the avgDah WritableSignal for a pool */
  private avgDahSignalForSource(source: 'rx' | 'tx') {
    return source === 'tx' ? this.txAvgDah : this.rxAvgDah;
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

  /** Source, name and colour of a pipeline for the Lens display. */
  private lensMeta(pipeline: DecoderPipeline) {
    return { source: pipeline.source, name: pipeline.name || undefined, color: pipeline.color || undefined };
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
    const fromMidi = pipeline.fromMidi || undefined;
    const fromSerial = pipeline.fromSerial || undefined;
    const fromFile = pipeline.fromFile || undefined;
    const name = pipeline.name || undefined;
    const color = pipeline.color || undefined;
    this.pushTagged({
      type: pipeline.source, char, inputPath: path, wpm, fromMidi, fromSerial, fromFile, name, color,
    });
    this.lens.complete(`decoder:${path}`, char);
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
      const fromFile = pipeline.fromFile || undefined;
      const name = pipeline.name || undefined;
      const color = pipeline.color || undefined;
      this.pushTagged({
        type: pipeline.source, char: ' ', inputPath: path, wpm, fromMidi, fromSerial, fromFile, name, color,
      });
    }
  }

  /**
   * Learn from one key-down time of a human-timed input: add it to its pool's latest times, find the dit and
   * dah lengths in them again and update the speed. A hold or a contact bounce is not learned from.
   */
  private learnElement(source: 'rx' | 'tx', durationMs: number): void {
    if (durationMs < MIN_ELEMENT_MS || durationMs > MAX_ELEMENT_MS) return;
    const current = { dit: this.avgDitForSource(source), dah: this.avgDahForSource(source) };
    const samples = pushElement(this.elementSamplesForSource(source), durationMs, current);
    if (source === 'tx') this.txElementSamples = samples;
    else this.rxElementSamples = samples;

    const est = analyseElements(samples, current);
    this.avgDitSignalForSource(source).set(est.dit);
    this.avgDahSignalForSource(source).set(est.dah);
    const wpm = Math.round(1200 / unitFromDitDah(est));
    this.estimatedWpmSignalForSource(source).set(Math.max(1, Math.min(60, wpm)));
  }

  /** Extract the input mapping index from an InputPath string, e.g. 'midiStraightKey:2' → 2 */
  private extractInputIndex(path: InputPath, prefix: 'midi' | 'serial'): number | undefined {
    const m = path.match(prefix === 'midi'
      ? /^midi(?:StraightKey|Paddle):(\d+)/
      : /^serial(?:StraightKey|Paddle):(\d+)/);
    return m ? parseInt(m[1], 10) : undefined;
  }

  /** Check whether any enabled output mapping relays from the given input index */
  private hasRelayOutput(
    mappings: readonly { enabled: boolean; forward: OutputForward; relayInputIndices: number[] }[],
    inputIndex: number,
    source: 'rx' | 'tx',
  ): boolean {
    return mappings.some(m =>
      m.enabled
      && (m.forward === 'both' || m.forward === source)
      && m.relayInputIndices?.includes(inputIndex),
    );
  }
}
