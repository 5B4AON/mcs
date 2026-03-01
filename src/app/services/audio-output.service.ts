/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON � Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, effect } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * Audio Output Service � manages all audio output channels.
 *
 * Handles three independent audio outputs that can be routed to
 * different sound cards and stereo channels:
 *
 *  1. **Sidetone** � audible feedback tone (sine wave, 500�800 Hz)
 *     played through headphones/speakers when keying.
 *
 *  2. **Key Output (Opto)** � drives an optocoupler to physically key
 *     a radio transmitter. Two modes:
 *     - DC: ConstantSourceNode producing a steady DC voltage when keyed
 *     - AC: Square wave oscillator (100�20000 Hz) for AC-coupled circuits
 *
 *  3. **Pilot Tone** � always-on high-frequency tone (18 kHz) used for
 *     mic-based key detection (see AudioInputService).
 *
 * Device routing:
 *  - Same device: single stereo AudioContext + ChannelMergerNode routes
 *    sidetone and opto to separate L/R channels.
 *  - Different devices: separate AudioContexts with setSinkId() targeting
 *    different sound cards, each with their own ChannelMergerNode.
 *
 * All contexts use `channelInterpretation: 'discrete'` to prevent the
 * browser from up-mixing mono sources to both stereo channels.
 */
@Injectable({ providedIn: 'root' })
export class AudioOutputService {
  // ---- Shared mode: single stereo context ----
  private sharedCtx: AudioContext | null = null;
  /** Stereo merger for routing sidetone and opto to separate L/R channels */
  private merger: ChannelMergerNode | null = null;

  // ---- Separate mode: two independent contexts ----
  private sidetoneCtx: AudioContext | null = null;
  private optoCtx: AudioContext | null = null;
  /** Per-context mergers for channel routing in separate device mode */
  private sidetoneMerger: ChannelMergerNode | null = null;
  private optoMerger: ChannelMergerNode | null = null;

  // ---- Audio source nodes ----
  private sidetoneOsc: OscillatorNode | null = null;   // Sine wave sidetone
  private sidetoneGain: GainNode | null = null;        // Sidetone volume envelope
  private optoOsc: OscillatorNode | null = null;       // Square wave for AC opto mode
  private optoSource: ConstantSourceNode | null = null; // DC offset for DC opto mode
  private optoGain: GainNode | null = null;            // Opto key-on/key-off envelope

  // ---- Pilot tone (always-on, own context) ----
  private pilotCtx: AudioContext | null = null;
  private pilotOsc: OscillatorNode | null = null;
  private pilotGain: GainNode | null = null;
  private pilotMerger: ChannelMergerNode | null = null;

  // ---- Keep-alive: prevents browser from suspending idle audio contexts ----
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  /** Inaudible ultrasonic oscillators that keep each context's audio graph active */
  private keepAliveNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private visibilityHandler: (() => void) | null = null;

  private started = false;
  /** True when sidetone and opto use different sound cards */
  private separateDevices = false;

  constructor(private settings: SettingsService) {
    effect(() => {
      const s = this.settings.settings();
      this.applySettings(s);
    });
  }

  get isStarted(): boolean { return this.started; }

  /**
   * Start all audio output contexts and oscillators.
   * Determines whether sidetone and opto share a device or use separate
   * devices, then initialises the appropriate audio graph topology.
   * Also starts the pilot tone if mic input is enabled.
   */
  async start(): Promise<void> {
    if (this.started) return;
    const s = this.settings.settings();
    const sideDevId = s.sidetoneOutputDeviceId || 'default';
    const optoDevId = s.optoOutputDeviceId || 'default';
    this.separateDevices = sideDevId !== optoDevId;

    if (this.separateDevices) {
      await this.startSeparate(sideDevId, optoDevId, s);
    } else {
      await this.startShared(sideDevId, s);
    }

    // Start pilot tone for key detection (only when mic input is enabled)
    if (s.micInputEnabled) {
      await this.startPilot(s);
    }

    this.installKeepAlive();
    this.started = true;
  }

