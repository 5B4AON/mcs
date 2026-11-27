/**
 * Morse Code Studio
 */

import { Injectable, effect, signal } from '@angular/core';
import { isContextPaused } from './audio-context-state';
import { releasePrimedContext, takePrimedContext } from './audio-primer';
import { SettingsService } from './settings.service';
import { OutputKeepAlive } from '../components/settings-items/sidetone/sidetone-item.model';

/**
 * Keep-alive signal per level: dither noise, a subsonic tone and an ultrasonic tone, as linear gains
 * (Low: about -84 dB, -60 dB and -80 dB; Normal -80, -40, -74; High -74, -20, -66). The subsonic
 * tone is the strongest part because it cannot be heard whatever the volume. High is meant for
 * phones, whose volume setting scales the digital signal down before it reaches a USB sound card,
 * where a weak signal rounds to silence (Android's media volume is about -45 dB at 10% and -30 dB
 * at 40%; a card stayed awake at -70 dBFS after the volume, not at -75).
 */
const KEEP_ALIVE_LEVELS: Record<Exclude<OutputKeepAlive, 'off'>, { noise: number; sub: number; ultra: number }> = {
  low: { noise: 0.00006, sub: 0.001, ultra: 0.0001 },
  normal: { noise: 0.0001, sub: 0.01, ultra: 0.0002 },
  high: { noise: 0.0002, sub: 0.1, ultra: 0.0005 },
};

/** The keep-alive fades out this long before a placed tone and this long after the last tone (seconds) */
const KEEP_ALIVE_LEAD_S = 0.06;
const KEEP_ALIVE_HOLD_S = 0.4;

const KEEP_ALIVE_SUB_HZ = 10;
const KEEP_ALIVE_ULTRA_HZ = 20000;

/**
 * Audio Output Service — manages the sidetone audio output.
 *
 * The sidetone is an audible feedback tone (sine wave, 500–800 Hz) played through
 * headphones/speakers when keying, on the left channel, the right channel or both,
 * of the sound card the user picked (AudioContext.setSinkId()). The context uses
 * `channelInterpretation: 'discrete'` so the browser does not up-mix the mono source
 * to both stereo channels.
 */
@Injectable({ providedIn: 'root' })
export class AudioOutputService {
  private sharedCtx: AudioContext | null = null;
  /** Stereo merger that routes the sidetone to the left, the right or both channels */
  private merger: ChannelMergerNode | null = null;

  // ---- Audio source nodes ----
  private sidetoneOsc: OscillatorNode | null = null;   // Sine wave sidetone
  private sidetoneGain: GainNode | null = null;        // Sidetone volume envelope

  /** True while any output context is paused (suspended, or interrupted on iOS) and has not recovered */
  readonly paused = signal(false);

  /** True once the contexts have stayed paused for a moment, so a short resume after returning to the app does not count. */
  readonly stalled = signal(false);
  private stalledTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * True once every output context is running and its clock is advancing, i.e. the device is really
   * playing. A phone that has been idle or locked can report `running` a second or more before sound
   * can be heard, so "Audio is running" waits for this.
   */
  readonly soundReady = signal(false);
  private clockSamples = new Map<AudioContext, { t: number; wall: number }>();
  private readyTimer: ReturnType<typeof setInterval> | null = null;

  // ---- Keep-alive: prevents browser from suspending idle audio contexts ----
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  /** Inaudible signal sources (noise, subsonic and ultrasonic tones) that keep each context's sound card awake */
  private keepAliveNodes: { src: AudioScheduledSourceNode | null; out: AudioNode[] }[] = [];
  private keepAliveLevel: OutputKeepAlive | null = null;
  /** Last gain stage before each context's destination; it leaves room for the keep-alive signal */
  private signalStages = new WeakMap<AudioContext, GainNode>();
  /** Gain every keep-alive source of a context goes through; it is closed while a tone sounds */
  private keepAliveBuses = new WeakMap<AudioContext, GainNode>();
  private visibilityHandler: (() => void) | null = null;

  private started = false;

  constructor(private settings: SettingsService) {
    effect(() => {
      const s = this.settings.settings();
      this.applySettings(s);
    });
  }

  get isStarted(): boolean { return this.started; }

