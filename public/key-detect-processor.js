/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

/**
 * AudioWorkletProcessor: Pilot Tone Key Detector.
 *
 * PURPOSE:
 * Detects morse key presses by monitoring a high-frequency pilot tone.
 * A 18 kHz tone (inaudible to most people) is output through the sound card
 * and wired through a resistor to the mic input. The morse key shorts the
 * signal to ground when pressed.
 *
 * DETECTION METHOD:
 * Uses the Goertzel algorithm — a single-frequency DFT that computes the
 * magnitude at the pilot frequency from each 128-sample block (2.67 ms at
 * 48 kHz). This gives ~375 updates/second, easily fast enough for 50 WPM
 * morse (shortest dit ≈ 24 ms).
 *
 * KEY LOGIC:
 * - Key OPEN:   pilot tone reaches mic → high magnitude → key-up
 * - Key CLOSED: pilot tone shorted to ground → low magnitude → key-down
 * - Wide hysteresis (0.5×) prevents chatter near the threshold
 * - Debounce timer requires stable state for configurable ms
 * - Invert mode reverses the logic (for alternative wiring)
 *
 * MESSAGES IN (from main thread):
 *   { threshold, invertInput, debounceMs, channelIndex, pilotFrequency, sampleRate }
 *   { calibrate: 'open'|'closed' }  → measure average level for threshold setup
 *
 * MESSAGES OUT (to main thread):
 *   { type: 'keyChange', down, time, magnitude }
 *   { type: 'level', magnitude }          → ~30 fps for UI meter
 *   { type: 'calibration', state, rms }   → after calibration measurement
 */
class KeyDetectProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.threshold = 0.01;
    this.invertInput = false;
    this.debounceMs = 5;
    this.channelIndex = 0;

    this.pilotFrequency = 18000;
    this.sRate = 48000;
    this._updateGoertzelCoeff();

    // Key state
    this.keyDown = false;
    this.pendingDown = false;
    this.pendingStartTime = 0;

    // Smoothing
    this.smoothMag = 0;
    this.emaAlpha = 0.4;
    // Hysteresis 0.5 creates a wide dead zone: the signal must cross 50%
    // of the threshold to toggle state, greatly reducing chattering on
    // weak pilot signals that roll off at high frequencies.
    this.hysteresis = 0.5;

    // Calibration
    this.calibrating = null;
    this.calibSamples = 0;
    this.calibSum = 0;
    this.calibTarget = 50;

    // Level metering rate limit (~30 fps)
    this.levelCounter = 0;
    this.levelInterval = 12;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.threshold !== undefined) this.threshold = d.threshold;
      if (d.invertInput !== undefined) this.invertInput = d.invertInput;
      if (d.debounceMs !== undefined) this.debounceMs = d.debounceMs;
      if (d.channelIndex !== undefined) this.channelIndex = d.channelIndex;
      if (d.pilotFrequency !== undefined) {
        this.pilotFrequency = d.pilotFrequency;
        this._updateGoertzelCoeff();
      }
      if (d.sampleRate !== undefined) {
        this.sRate = d.sampleRate;
        this._updateGoertzelCoeff();
      }
      if (d.calibrate) {
        this.calibrating = d.calibrate;
        this.calibSamples = 0;
        this.calibSum = 0;
      }
    };
  }

  _updateGoertzelCoeff() {
    const N = 128;
    const k = Math.round(N * this.pilotFrequency / this.sRate);
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

    const ch = this.channelIndex < input.length ? this.channelIndex : 0;
    const samples = input[ch];
    if (!samples || samples.length === 0) return true;

    const rawMag = this._goertzelMag(samples);
    this.smoothMag += this.emaAlpha * (rawMag - this.smoothMag);
    const magnitude = this.smoothMag;

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
    const upperTh = this.threshold;
    const lowerTh = this.threshold * this.hysteresis;

    let rawDown;
    if (this.invertInput) {
      rawDown = this.keyDown ? (magnitude >= lowerTh) : (magnitude >= upperTh);
    } else {
      rawDown = this.keyDown ? (magnitude < upperTh) : (magnitude < lowerTh);
    }

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

    // Rate-limited level
    this.levelCounter++;
    if (this.levelCounter >= this.levelInterval) {
      this.levelCounter = 0;
      this.port.postMessage({ type: 'level', magnitude: magnitude });
    }

    return true;
  }
}

registerProcessor('key-detect-processor', KeyDetectProcessor);