  // ---------- Shared device (stereo merge) ----------
  private async startShared(
    deviceId: string,
    s: ReturnType<typeof this.settings.settings>
  ): Promise<void> {
    this.sharedCtx = new AudioContext({ sampleRate: 48000 });
    await this.trySetSinkId(this.sharedCtx, deviceId);
    const ctx = this.sharedCtx;

    // Force destination to stereo-discrete so merger channels map 1:1
    ctx.destination.channelCount = 2;
    ctx.destination.channelCountMode = 'explicit';
    ctx.destination.channelInterpretation = 'discrete';

    this.sidetoneOsc = ctx.createOscillator();
    this.sidetoneOsc.type = 'sine';
    this.sidetoneOsc.frequency.value = s.sidetoneFrequency;
    this.sidetoneGain = ctx.createGain();
    this.sidetoneGain.gain.value = 0;
    this.sidetoneOsc.connect(this.sidetoneGain);
    this.sidetoneOsc.start();

    // Opto output: AC (oscillator) or DC (constant source)
    this.optoGain = ctx.createGain();
    this.optoGain.gain.value = 0;
    if (s.optoMode === 'dc') {
      this.optoSource = ctx.createConstantSource();
      this.optoSource.offset.value = 1.0;
      this.optoSource.connect(this.optoGain);
      this.optoSource.start();
    } else {
      this.optoOsc = ctx.createOscillator();
      this.optoOsc.type = 'square';
      this.optoOsc.frequency.value = s.optoFrequency;
      this.optoOsc.connect(this.optoGain);
      this.optoOsc.start();
    }

    this.merger = ctx.createChannelMerger(2);
    this.routeShared(s);
    this.merger.connect(ctx.destination);
  }

  // ---------- Separate devices (two mono contexts) ----------
  private async startSeparate(
    sideDevId: string,
    optoDevId: string,
    s: ReturnType<typeof this.settings.settings>
  ): Promise<void> {
    // --- Sidetone context ---
    this.sidetoneCtx = new AudioContext({ sampleRate: 48000 });
    await this.trySetSinkId(this.sidetoneCtx, sideDevId);
    this.sidetoneCtx.destination.channelCount = 2;
    this.sidetoneCtx.destination.channelCountMode = 'explicit';
    this.sidetoneCtx.destination.channelInterpretation = 'discrete';

    this.sidetoneOsc = this.sidetoneCtx.createOscillator();
    this.sidetoneOsc.type = 'sine';
    this.sidetoneOsc.frequency.value = s.sidetoneFrequency;
    this.sidetoneGain = this.sidetoneCtx.createGain();
    this.sidetoneGain.gain.value = 0;
    this.sidetoneOsc.connect(this.sidetoneGain);
    this.sidetoneMerger = this.sidetoneCtx.createChannelMerger(2);
    const sideChIdx = s.sidetoneOutputChannel === 'left' ? 0 : 1;
    this.sidetoneGain.connect(this.sidetoneMerger, 0, sideChIdx);
    this.sidetoneMerger.connect(this.sidetoneCtx.destination);
    this.sidetoneOsc.start();

    // --- Opto context ---
    this.optoCtx = new AudioContext({ sampleRate: 48000 });
    await this.trySetSinkId(this.optoCtx, optoDevId);
    this.optoCtx.destination.channelCount = 2;
    this.optoCtx.destination.channelCountMode = 'explicit';
    this.optoCtx.destination.channelInterpretation = 'discrete';

    this.optoGain = this.optoCtx.createGain();
    this.optoGain.gain.value = 0;
    if (s.optoMode === 'dc') {
      this.optoSource = this.optoCtx.createConstantSource();
      this.optoSource.offset.value = 1.0;
      this.optoSource.connect(this.optoGain);
      this.optoSource.start();
    } else {
      this.optoOsc = this.optoCtx.createOscillator();
      this.optoOsc.type = 'square';
      this.optoOsc.frequency.value = s.optoFrequency;
      this.optoOsc.connect(this.optoGain);
      this.optoOsc.start();
    }
    this.optoMerger = this.optoCtx.createChannelMerger(2);
    const optoChIdx = s.optoOutputChannel === 'left' ? 0 : 1;
    this.optoGain.connect(this.optoMerger, 0, optoChIdx);
    this.optoMerger.connect(this.optoCtx.destination);
  }

