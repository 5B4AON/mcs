/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

/**
 * AudioWorkletProcessor: CW Audio Tone Detector.
 *
 * PURPOSE:
 * Detects morse code keying from a CW audio tone coming from a radio
 * receiver, virtual audio cable, or any audio source. When a station
 * transmits morse, the receiver outputs a steady tone (typically 500–700 Hz)
 * during each dit or dah. This processor detects that tone.
 *
 * DETECTION METHOD:
 * Uses the Goertzel algorithm for narrow-band frequency detection.
 * Processes each 128-sample block (~2.67 ms at 48 kHz) to measure
 * the magnitude at the configured CW frequency.
 *
 * AUTO-THRESHOLD:
 * Maintains separate noise floor and signal peak trackers using
 * asymmetric exponential moving averages:
 * - Noise floor: falls fast (tracks minimum), rises slow
 * - Signal peak: rises fast (tracks maximum), falls slow
 * Threshold is set at 30% between noise and peak for fast key-down
 * detection. This automatically adapts to different signal strengths
 * and noise conditions.
 *
 * MESSAGES IN (from main thread):
 *   { frequency, sampleRate, debounceMs, autoThreshold, threshold }
 *   { calibrate: 'open'|'closed' }
 *
 * MESSAGES OUT (to main thread):
 *   { type: 'keyChange', down, time, magnitude }
 *   { type: 'level', magnitude, threshold, noiseFloor, signalPeak }
 *   { type: 'calibration', state, rms }
 */
class CwDetectProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Detection frequency (Hz)
    this.frequency = 600;
    this.sRate = 48000;
    this._updateGoertzelCoeff();

    // Threshold
    this.autoThreshold = true;
    this.manualThreshold = 0.01;

    // Auto-threshold tracking
    this.noiseFloor = 0;       // slow-rising tracker of minimum magnitude
    this.signalPeak = 0;       // slow-falling tracker of maximum magnitude
    this.autoTh = 0;           // computed auto threshold
    this.warmupBlocks = 0;     // blocks processed (need ~50 to settle)
    this.NOISE_RISE = 0.002;   // how fast noise floor rises toward signal
    this.NOISE_FALL = 0.05;    // how fast noise floor falls to actual minimum
    this.PEAK_RISE = 0.05;     // how fast signal peak rises to actual maximum
    this.PEAK_FALL = 0.001;    // how fast signal peak decays when no signal

    // Key state
    this.keyDown = false;
    this.pendingDown = false;
    this.pendingStartTime = 0;
    this.debounceMs = 10;

    // Smoothing
    this.smoothMag = 0;
    this.emaAlpha = 0.3;
    this.hysteresis = 0.7;

    // Calibration
    this.calibrating = null;
    this.calibSamples = 0;
    this.calibSum = 0;
    this.calibTarget = 50;

    // Level metering (~30 fps)
    this.levelCounter = 0;
    this.levelInterval = 12;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.frequency !== undefined) {
        this.frequency = d.frequency;
        this._updateGoertzelCoeff();
      }
      if (d.sampleRate !== undefined) {
        this.sRate = d.sampleRate;
        this._updateGoertzelCoeff();
      }
      if (d.debounceMs !== undefined) this.debounceMs = d.debounceMs;
      if (d.autoThreshold !== undefined) this.autoThreshold = d.autoThreshold;
      if (d.threshold !== undefined) this.manualThreshold = d.threshold;
      if (d.calibrate) {
        this.calibrating = d.calibrate;
        this.calibSamples = 0;
        this.calibSum = 0;
      }
    };
  }

  _updateGoertzelCoeff() {
    const N = 128;
    const k = Math.round(N * this.frequency / this.sRate);
    this.goertzelCoeff = 2 * Math.cos(2 * Math.PI * k / N);
  }

  _goertzelMag(samples) {
    const coeff = this.goertzelCoeff;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < samples.length; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const magSq = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return Math.sqrt(Math.abs(magSq)) / samples.length;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const samples = input[0]; // always channel 0
    if (!samples || samples.length === 0) return true;

    const rawMag = this._goertzelMag(samples);
    this.smoothMag += this.emaAlpha * (rawMag - this.smoothMag);
    const magnitude = this.smoothMag;

    // Auto-threshold: track noise floor and signal peak
    if (this.autoThreshold) {
      if (this.warmupBlocks < 50) {
        // During warmup, seed from early observations
        this.warmupBlocks++;
        if (this.warmupBlocks === 1) {
          this.noiseFloor = magnitude;
          this.signalPeak = magnitude;
        } else {
          if (magnitude < this.noiseFloor) this.noiseFloor = magnitude;
          if (magnitude > this.signalPeak) this.signalPeak = magnitude;
        }
      } else {
        // Asymmetric EMA trackers:
        // Noise floor: fast fall, slow rise (tracks quietest level)
        if (magnitude < this.noiseFloor) {
          this.noiseFloor += this.NOISE_FALL * (magnitude - this.noiseFloor);
        } else {
          this.noiseFloor += this.NOISE_RISE * (magnitude - this.noiseFloor);
        }
        // Signal peak: fast rise, slow fall (tracks loudest level)
        if (magnitude > this.signalPeak) {
          this.signalPeak += this.PEAK_RISE * (magnitude - this.signalPeak);
        } else {
          this.signalPeak += this.PEAK_FALL * (magnitude - this.signalPeak);
        }
      }

      // Threshold at 30% of the way from noise floor to signal peak
      // Biased toward noise floor for faster key-down detection
      const range = this.signalPeak - this.noiseFloor;
      if (range > 0.0001) {
        this.autoTh = Math.max(this.noiseFloor + range * 0.3, 0.002);
      }
    }

    // Pick active threshold
    const activeThreshold = this.autoThreshold ? this.autoTh : this.manualThreshold;

    // Calibration
    if (this.calibrating) {
      this.calibSum += magnitude;
      this.calibSamples++;
      if (this.calibSamples >= this.calibTarget) {
        this.port.postMessage({
          type: 'calibration',
          state: this.calibrating,
          rms: this.calibSum / this.calibSamples,
        });
        this.calibrating = null;
      }
    }

    // Key detection with hysteresis
    // CW tone present = key down (high magnitude = key down)
    const upperTh = activeThreshold;
    const lowerTh = activeThreshold * this.hysteresis;

    const rawDown = this.keyDown
      ? (magnitude >= lowerTh)   // stay down until below lower threshold
      : (magnitude >= upperTh);  // go down when above upper threshold

    // Debounce
    const nowMs = currentTime * 1000;
    if (rawDown !== this.pendingDown) {
      this.pendingDown = rawDown;
      this.pendingStartTime = nowMs;
    }
    if (this.pendingDown !== this.keyDown) {
      if ((nowMs - this.pendingStartTime) >= this.debounceMs) {
        this.keyDown = this.pendingDown;
        this.port.postMessage({
          type: 'keyChange',
          down: this.keyDown,
          time: currentTime,
          magnitude: magnitude,
        });
      }
    }

    // Rate-limited level (includes threshold for UI)
    this.levelCounter++;
    if (this.levelCounter >= this.levelInterval) {
      this.levelCounter = 0;
      this.port.postMessage({
        type: 'level',
        magnitude: magnitude,
        threshold: activeThreshold,
        noiseFloor: this.noiseFloor,
        signalPeak: this.signalPeak,
      });
    }

    return true;
  }
}

registerProcessor('cw-detect-processor', CwDetectProcessor);
