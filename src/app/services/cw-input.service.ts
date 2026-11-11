/**
 * Morse Code Studio
 */

import { Injectable, NgZone, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { isContextPaused } from './audio-context-state';
import { LoopDetectionService } from './loop-detection.service';
import { SettingsService } from './settings.service';
import { addWorkletModule, loadWorkletSource, preloadWorkletModule } from './worklet-module';
import { canRunCwDetectWorker, cwDetectWorkerSource } from './cw-detect-worker';

/**
 * Represents a key state change detected from an incoming CW audio tone.
 * @property down  - true when the CW tone is present (key down)
 * @property time  - audio time of the edge (seconds of input since the detector started)
 */
export interface CwKeyEvent {
  down: boolean;
  time: number;
}

/**
 * CW input level data for the UI.
 * @property magnitude  - current envelope at the locked frequency
 * @property threshold  - learned key-down level
 * @property noiseFloor - learned noise level
 * @property signalPeak - learned tone level
 */
export interface CwLevelEvent {
  magnitude: number;
  threshold: number;
  noiseFloor: number;
  signalPeak: number;
}

/** Text decisions made by the detector on the audio clock */
export type CwDecodeEvent =
  | { type: 'pattern'; pattern: string; unitMs: number }
  | { type: 'char'; pattern: string; unitMs: number; wpm: number }
  | { type: 'word' };

/** What the detector is doing, for the status line */
export interface CwStatus {
  /** search: looking for a keyed tone; locked: following one */
  state: 'search' | 'locked';
  /** Squelch: open while decoding, closed while it waits for the rhythm of real Morse */
  gate: 'open' | 'closed';
  /** Frequency being decoded (Hz) */
  freq: number;
  /** Measured speed */
  wpm: number;
  /** Tone above noise (dB) */
  snrDb: number;
  /** Width of one tone-search block (ms): the sliding analysis window */
  windowMs: number;
}

/** Short status line: "Locked · 643 Hz · 24 WPM · 18 dB", "Listening for Morse…" or "Searching 400–900 Hz…" */
export function cwStatusText(st: CwStatus): string {
  if (st.state === 'search') return 'Searching for a CW tone (400–900 Hz)…';
  if (st.gate === 'closed') return `Listening for Morse at ${Math.round(st.freq)} Hz…`;
  return `Locked · ${Math.round(st.freq)} Hz · ${st.wpm} WPM · ${Math.max(0, Math.round(st.snrDb))} dB`;
}

/**
 * The last few seconds of detector data for the scope, one entry per
 * millisecond. Written outside Angular's zone and read by the canvas on
 * each animation frame, so it never triggers change detection.
 */
export class CwScopeBuffer {
  static readonly SIZE = 8192;
  readonly env = new Float32Array(CwScopeBuffer.SIZE);
  readonly raw = new Float32Array(CwScopeBuffer.SIZE);
  readonly key = new Uint8Array(CwScopeBuffer.SIZE);
  /** Total entries written; the newest is at (count - 1) % SIZE */
  count = 0;
  hi = 0;
  lo = 0;
  noise = 0;
  signal = 0;
  /** Search spectrum (dB above the band's noise) and its first bin and step (Hz) */
  spectrum: Float32Array | null = null;
  specLo = 400;
  specStep = 10;
  /** performance.now() of the last write, so the scope can tell when data stops */
  updatedAt = 0;

  push(env: Float32Array, raw: Float32Array, key: Uint8Array): void {
    const n = CwScopeBuffer.SIZE;
    for (let i = 0; i < env.length; i++) {
      const j = (this.count + i) % n;
      this.env[j] = env[i];
      this.raw[j] = raw[i];
      this.key[j] = key[i];
    }
    this.count += env.length;
    this.updatedAt = performance.now();
  }

  clear(): void {
    this.count = 0;
    this.hi = this.lo = this.noise = this.signal = 0;
    this.spectrum = null;
  }
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
 *  3. The cw-detect-processor AudioWorklet finds and locks onto the keyed
 *     tone (or uses the set frequency), learns the noise and tone levels and
 *     the speed, and decides dits, dahs, letter and word gaps itself, on the
 *     audio clock (see public/cw-detect-processor.js).
 *  4. Key edges go out on keyEvent$ (sidetone, vibration); the text
 *     decisions on decode$; status and scope data for the UI.
 * In Chromium browsers the same processor runs in a Web Worker fed by a
 * MediaStreamTrackProcessor instead (cw-detect-worker.ts): no AudioContext,
 * so the detector also runs when audio restarts without a click after a reload.
 *
 * The service supports per-channel selection so you can route multiple
 * signals on a stereo cable (e.g. left = receiver audio, right = unused).
 */
@Injectable({ providedIn: 'root' })
export class CwInputService {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  /** The detector in a Web Worker (Chromium): no AudioContext, so no click is needed after a reload */
  private worker: Worker | null = null;
  private workerTrack: MediaStreamTrack | null = null;
  private stream: MediaStream | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveSource: ConstantSourceNode | null = null;

  /** Observable stream of key-down/key-up events from CW tone detection */
  readonly keyEvent$ = new Subject<CwKeyEvent>();

  /** CW magnitude, threshold, and tracking data for UI level meter */
  readonly level$ = new Subject<CwLevelEvent>();

  /** Dots and dashes, finished characters and word gaps, decided by the detector */
  readonly decode$ = new Subject<CwDecodeEvent>();

  /** Detector state for the status line; null while the detector is not running */
  readonly status = signal<CwStatus | null>(null);

  /** Scope data (no change detection) */
  readonly scope = new CwScopeBuffer();

  private started = false;

  /** True while the CW input context is paused (suspended, or interrupted on iOS) and has not recovered */
  readonly paused = signal(false);

  /** True between a key-down and its key-up from the detector */
  private keyIsDown = false;

  /** How long the detector may stay keyed with the sidetone on before it is treated as feedback */
  private readonly STUCK_KEY_MS = 2500;

  /** Fires when the key has been held for STUCK_KEY_MS */
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
    private loopDetection: LoopDetectionService,
  ) {
    // In memory from the start, so the detector can start without the server
    preloadWorkletModule('cw-detect-processor.js');
  }

  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Start the CW audio input pipeline. Where the browser can read the
   * microphone's samples directly (Chromium: MediaStreamTrackProcessor), the
   * detector runs in a Web Worker with no AudioContext, so it listens at once
   * even when audio restarts by itself after a reload (browsers keep an
   * AudioContext started without a click suspended). Otherwise:
   *  1. Create an AudioContext at 48 kHz
   *  2. Load the cw-detect-processor AudioWorklet
   *  3. Open the selected audio input device (processing disabled)
   *  4. Split stereo → select configured channel → merge back to mono
   *  5. Connect to the detector worklet
   *  6. Send the starting speed
   *  7. Install keep-alive to prevent browser suspension
   */
  async start(): Promise<void> {
    if (this.started) return;

    const s = this.settings.settings();
    if (!s.cwInputEnabled) return;

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

    if (canRunCwDetectWorker()) {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (await this.startWorker(this.stream, s.cwInputChannel)) {
        this.started = true;
        return;
      }
      // The worker did not get going: fall back to the AudioWorklet with the same input
      this.audioCtx = new AudioContext({ sampleRate: 48000 });
      await addWorkletModule(this.audioCtx, 'cw-detect-processor.js');
    } else {
      // The context is created first, while a Start Audio click still counts (iOS)
      this.audioCtx = new AudioContext({ sampleRate: 48000 });
      await addWorkletModule(this.audioCtx, 'cw-detect-processor.js');
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    // Some browsers let audio run without a click while the microphone is open
    this.audioCtx.resume().catch(() => {});

    let source: MediaStreamAudioSourceNode;
    try {
      source = this.audioCtx.createMediaStreamSource(this.stream);
    } catch {
      // Some browsers (iOS) ignore the requested 48 kHz and then refuse an input at another rate: retry at the device's own rate
      await this.audioCtx.close().catch(() => {});
      this.audioCtx = new AudioContext();
      await addWorkletModule(this.audioCtx, 'cw-detect-processor.js');
      source = this.audioCtx.createMediaStreamSource(this.stream);
    }

    // The worklet takes one channel: 'both' lets Web Audio mix left and right
    // into mono ((L + R) / 2); otherwise the chosen channel is split off
    this.workletNode = new AudioWorkletNode(this.audioCtx, 'cw-detect-processor', {
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    let feed: AudioNode = source;
    if (s.cwInputChannel !== 'both') {
      const splitter = this.audioCtx.createChannelSplitter(2);
      source.connect(splitter);
      const merger = this.audioCtx.createChannelMerger(1);
      splitter.connect(merger, s.cwInputChannel === 'right' ? 1 : 0, 0);
      feed = merger;
    }

    this.workletNode.port.onmessage = (e) => this.onWorkletMessage(e.data);

    // Send initial parameters
    this.workletNode.port.postMessage(this.workletParams());

    feed.connect(this.workletNode);
    // Must connect to destination to keep worklet alive (silent output)
    this.workletNode.connect(this.audioCtx.destination);

    // Keep-alive: prevent browser from suspending the AudioContext
    this.installKeepAlive(this.audioCtx);

    this.started = true;
  }

  /**
   * Run the detector in a Web Worker fed straight from the microphone track.
   * Resolves false (and cleans up) when the browser refuses any step or no
   * audio arrives within two seconds; the caller then uses the AudioWorklet.
   */
  private async startWorker(stream: MediaStream, channel: string): Promise<boolean> {
    const track = stream.getAudioTracks()[0];
    const src = track ? await loadWorkletSource('cw-detect-processor.js') : null;
    if (!track || !src) return false;
    const TrackProcessor = (globalThis as unknown as {
      MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream };
    }).MediaStreamTrackProcessor;
    let url = '';
    try {
      url = URL.createObjectURL(new Blob([cwDetectWorkerSource(src)], { type: 'text/javascript' }));
      // A clone, so the original track still feeds the AudioWorklet if this fails
      const clone = track.clone();
      this.workerTrack = clone;
      const ready = this.zone.runOutsideAngular(() => new Promise<boolean>((resolve) => {
        const worker = new Worker(url);
        this.worker = worker;
        const timer = setTimeout(() => resolve(false), 2000);
        worker.onmessage = (e) => {
          if (e.data?.type === '__ready') { clearTimeout(timer); resolve(true); return; }
          this.onWorkletMessage(e.data);
        };
        worker.onerror = () => { clearTimeout(timer); resolve(false); };
        const readable = new TrackProcessor({ track: clone }).readable;
        worker.postMessage(this.workletParams());
        worker.postMessage({ __init: true, readable, channel }, [readable as unknown as Transferable]);
      }));
      if (await ready) return true;
    } catch { /* not supported after all */ } finally {
      if (url) URL.revokeObjectURL(url);
    }
    this.stopWorker();
    return false;
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    try { this.workerTrack?.stop(); } catch { }
    this.workerTrack = null;
  }

  /** The detector tunes itself; it only gets the starting speed, used until it has measured one */
  private workletParams(): Record<string, unknown> {
    return { wpm: this.settings.settings().rxDecoderWpm };
  }

  /**
   * Worklet messages arrive outside Angular's zone. Key edges and text enter
   * the zone straight away; level and status at most 5 times a second; scope
   * data never does.
   */
  private onWorkletMessage(data: any): void {
    switch (data.type) {
      case 'key':
        this.zone.run(() => this.onKeyChange(data.down, data.time));
        break;
      case 'pattern':
        this.zone.run(() => this.decode$.next({ type: 'pattern', pattern: data.pattern, unitMs: data.unitMs }));
        break;
      case 'char':
        this.zone.run(() => this.decode$.next({ type: 'char', pattern: data.pattern, unitMs: data.unitMs, wpm: data.wpm }));
        break;
      case 'word':
        this.zone.run(() => this.decode$.next({ type: 'word' }));
        break;
      case 'scope':
        this.scope.push(data.env, data.raw, data.key);
        this.scope.hi = data.hi;
        this.scope.lo = data.lo;
        this.scope.noise = data.noise;
        this.scope.signal = data.signal;
        if (data.spectrum) {
          this.scope.spectrum = data.spectrum;
          this.scope.specLo = data.specLo;
          this.scope.specStep = data.specStep;
        }
        break;
      case 'stat':
        this.zone.run(() => {
          this.status.set({
            state: data.state, gate: data.gate === 'open' ? 'open' : 'closed', freq: data.freq, wpm: data.wpm,
            snrDb: data.snrDb, windowMs: data.windowMs,
          });
          this.level$.next({
            magnitude: data.env, threshold: data.hi,
            noiseFloor: data.noise, signalPeak: data.signal,
          });
        });
        break;
    }
  }

  /**
   * Publish a key change and watch for feedback. If the sidetone is audible to
   * the input, the detector hears it, keys the sidetone, hears that, and so on:
   * one unbroken key-down. Any such key-down held for STUCK_KEY_MS with the
   * sidetone on is treated as a feedback loop and the detector is shut off.
   */
  private onKeyChange(down: boolean, time: number): void {
    this.keyIsDown = down;
    this.keyEvent$.next({ down, time });
    if (this.stuckTimer) { clearTimeout(this.stuckTimer); this.stuckTimer = null; }
    if (!down) return;
    this.stuckTimer = setTimeout(() => {
      this.stuckTimer = null;
      if (!this.keyIsDown || !this.settings.settings().sidetoneEnabled) return;
      this.zone.run(() => {
        this.settings.update({ cwInputEnabled: false });
        void this.stop();
        this.loopDetection.reportFeedback(
          'Audio feedback detected! The CW tone detector stayed keyed for over 2.5 seconds while the sidetone ' +
          'was on, so it is probably hearing the sidetone. The CW detector was turned off. Use headphones, ' +
          'lower the volume, move the sidetone away from the detector tone, or turn the sidetone off, then ' +
          're-enable the detector.');
      });
    }, this.STUCK_KEY_MS);
  }

  /** Rebuild the pipeline when it is running (a new device or channel takes effect) */
  async restart(): Promise<void> {
    if (!this.started) return;
    await this.stop();
    await this.start();
  }

  /** Stop the CW input pipeline and release all resources */
  async stop(): Promise<void> {
    if (this.stuckTimer) { clearTimeout(this.stuckTimer); this.stuckTimer = null; }
    // A key-down with no later key-up would leave the sidetone held on, so release it
    if (this.keyIsDown) {
      this.keyIsDown = false;
      this.zone.run(() => this.keyEvent$.next({ down: false, time: performance.now() }));
    }
    // Drop a character that was still being received
    if (this.started) this.zone.run(() => this.decode$.next({ type: 'pattern', pattern: '', unitMs: 0 }));
    this.clearKeepAlive();
    this.stopWorker();
    try { this.workletNode?.disconnect(); } catch { }
    for (const track of this.stream?.getTracks() ?? []) {
      try { track.stop(); } catch { }
    }

    const ctx = this.audioCtx;
    let closeFailed = false;
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close();
      } catch {
        closeFailed = (ctx.state as AudioContextState) !== 'closed';
      }
    }

    if (!closeFailed) this.audioCtx = null;
    this.workletNode = null;
    this.stream = null;
    this.started = closeFailed;
    this.status.set(null);
    this.scope.clear();
    if (closeFailed) {
      throw new Error('The CW input audio context could not be closed.');
    }
  }

  /**
   * Install keep-alive to prevent browser from auto-suspending the
   * AudioContext during quiet periods (which would cause missed CW events).
   * Uses three layers: silent ConstantSourceNode, onstatechange, and polling.
   */
  private installKeepAlive(ctx: AudioContext): void {
    // Started without a click (autostart after a reload), the browser keeps the context suspended
    this.paused.set(isContextPaused(ctx));
    ctx.onstatechange = () => {
      if (isContextPaused(ctx)) ctx.resume().catch(() => {});
      this.paused.set(isContextPaused(ctx));
    };
    this.keepAliveTimer = setInterval(() => {
      if (isContextPaused(ctx)) ctx.resume().catch(() => {});
      this.paused.set(isContextPaused(ctx));
    }, 3000);
  }

  /** Resume the CW input context. Call it from a user gesture: iOS refuses otherwise. */
  async resumeFromGesture(): Promise<void> {
    const ctx = this.audioCtx;
    if (!ctx || !isContextPaused(ctx)) return;
    try {
      await ctx.resume();
    } finally {
      this.paused.set(isContextPaused(ctx));
    }
  }

  private clearKeepAlive(): void {
    this.paused.set(false);
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.onstatechange = null;
    }
  }
}