  /** Test the opto output � plays the opto tone for a short burst regardless of key/enabled state */
  async testOpto(durationMs: number = 1000): Promise<void> {
    if (!this.started || !this.optoGain) return;
    await this.ensureResumedAsync();
    const s = this.settings.settings();
    const ctx = this.separateDevices ? this.optoCtx! : this.sharedCtx!;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const ramp = 0.003;
    this.optoGain.gain.cancelScheduledValues(now);
    this.optoGain.gain.setTargetAtTime(s.optoAmplitude, now, ramp);
    this.optoGain.gain.setTargetAtTime(0, now + dur, ramp);
  }

  /** Test the sidetone output � plays a short burst */
  async testSidetone(durationMs: number = 1000): Promise<void> {
    if (!this.started || !this.sidetoneGain) return;
    await this.ensureResumedAsync();
    const s = this.settings.settings();
    const ctx = this.separateDevices ? this.sidetoneCtx! : this.sharedCtx!;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const ramp = 0.003;
    this.sidetoneGain.gain.cancelScheduledValues(now);
    this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
    this.sidetoneGain.gain.setTargetAtTime(0, now + dur, ramp);
  }

  /** Key down */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    if (!this.started) return;
    const wasSuspended = this.anyContextSuspended();
    this.ensureResumed();
    const s = this.settings.settings();
    const ramp = 0.005;

