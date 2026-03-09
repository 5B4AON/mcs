/**
 * Morse Code Studio
 */

import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';

/**
 * Represents a key state change detected by the audio worklet.
 * @property down  - true if the key was pressed (pilot tone lost)
 * @property time  - AudioContext currentTime when the event occurred
 */
export interface KeyEvent {
  down: boolean;
  time: number;
}

/**
 * Audio Input Service � detects morse key presses via pilot tone analysis.
 *
 * How it works:
 *  1. A high-frequency pilot tone (default 18 kHz, inaudible) is output
 *     through the sound card and wired through a resistor to the mic input.
 *  2. The morse key is wired between the mic input junction and ground.
 *  3. When the key is OPEN, the pilot tone reaches the mic ? magnitude HIGH.
 *  4. When the key is CLOSED, the signal is shorted to ground ? magnitude LOW.
 *  5. A Goertzel algorithm in an AudioWorklet detects the tone magnitude
 *     in real-time and generates key-down/key-up events.
 *
 * The detection runs entirely in the audio thread (AudioWorkletProcessor)
 * for sub-millisecond latency. The main thread receives key events and
 * level metering updates via postMessage.
 *
 * This service is only active when `micInputEnabled` is true in settings.
 */

@Injectable({ providedIn: 'root' })
export class AudioInputService {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveSource: ConstantSourceNode | null = null;

  /** Observable stream of key-down/key-up events detected from the mic */
  readonly keyEvent$ = new Subject<KeyEvent>();

  /** Mic input magnitude level (0..1) for real-time UI level meter */
  readonly level$ = new Subject<number>();

  /** Calibration measurement results � emitted after calibrateOpen/Closed */
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
   * Start the audio input pipeline:
   *  1. Create an AudioContext at 48 kHz
   *  2. Load the key-detect-processor AudioWorklet
   *  3. Open the selected microphone with all processing disabled
   *  4. Connect mic ? worklet ? destination (silent, keeps worklet alive)
   *  5. Send initial detection parameters to the worklet
   *  6. Install keep-alive to prevent browser context suspension
   */
  async start(): Promise<void> {
    if (this.started) return;

    const s = this.settings.settings();
    if (!s.micInputEnabled) return;

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    await this.audioCtx.audioWorklet.addModule('key-detect-processor.js');

    // Request mic with selected device, disable all processing.
    // Use { exact: false } so the browser MUST disable processing;
    // a plain `false` is only an "ideal" hint that Chrome may ignore,
    // which can cause its echo-canceller to remove the pilot tone.
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: s.inputDeviceId && s.inputDeviceId !== 'default'
          ? { exact: s.inputDeviceId } : undefined,
        echoCancellation: { exact: false as any },
        noiseSuppression: { exact: false as any },
        autoGainControl: { exact: false as any },
      } as any
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    const source = this.audioCtx.createMediaStreamSource(this.stream);

    this.workletNode = new AudioWorkletNode(this.audioCtx, 'key-detect-processor', {
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    this.workletNode.port.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'keyChange') {
        this.zone.run(() => this.keyEvent$.next({ down: data.down, time: data.time }));
      } else if (data.type === 'level') {
        this.zone.run(() => this.level$.next(data.magnitude));
      } else if (data.type === 'calibration') {
        this.zone.run(() => this.calibration$.next({ state: data.state, rms: data.rms }));
      }
    };

    // Send initial parameters to worklet
    this.workletNode.port.postMessage({
      threshold: s.inputThreshold,
      invertInput: s.inputInvert,
      debounceMs: s.inputDebounceMs,
      channelIndex: 0,
      pilotFrequency: s.pilotFrequency,
      sampleRate: 48000,
    });

    source.connect(this.workletNode);
    // Must connect to destination to keep worklet alive (silent output)
    this.workletNode.connect(this.audioCtx.destination);

    // Keep-alive: prevent browser from suspending the AudioContext
    this.installKeepAlive(this.audioCtx);

    this.started = true;
  }

  /**
   * Update detection parameters in the running worklet without restarting.
   * Called when the user changes threshold, debounce, invert, or pilot
   * frequency in the settings panel.
   */
  updateParams(): void {
    if (!this.workletNode) return;
    const s = this.settings.settings();
    this.workletNode.port.postMessage({
      threshold: s.inputThreshold,
      invertInput: s.inputInvert,
      debounceMs: s.inputDebounceMs,
      pilotFrequency: s.pilotFrequency,
    });
  }

  /** Stop the audio input pipeline and release all resources */
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
   * Install a keep-alive mechanism so the browser never suspends
   * the AudioContext during idle periods (which would cause missed dits).
   * Three layers:
   *  1. A silent ConstantSourceNode that provides continuous audio processing
   *  2. onstatechange handler for instant wake-up
   *  3. Polling every 1s as a fallback
   */
  private installKeepAlive(ctx: AudioContext): void {
    // Silent constant source � prevents browser from deciding the context is idle
    try {
      this.keepAliveSource = ctx.createConstantSource();
      this.keepAliveSource.offset.value = 0; // truly silent
      this.keepAliveSource.connect(ctx.destination);
      this.keepAliveSource.start();
    } catch { /* older browser fallback */ }

    ctx.onstatechange = () => {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    };
    this.keepAliveTimer = setInterval(() => {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }, 1000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    try { this.keepAliveSource?.stop(); } catch { }
    this.keepAliveSource = null;
    if (this.audioCtx) {
      this.audioCtx.onstatechange = null;
    }
  }

  /** Ask the worklet to measure the current noise level for calibration */
  calibrate(state: 'open' | 'closed'): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ calibrate: state });
  }
}
