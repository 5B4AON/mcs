/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';

/**
 * Represents a key state change detected from an incoming CW audio tone.
 * @property down  - true when the CW tone is present (key down)
 * @property time  - AudioContext currentTime when the event occurred
 */
export interface CwKeyEvent {
  down: boolean;
  time: number;
}

/**
 * CW input level metering data for the UI.
 * @property magnitude  - current Goertzel filter output at the CW frequency
 * @property threshold  - active detection threshold (auto or manual)
 * @property noiseFloor - auto-tracked minimum magnitude (background noise)
 * @property signalPeak - auto-tracked maximum magnitude (tone present)
 */
export interface CwLevelEvent {
  magnitude: number;
  threshold: number;
  noiseFloor: number;
  signalPeak: number;
}

/**
 * CW Audio Input Service — detects morse keying from CW audio tones.
 *
 * Use case: connect a radio receiver's audio output (or a virtual audio
 * cable) to the computer's mic/line-in. The radio outputs a CW sidetone
 * (typically 500–700 Hz) when a station is transmitting morse code.
 *
 * How it works:
 *  1. Opens the selected audio input device as a stereo stream.
 *  2. A ChannelSplitterNode extracts just the configured channel (L or R).
 *  3. A Goertzel algorithm in an AudioWorklet measures the magnitude at
 *     the configured CW frequency (narrow-band, ~30 Hz bandwidth).
 *  4. Auto-threshold tracks noise floor and signal peak, placing the
 *     detection threshold at 30% between them for fast key-down response.
 *  5. Key-down/key-up events are sent to the main thread for decoding.
 *
 * The service supports per-channel selection so you can route multiple
 * signals on a stereo cable (e.g. left = receiver audio, right = unused).
 */
@Injectable({ providedIn: 'root' })
export class CwInputService {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveSource: ConstantSourceNode | null = null;

  /** Observable stream of key-down/key-up events from CW tone detection */
  readonly keyEvent$ = new Subject<CwKeyEvent>();

  /** CW magnitude, threshold, and tracking data for UI level meter */
  readonly level$ = new Subject<CwLevelEvent>();

  /** Calibration measurement results — used for manual threshold setup */
  readonly calibration$ = new Subject<{ state: string; rms: number }>();

  private started = false;

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {}

  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Start the CW audio input pipeline:
   *  1. Create an AudioContext at 48 kHz
   *  2. Load the cw-detect-processor AudioWorklet
   *  3. Open the selected audio input device (processing disabled)
   *  4. Split stereo → select configured channel → merge back to mono
   *  5. Connect to worklet for Goertzel tone detection
   *  6. Send initial frequency and threshold parameters
   *  7. Install keep-alive to prevent browser suspension
   */
  async start(): Promise<void> {
    if (this.started) return;

    const s = this.settings.settings();
    if (!s.cwInputEnabled) return;

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    await this.audioCtx.audioWorklet.addModule('cw-detect-processor.js');

    // Request audio input with selected device, disable all processing.
    // Use { exact: false } so the browser MUST disable processing;
    // a plain `false` is only an "ideal" hint that Chrome may ignore.
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: s.cwInputDeviceId && s.cwInputDeviceId !== 'default'
          ? { exact: s.cwInputDeviceId } : undefined,
        echoCancellation: { exact: false as any },
        noiseSuppression: { exact: false as any },
        autoGainControl: { exact: false as any },
      } as any
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    const source = this.audioCtx.createMediaStreamSource(this.stream);

    // Split stereo input and pick the selected channel (left=0, right=1)
    const splitter = this.audioCtx.createChannelSplitter(2);
    source.connect(splitter);
    const chIdx = s.cwInputChannel === 'right' ? 1 : 0;

    // Merge the selected channel into a mono stream for the worklet
    const merger = this.audioCtx.createChannelMerger(1);
    splitter.connect(merger, chIdx, 0);

    this.workletNode = new AudioWorkletNode(this.audioCtx, 'cw-detect-processor', {
      channelCount: 1,
      channelCountMode: 'explicit',
    });

    this.workletNode.port.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'keyChange') {
        this.zone.run(() => this.keyEvent$.next({ down: data.down, time: data.time }));
      } else if (data.type === 'level') {
        this.zone.run(() => this.level$.next({
          magnitude: data.magnitude,
          threshold: data.threshold,
          noiseFloor: data.noiseFloor,
          signalPeak: data.signalPeak,
        }));
      } else if (data.type === 'calibration') {
        this.zone.run(() => this.calibration$.next({ state: data.state, rms: data.rms }));
      }
    };

    // Send initial parameters
    this.workletNode.port.postMessage({
      frequency: s.cwInputFrequency,
      bandwidth: s.cwInputBandwidth,
      sampleRate: 48000,
      debounceMs: s.cwInputDebounceMs,
      autoThreshold: s.cwInputAutoThreshold,
      threshold: s.cwInputThreshold,
    });

    merger.connect(this.workletNode);
    // Must connect to destination to keep worklet alive (silent output)
    this.workletNode.connect(this.audioCtx.destination);

    // Keep-alive: prevent browser from suspending the AudioContext
    this.installKeepAlive(this.audioCtx);

    this.started = true;
  }

  /**
   * Update detection parameters in the running worklet without restarting.
   * Called when the user adjusts CW frequency, threshold, or debounce.
   */
  updateParams(): void {
    if (!this.workletNode) return;
    const s = this.settings.settings();
    this.workletNode.port.postMessage({
      frequency: s.cwInputFrequency,
      bandwidth: s.cwInputBandwidth,
      debounceMs: s.cwInputDebounceMs,
      autoThreshold: s.cwInputAutoThreshold,
      threshold: s.cwInputThreshold,
    });
  }

  /** Stop the CW input pipeline and release all resources */
  async stop(): Promise<void> {
    this.clearKeepAlive();
    this.workletNode?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.audioCtx?.close();
    this.audioCtx = null;
    this.workletNode = null;
    this.stream = null;
    this.started = false;
  }

  /**
   * Install keep-alive to prevent browser from auto-suspending the
   * AudioContext during quiet periods (which would cause missed CW events).
   * Uses three layers: silent ConstantSourceNode, onstatechange, and polling.
   */
  private installKeepAlive(ctx: AudioContext): void {
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    };
    this.keepAliveTimer = setInterval(() => {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }, 3000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.onstatechange = null;
    }
  }

  /** Ask the worklet to measure the current magnitude level for manual calibration */
  calibrate(state: 'open' | 'closed'): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ calibrate: state });
  }
}