    if (wasSuspended) {
      setTimeout(() => this.applyKeyDown(s, ramp, source), 15);
    } else {
      this.applyKeyDown(s, ramp, source);
    }
  }

  private applyKeyDown(
    s: ReturnType<typeof this.settings.settings>,
    ramp: number,
    source: 'rx' | 'tx' = 'tx'
  ): void {
    if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
      const ctx = this.separateDevices ? this.sidetoneCtx! : this.sharedCtx!;
      const now = ctx.currentTime;
      this.sidetoneGain.gain.cancelScheduledValues(now);
      this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
    }
    if (s.optoEnabled && this.optoGain && (s.optoForward === 'both' || s.optoForward === source)) {
      const ctx = this.separateDevices ? this.optoCtx! : this.sharedCtx!;
      const now = ctx.currentTime;
      this.optoGain.gain.cancelScheduledValues(now);
      this.optoGain.gain.setTargetAtTime(s.optoAmplitude, now, ramp);
    }
  }

  /** Key up */
  keyUp(): void {
    if (!this.started) return;
    const wasSuspended = this.anyContextSuspended();
    this.ensureResumed();
    const ramp = 0.005;

    if (wasSuspended) {
      setTimeout(() => this.applyKeyUp(ramp), 15);
    } else {
      this.applyKeyUp(ramp);
    }
  }

  private applyKeyUp(ramp: number): void {
    if (this.sidetoneGain) {
      const ctx = this.separateDevices ? this.sidetoneCtx! : this.sharedCtx!;
      const now = ctx.currentTime;
      this.sidetoneGain.gain.cancelScheduledValues(now);
      this.sidetoneGain.gain.setTargetAtTime(0, now, ramp);
    }
    if (this.optoGain) {
      const ctx = this.separateDevices ? this.optoCtx! : this.sharedCtx!;
      const now = ctx.currentTime;
      this.optoGain.gain.cancelScheduledValues(now);
      this.optoGain.gain.setTargetAtTime(0, now, ramp);
    }
  }

  /** Timed tone for encoder — plays sidetone + opto (radio keying), filtered by forward mode */
  scheduleTone(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    if (!this.started) return Promise.resolve();
    const wasSuspended = this.anyContextSuspended();
    this.ensureResumed();

    const doSchedule = () => {
      const s = this.settings.settings();
      const ramp = 0.003;
      if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
        const ctx = this.separateDevices ? this.sidetoneCtx! : this.sharedCtx!;
        const now = ctx.currentTime;
        const dur = durationMs / 1000;
        this.sidetoneGain.gain.cancelScheduledValues(now);
        this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
        this.sidetoneGain.gain.setTargetAtTime(0, now + dur, ramp);
      }
      if (s.optoEnabled && this.optoGain && (s.optoForward === 'both' || s.optoForward === source)) {
        const ctx = this.separateDevices ? this.optoCtx! : this.sharedCtx!;
        const now = ctx.currentTime;
        const dur = durationMs / 1000;
        this.optoGain.gain.cancelScheduledValues(now);
        this.optoGain.gain.setTargetAtTime(s.optoAmplitude, now, ramp);
        this.optoGain.gain.setTargetAtTime(0, now + dur, ramp);
      }
    };

    if (wasSuspended) {
      setTimeout(doSchedule, 15);
    } else {
      doSchedule();
    }
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  /**
   * Sidetone-only tone — plays the audible sidetone WITHOUT keying
   * the opto/radio output, filtered by forward mode.
   * Used for received RTDB characters so the user hears the incoming
   * morse without retransmitting it.
   * @deprecated Use scheduleTone(duration, source) instead — forward settings now control routing.
   */
  scheduleSidetoneOnly(durationMs: number, source: 'rx' | 'tx' = 'rx'): Promise<void> {
    if (!this.started) return Promise.resolve();
    const wasSuspended = this.anyContextSuspended();
    this.ensureResumed();

    const doSchedule = () => {
      const s = this.settings.settings();
      if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
        const ramp = 0.003;
        const ctx = this.separateDevices ? this.sidetoneCtx! : this.sharedCtx!;
        const now = ctx.currentTime;
        const dur = durationMs / 1000;
        this.sidetoneGain.gain.cancelScheduledValues(now);
        this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
        this.sidetoneGain.gain.setTargetAtTime(0, now + dur, ramp);
      }
    };

    if (wasSuspended) {
      setTimeout(doSchedule, 15);
    } else {
      doSchedule();
    }
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  async stop(): Promise<void> {
    this.clearKeepAlive();
    try { this.sidetoneOsc?.stop(); } catch { }
    try { this.optoOsc?.stop(); } catch { }
    try { this.optoSource?.stop(); } catch { }
    try { this.pilotOsc?.stop(); } catch { }
    this.merger?.disconnect();
    this.sidetoneMerger?.disconnect();
    this.optoMerger?.disconnect();
    this.pilotMerger?.disconnect();
    await this.sharedCtx?.close().catch(() => {});
    await this.sidetoneCtx?.close().catch(() => {});
    await this.optoCtx?.close().catch(() => {});
    await this.pilotCtx?.close().catch(() => {});
    this.sharedCtx = null;
    this.sidetoneCtx = null;
    this.optoCtx = null;
    this.pilotCtx = null;
    this.merger = null;
    this.sidetoneMerger = null;
    this.optoMerger = null;
    this.pilotMerger = null;
    this.sidetoneOsc = null;
    this.sidetoneGain = null;
    this.optoOsc = null;
    this.optoSource = null;
    this.optoGain = null;
    this.pilotOsc = null;
    this.pilotGain = null;
    this.started = false;
  }

  // ---- internal ----

  /**
   * Start the always-on pilot tone oscillator.
   * Creates its own AudioContext so it can target a specific device/channel
   * independently of the sidetone/opto contexts.
   */
  async startPilot(
    s?: ReturnType<typeof this.settings.settings>
  ): Promise<void> {
    // Stop any existing pilot first
    await this.stopPilot();
    if (!s) s = this.settings.settings();
    const deviceId = s.pilotOutputDeviceId || 'default';
    this.pilotCtx = new AudioContext({ sampleRate: 48000 });
    await this.trySetSinkId(this.pilotCtx, deviceId);

    // Force destination to stereo-discrete so channel routing works
    this.pilotCtx.destination.channelCount = 2;
    this.pilotCtx.destination.channelCountMode = 'explicit';
    this.pilotCtx.destination.channelInterpretation = 'discrete';

    this.pilotOsc = this.pilotCtx.createOscillator();
    this.pilotOsc.type = 'sine';
    this.pilotOsc.frequency.value = s.pilotFrequency;

    this.pilotGain = this.pilotCtx.createGain();
    this.pilotGain.gain.value = s.pilotAmplitude;

    this.pilotOsc.connect(this.pilotGain);

    // Route to the chosen channel via a stereo merger
    this.pilotMerger = this.pilotCtx.createChannelMerger(2);
    const chIdx = s.pilotOutputChannel === 'left' ? 0 : 1;
    this.pilotGain.connect(this.pilotMerger, 0, chIdx);
    this.pilotMerger.connect(this.pilotCtx.destination);

    this.pilotOsc.start();
  }

  /** Stop the pilot tone if running */
  async stopPilot(): Promise<void> {
    try { this.pilotOsc?.stop(); } catch { }
    this.pilotMerger?.disconnect();
    await this.pilotCtx?.close().catch(() => {});
    this.pilotCtx = null;
    this.pilotMerger = null;
    this.pilotOsc = null;
    this.pilotGain = null;
  }

  private applySettings(s: ReturnType<typeof this.settings.settings>): void {
    if (!this.started) return;
    if (this.sidetoneOsc) this.sidetoneOsc.frequency.value = s.sidetoneFrequency;
    if (this.optoOsc && s.optoMode === 'ac') this.optoOsc.frequency.value = s.optoFrequency;
    if (this.pilotOsc) this.pilotOsc.frequency.value = s.pilotFrequency;
    if (this.pilotGain) this.pilotGain.gain.value = s.pilotAmplitude;
    if (!this.separateDevices && this.merger) {
      this.routeShared(s);
    }
  }

  private routeShared(s: ReturnType<typeof this.settings.settings>): void {
    if (!this.merger) return;
    this.sidetoneGain?.disconnect();
    this.optoGain?.disconnect();

    // merger input 0 = left, 1 = right
    const sideIdx = s.sidetoneOutputChannel === 'left' ? 0 : 1;
    const optoIdx = s.optoOutputChannel === 'left' ? 0 : 1;

    this.sidetoneGain?.connect(this.merger, 0, sideIdx);
    this.optoGain?.connect(this.merger, 0, optoIdx);
  }

  private async trySetSinkId(ctx: AudioContext, deviceId: string): Promise<void> {
    if (deviceId === 'default' || !deviceId) return;
    try {
      if ('setSinkId' in ctx) {
        await (ctx as any).setSinkId(deviceId);
      }
    } catch (err) {
      console.warn('Could not set output device:', err);
    }
  }

  /**
   * Ensure all AudioContexts are in 'running' state.
   * Browsers suspend contexts after idle periods to save resources.
   * Calling resume() is near-instant if already running.
   */
  private ensureResumed(): void {
    for (const ctx of this.allContexts()) {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  }

  /** Check if any context is currently suspended */
  private anyContextSuspended(): boolean {
    for (const ctx of this.allContexts()) {
      if (ctx && ctx.state === 'suspended') return true;
    }
    return false;
  }

  /** Awaitable version of ensureResumed for test/diagnostic methods */
  private async ensureResumedAsync(): Promise<void> {
    for (const ctx of this.allContexts()) {
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
    }
  }

  /** All active AudioContexts */
  private allContexts(): (AudioContext | null)[] {
    return [this.sharedCtx, this.sidetoneCtx, this.optoCtx, this.pilotCtx];
  }

  /**
   * Keep-alive: prevent browser from suspending output AudioContexts.
   *
   * Strategy (three layers):
   * 1. **Ultrasonic oscillator**: A 20 kHz sine at -100 dB (gain 0.00001)
   *    on each context. This is inaudible but produces real non-zero audio
   *    samples, which prevents Chrome's silence-detection from auto-suspending.
   *    (A zero-offset ConstantSourceNode gets optimised away by Chrome.)
   * 2. **onstatechange handler**: Immediately calls resume() if a context
   *    is unexpectedly suspended.
   * 3. **Polling timer (500 ms)** + **visibilitychange handler**: Catches
   *    edge cases (tab switch, screen lock, etc.) and resumes promptly.
   */
  private installKeepAlive(): void {
    this.clearKeepAlive();

    for (const ctx of this.allContexts()) {
      if (!ctx) continue;
      try {
        // Inaudible ultrasonic tone — real samples prevent suspension
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 20000;  // 20 kHz — at/above hearing limit
        const g = ctx.createGain();
        g.gain.value = 0.00001;       // -100 dB, completely inaudible
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        this.keepAliveNodes.push({ osc, gain: g });
      } catch { /* context may be closed */ }

      ctx.onstatechange = () => {
        if (ctx.state === 'suspended') ctx.resume();
      };
    }

    // More aggressive polling — 500 ms catches suspension faster
    this.keepAliveTimer = setInterval(() => {
      for (const ctx of this.allContexts()) {
        if (ctx && ctx.state === 'suspended') ctx.resume();
      }
    }, 500);

    // Resume immediately when tab becomes visible again
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        for (const ctx of this.allContexts()) {
          if (ctx && ctx.state === 'suspended') ctx.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    for (const node of this.keepAliveNodes) {
      try { node.osc.stop(); } catch { }
      try { node.gain.disconnect(); } catch { }
    }
    this.keepAliveNodes = [];
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