  /** Start the sidetone output context and oscillator on the chosen sound card. */
  async start(): Promise<void> {
    if (this.started) return;
    const s = this.settings.settings();
    const deviceId = s.sidetoneOutputDeviceId || 'default';

    // The default output may already be open and awake (see audio-primer.ts)
    const primed = !deviceId || deviceId === 'default' ? takePrimedContext() : null;
    this.sharedCtx = primed ?? new AudioContext({ sampleRate: 48000 });
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

    this.merger = ctx.createChannelMerger(2);
    this.routeSidetone(s);
    this.merger.connect(this.signalOut(ctx));

    // A warmed-up context nobody adopted (another output device) is no longer needed
    await releasePrimedContext();

    this.installKeepAlive();
    this.started = true;
  }

  /** Test the sidetone output � plays a short burst */
  async testSidetone(durationMs: number = 1000): Promise<void> {
    if (!this.started || !this.sidetoneGain) return;
    await this.ensureResumedAsync();
    const s = this.settings.settings();
    const ctx = this.sharedCtx!;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const ramp = 0.003;
    this.sidetoneGain.gain.cancelScheduledValues(now);
    this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
    this.releaseGain(this.sidetoneGain.gain, now + dur, ramp);
    this.duckKeepAlive(ctx, now, now + dur);
  }

  /**
   * Fade a gain to silence and then snap it to exactly 0.
   * An exponential fade alone never reaches 0: the value keeps shrinking into denormal
   * floats, which some mobile CPUs process very slowly (a possible cause of crackles).
   * The snap happens ten time constants later, about -87 dB below the tone, so it is inaudible.
   * A later cancelScheduledValues() removes the snap if a new tone starts first.
   */
  private releaseGain(gain: AudioParam, at: number, ramp: number): void {
    gain.setTargetAtTime(0, at, ramp);
    gain.setValueAtTime(0, at + ramp * 10);
  }

  /** A key is held down (keyDown without its keyUp yet): the sidetone is meant to be on */
  private keyHeld = false;

  /** Key down */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    if (!this.started) return;
    const s = this.settings.settings();
    const ramp = 0.005;
    this.keyHeld = true;
    // A key-down that waited for a resume must not turn the tone on after the key-up that followed it
    this.whenRunning(() => { if (this.keyHeld) this.applyKeyDown(s, ramp, source); });
  }

  private applyKeyDown(
    s: ReturnType<typeof this.settings.settings>,
    ramp: number,
    source: 'rx' | 'tx' = 'tx'
  ): void {
    if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
      const ctx = this.sharedCtx!;
      const now = ctx.currentTime;
      this.sidetoneGain.gain.cancelScheduledValues(now);
      this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
      this.duckKeepAlive(ctx, now, null);
    }
  }

  /** Key up */
  keyUp(): void {
    if (!this.started) return;
    const ramp = 0.005;
    this.keyHeld = false;
    this.whenRunning(() => this.applyKeyUp(ramp));
  }

  /**
   * Make sure nothing is left sounding after a timeline of placed tones has ended, unless a key is held.
   * A key-down in the middle of a placed tone drops the tone's scheduled release (`cancelScheduledValues`), and a
   * gain that has no release left stays on for good, so the end of a replay releases it explicitly.
   */
  releaseIfIdle(): void {
    if (!this.started || this.keyHeld) return;
    this.applyKeyUp(0.005);
  }

  private applyKeyUp(ramp: number): void {
    if (this.sidetoneGain) {
      const ctx = this.sharedCtx!;
      const now = ctx.currentTime;
      this.sidetoneGain.gain.cancelScheduledValues(now);
      this.releaseGain(this.sidetoneGain.gain, now, ramp);
      this.duckKeepAlive(ctx, now, now);
    }
  }

  /** Timed tone for the encoder: the sidetone, filtered by forward mode */
  scheduleTone(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    if (!this.started) return Promise.resolve();
    const begun = performance.now();

    const doSchedule = () => {
      const s = this.settings.settings();
      const ramp = 0.003;
      // A tone that had to wait for the resume plays only what is left of it
      const dur = (durationMs - (performance.now() - begun)) / 1000;
      if (dur < 0.02) return;
      if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
        const ctx = this.sharedCtx!;
        const now = ctx.currentTime;
        this.sidetoneGain.gain.cancelScheduledValues(now);
        this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
        this.releaseGain(this.sidetoneGain.gain, now + dur, ramp);
        this.duckKeepAlive(ctx, now, now + dur);
      }
    };

    this.whenRunning(doSchedule);
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  // ---------- Tones placed on the audio clock ----------

  /** The master audio context: the clock that `scheduleToneAt` times are on. */
  private masterCtx(): AudioContext | null {
    return this.started ? this.sharedCtx : null;
  }

  /** The audio clock in seconds, or null when audio is not running (the caller then keeps time on the page clock). */
  clockTime(): number | null {
    return this.masterCtx()?.currentTime ?? null;
  }

  /**
   * The page-clock time (ms, the `performance.now()` scale) that audio-clock time `t` belongs to, or null when
   * audio is not running. It comes from the output timestamp, so it is smooth (`currentTime` moves in steps of
   * a whole buffer), and it is the time the audio is rendered rather than heard, so keying that follows it
   * (a serial pin) is not delayed by the output latency.
   */
  perfTimeOf(t: number): number | null {
    const ctx = this.masterCtx();
    if (!ctx) return null;
    let stamp: AudioTimestamp | null = null;
    try { stamp = ctx.getOutputTimestamp(); } catch { }
    if (stamp?.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
      const latencyMs = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
      return stamp.performanceTime + (t - stamp.contextTime) * 1000 - latencyMs;
    }
    return performance.now() + (t - ctx.currentTime) * 1000;
  }

  /**
   * The page-clock time (ms) at which audio-clock time `t` is heard: `perfTimeOf()` is the time it is rendered,
   * and the base and output latency of the context come on top. Used to put pictures at the instant of the sound.
   */
  heardPerfTimeOf(t: number): number | null {
    const ctx = this.masterCtx();
    const rendered = this.perfTimeOf(t);
    if (!ctx || rendered === null) return null;
    return rendered + ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
  }

  /** Make sure the contexts are running (the browser may have paused them), so a timeline starts on a running clock. */
  async ready(): Promise<void> {
    if (!this.started) return;
    try {
      await this.ensureResumedAsync();
    } catch { }
  }

  /**
   * Place a tone on the audio clock: the sidetone, filtered by forward mode, starting at `time`
   * (seconds on `clockTime()`) and lasting `durationMs`. Unlike `scheduleTone` it does not clear what is
   * already scheduled, so a whole character, or several, can be queued ahead with exact gaps whatever
   * the page is doing. `snapToZero` adds the final snap to silence; leave it out when another tone
   * follows within 35 ms, or the snap would land inside that tone.
   */
  scheduleToneAt(time: number, durationMs: number, source: 'rx' | 'tx' = 'tx', snapToZero = true): void {
    const master = this.masterCtx();
    if (!master) return;
    const s = this.settings.settings();
    const ramp = 0.003;
    const dur = durationMs / 1000;
    const ahead = time - master.currentTime;
    const place = (gain: GainNode, ctx: AudioContext, amplitude: number): void => {
      const start = ctx.currentTime + ahead;
      gain.gain.setTargetAtTime(amplitude, start, ramp);
      gain.gain.setTargetAtTime(0, start + dur, ramp);
      if (snapToZero) gain.gain.setValueAtTime(0, start + dur + ramp * 10);
      this.duckKeepAlive(ctx, start - KEEP_ALIVE_LEAD_S, start + dur);
    };
    if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
      place(this.sidetoneGain, this.sharedCtx!, s.sidetoneAmplitude);
    }
  }

  /** Drop every tone placed with `scheduleToneAt` that has not played yet and fade out the one that is sounding. */
  cancelScheduledTones(): void {
    if (!this.started) return;
    const ramp = 0.003;
    if (this.sidetoneGain) {
      const ctx = this.sharedCtx!;
      this.sidetoneGain.gain.cancelScheduledValues(ctx.currentTime);
      this.releaseGain(this.sidetoneGain.gain, ctx.currentTime, ramp);
      this.duckKeepAlive(ctx, ctx.currentTime, ctx.currentTime);
    }
  }

  /**
   * Sidetone-only tone, filtered by forward mode.
   * Used for received RTDB characters so the user hears the incoming
   * morse without retransmitting it.
   * @deprecated Use scheduleTone(duration, source) instead — forward settings now control routing.
   */
  scheduleSidetoneOnly(durationMs: number, source: 'rx' | 'tx' = 'rx'): Promise<void> {
    if (!this.started) return Promise.resolve();
    const begun = performance.now();

    const doSchedule = () => {
      const s = this.settings.settings();
      const dur = (durationMs - (performance.now() - begun)) / 1000;
      if (dur < 0.02) return;
      if (s.sidetoneEnabled && this.sidetoneGain && (s.sidetoneForward === 'both' || s.sidetoneForward === source)) {
        const ramp = 0.003;
        const ctx = this.sharedCtx!;
        const now = ctx.currentTime;
        this.sidetoneGain.gain.cancelScheduledValues(now);
        this.sidetoneGain.gain.setTargetAtTime(s.sidetoneAmplitude, now, ramp);
        this.releaseGain(this.sidetoneGain.gain, now + dur, ramp);
        this.duckKeepAlive(ctx, now, now + dur);
      }
    };

    this.whenRunning(doSchedule);
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  async stop(): Promise<void> {
    this.clearKeepAlive();
    await releasePrimedContext();
    try { this.sidetoneOsc?.stop(); } catch { }
    try { this.merger?.disconnect(); } catch { }

    const contexts = [this.sharedCtx];
    const closeFailures: AudioContext[] = [];
    for (const ctx of contexts) {
      if (!ctx) continue;
      try {
        await ctx.close();
      } catch {
        if (ctx.state !== 'closed') closeFailures.push(ctx);
      }
    }

    this.sharedCtx = this.sharedCtx && closeFailures.includes(this.sharedCtx) ? this.sharedCtx : null;
    this.merger = null;
    this.sidetoneOsc = null;
    this.sidetoneGain = null;
    this.started = closeFailures.length > 0;
    if (closeFailures.length > 0) {
      throw new Error('The audio output context could not be closed.');
    }
  }

  // ---- internal ----

  private applySettings(s: ReturnType<typeof this.settings.settings>): void {
    if (!this.started) return;
    if (this.sidetoneOsc) this.sidetoneOsc.frequency.value = s.sidetoneFrequency;
    if (s.outputKeepAlive !== this.keepAliveLevel) this.buildKeepAliveSignal(s.outputKeepAlive);
    if (this.merger) this.routeSidetone(s);
  }

  /** Merger input indexes for the sidetone channel choice (0 = left, 1 = right). */
  private sidetoneChannelIndexes(channel: string): number[] {
    return channel === 'both' ? [0, 1] : [channel === 'left' ? 0 : 1];
  }

  private routeSidetone(s: ReturnType<typeof this.settings.settings>): void {
    if (!this.merger) return;
    this.sidetoneGain?.disconnect();
    for (const idx of this.sidetoneChannelIndexes(s.sidetoneOutputChannel)) {
      this.sidetoneGain?.connect(this.merger, 0, idx);
    }
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
      if (ctx && isContextPaused(ctx)) {
        ctx.resume();
      }
    }
  }

  /** Awaitable version of ensureResumed for test/diagnostic methods */
  private async ensureResumedAsync(): Promise<void> {
    for (const ctx of this.allContexts()) {
      if (ctx && isContextPaused(ctx)) {
        await ctx.resume();
      }
    }
  }

  /** Resume every paused context. Call it from a user gesture: iOS refuses otherwise. */
  async resumeFromGesture(): Promise<void> {
    try {
      await this.ensureResumedAsync();
    } finally {
      this.updatePaused();
    }
  }

  /** Starts polling (100 ms) until every context is running with an advancing clock; then sets `soundReady`. */
  private watchReady(): void {
    if (this.readyTimer) return;
    const check = () => {
      const ok = this.clockAdvancing();
      if (ok !== this.soundReady()) this.soundReady.set(ok);
      if (ok && this.readyTimer) {
        clearInterval(this.readyTimer);
        this.readyTimer = null;
      }
    };
    this.readyTimer = setInterval(check, 100);
    check();
  }

  /** Each running context must have moved its clock by 0.2 s (over at least 160 ms) since first seen running. */
  private clockAdvancing(): boolean {
    const now = performance.now();
    let any = false;
    let all = true;
    for (const ctx of this.allContexts()) {
      if (!ctx) continue;
      any = true;
      if (ctx.state !== 'running') {
        this.clockSamples.delete(ctx);
        all = false;
        continue;
      }
      const sample = this.clockSamples.get(ctx);
      if (!sample) {
        this.clockSamples.set(ctx, { t: ctx.currentTime, wall: now });
        all = false;
      } else if (ctx.currentTime - sample.t < 0.2 || now - sample.wall < 160) {
        all = false;
      }
    }
    return any && all;
  }

  private updatePaused(): void {
    const paused = this.allContexts().some(ctx => isContextPaused(ctx));
    this.paused.set(paused);
    if (paused) {
      for (const ctx of this.allContexts()) {
        if (ctx && isContextPaused(ctx)) this.clockSamples.delete(ctx);
      }
      if (this.soundReady()) this.soundReady.set(false);
      this.watchReady();
    }
    if (!paused) {
      if (this.stalledTimer) {
        clearTimeout(this.stalledTimer);
        this.stalledTimer = null;
      }
      this.stalled.set(false);
    } else if (!this.stalledTimer && !this.stalled()) {
      this.stalledTimer = setTimeout(() => {
        this.stalledTimer = null;
        this.stalled.set(this.allContexts().some(ctx => isContextPaused(ctx)));
      }, 1500);
    }
  }

  /**
   * Wait until the output contexts are really running (or the time is up). After a long idle
   * period a phone needs a moment to wake the audio hardware, and a context created without a
   * user gesture stays suspended; callers use this so "running" is not shown while it is silent.
   */
  async waitUntilRunning(timeoutMs = 2500): Promise<void> {
    this.ensureResumed();
    const deadline = Date.now() + timeoutMs;
    while (this.allContexts().some(ctx => isContextPaused(ctx)) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.updatePaused();
  }

  /**
   * Run `fn` once every paused context is running again (at once when none is paused). Waiting for
   * the resume, instead of a fixed delay, keeps the first tones from being scheduled on a clock that
   * has not started yet, which would silence them.
   */
  private whenRunning(fn: () => void): void {
    const paused = this.allContexts().filter((ctx): ctx is AudioContext => !!ctx && isContextPaused(ctx));
    if (paused.length === 0) {
      fn();
      return;
    }
    void Promise.allSettled(paused.map(ctx => ctx.resume())).then(fn);
  }

  /** All active AudioContexts */
  private allContexts(): (AudioContext | null)[] {
    return [this.sharedCtx];
  }

  /**
   * Keep-alive: prevent the browser and the sound card from going to sleep.
   *
   * Strategy (three layers):
   * 1. **Inaudible signal** on every output context (see `buildKeepAliveSignal()`):
   *    real, changing samples keep Chrome from suspending the context and keep a
   *    USB sound card's amplifier from powering down after a second or two of
   *    silence, which would swallow the start of the next dot.
   * 2. **onstatechange handler**: Immediately calls resume() if a context
   *    is unexpectedly suspended.
   * 3. **Polling timer (500 ms)** + **visibilitychange handler**: Catches
   *    edge cases (tab switch, screen lock, etc.) and resumes promptly.
   */
  private installKeepAlive(): void {
    this.clearKeepAlive();
    this.buildKeepAliveSignal(this.settings.settings().outputKeepAlive);

    for (const ctx of this.allContexts()) {
      if (!ctx) continue;
      ctx.onstatechange = () => {
        if (isContextPaused(ctx)) ctx.resume().catch(() => {});
        this.updatePaused();
      };
    }

    // More aggressive polling — 500 ms catches suspension faster
    this.keepAliveTimer = setInterval(() => {
      for (const ctx of this.allContexts()) {
        if (isContextPaused(ctx)) ctx!.resume().catch(() => {});
      }
      this.updatePaused();
    }, 500);

    // Resume immediately when tab becomes visible again
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        for (const ctx of this.allContexts()) {
          if (isContextPaused(ctx)) ctx!.resume().catch(() => {});
        }
        this.updatePaused();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.updatePaused();
    this.watchReady();
  }

  /**
   * Close a context's keep-alive while a tone sounds and open it again `KEEP_ALIVE_HOLD_S` after the tone
   * has ended. A tone keeps the sound card awake by itself, and next to a loud tone the keep-alive's
   * strong subsonic part makes a speaker or amplifier distort, so it is only there in the quiet. `from`
   * is when it starts to close (a placed tone closes it a little before it starts); `until` is the end
   * of the tone, or null while a key is held (`applyKeyUp` then opens it again). The hold lets the
   * following elements of a character keep it closed.
   */
  private duckKeepAlive(ctx: AudioContext, from: number, until: number | null): void {
    const bus = this.keepAliveBuses.get(ctx);
    if (!bus) return;
    const at = Math.max(ctx.currentTime, from);
    // Drops the opening that follows the previous tone
    bus.gain.cancelScheduledValues(at);
    if (until === null || until > at) bus.gain.setTargetAtTime(0, at, 0.015);
    if (until !== null) bus.gain.setTargetAtTime(1, Math.max(until, at) + KEEP_ALIVE_HOLD_S, 0.08);
  }

  /** Largest value the keep-alive signal reaches at a level (peaks of its parts added) */
  private keepAlivePeak(level: OutputKeepAlive): number {
    if (level === 'off') return 0;
    const g = KEEP_ALIVE_LEVELS[level] ?? KEEP_ALIVE_LEVELS.normal;
    return g.noise * 2 + g.sub + g.ultra;
  }

  /**
   * The input a context's sidetone signal goes to instead of the destination. The
   * keep-alive adds to it, so a full-scale tone plus the keep-alive would clip and sound distorted;
   * this stage turns the signal down by the keep-alive's own peak (at most 1 dB) so the sum fits.
   */
  private signalOut(ctx: AudioContext): GainNode {
    let stage = this.signalStages.get(ctx);
    if (!stage) {
      stage = ctx.createGain();
      stage.channelCountMode = 'explicit';
      stage.channelCount = 2;
      stage.channelInterpretation = 'discrete';
      stage.connect(ctx.destination);
      this.signalStages.set(ctx, stage);
    }
    stage.gain.value = 1 - this.keepAlivePeak(this.settings.settings().outputKeepAlive);
    return stage;
  }

  /**
   * (Re)build the inaudible keep-alive signal on every context for a level. Three parts, both
   * channels each: dither noise at about the last bit of a 16-bit output (a sound card or its
   * resampler cannot filter it away like a single tone), a 10 Hz tone below hearing, and the
   * 20 kHz tone. Zero samples are what lets a USB card's amplifier power down.
   */
  private buildKeepAliveSignal(level: OutputKeepAlive): void {
    this.stopKeepAliveSignal();
    this.keepAliveLevel = level;
    for (const ctx of this.allContexts()) {
      const stage = ctx && this.signalStages.get(ctx);
      if (stage) stage.gain.value = 1 - this.keepAlivePeak(level);
    }
    if (level === 'off') return;
    const gains = KEEP_ALIVE_LEVELS[level] ?? KEEP_ALIVE_LEVELS.normal;

    for (const ctx of this.allContexts()) {
      if (!ctx) continue;
      try {
        const bus = ctx.createGain();
        bus.connect(ctx.destination);
        this.keepAliveBuses.set(ctx, bus);
        this.keepAliveNodes.push({ src: null, out: [bus] });
        const noiseBuf = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = noiseBuf.getChannelData(ch);
          // Triangular distribution (two uniform values) is the usual dither shape
          for (let i = 0; i < data.length; i++) data[i] = Math.random() + Math.random() - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = gains.noise;
        noise.connect(noiseGain);
        noiseGain.connect(bus);
        noise.start();
        this.keepAliveNodes.push({ src: noise, out: [noiseGain] });

        // The destination is discrete stereo, so a mono source would only reach the left channel
        const toneMerger = ctx.createChannelMerger(2);
        toneMerger.connect(bus);
        const tones: [number, number][] = [[KEEP_ALIVE_SUB_HZ, gains.sub], [KEEP_ALIVE_ULTRA_HZ, gains.ultra]];
        for (const [hz, gain] of tones) {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = hz;
          const g = ctx.createGain();
          g.gain.value = gain;
          osc.connect(g);
          g.connect(toneMerger, 0, 0);
          g.connect(toneMerger, 0, 1);
          osc.start();
          this.keepAliveNodes.push({ src: osc, out: [g, toneMerger] });
        }
      } catch { /* context may be closed */ }
    }
  }

  private stopKeepAliveSignal(): void {
    for (const node of this.keepAliveNodes) {
      try { node.src?.stop(); } catch { }
      try { node.src?.disconnect(); } catch { }
      for (const out of node.out) {
        try { out.disconnect(); } catch { }
      }
    }
    this.keepAliveNodes = [];
    this.keepAliveLevel = null;
  }

  private clearKeepAlive(): void {
    this.paused.set(false);
    this.stalled.set(false);
    this.soundReady.set(false);
    this.clockSamples.clear();
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.stalledTimer) {
      clearTimeout(this.stalledTimer);
      this.stalledTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.stopKeepAliveSignal();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
