/**
 * Morse Code Studio
 */

/** Overall loudness of the show; the limiter after it catches the peaks, so it may exceed 1 */
export const FIREWORK_SOUND_LEVEL = 1.5;

/** The report lags the flash by this much (seconds), varying per shell: sound is slower than light, but only just noticeably */
const MIN_SOUND_DELAY = 0.03;
const MAX_SOUND_DELAY = 0.1;

/**
 * Shows that are on screen, oldest first. When the full screen opens over the main screen both show
 * fireworks; only the newest one (the one on top) makes sound, so no burst is heard without being seen.
 */
const onScreen: FireworkSound[] = [];

/** The three kinds of shell the show launches (see `FireworksComponent`) */
export type ShellKind = 'peony' | 'ring' | 'willow';

/**
 * The sound of firework shells, synthesised with the Web Audio API (no audio files).
 *
 * A real aerial shell bursts as a soft crack, a deep thump from the shock wave, a rumbling low
 * tail that rolls away over about a second (it is longer and lower for a bigger shell), and, for
 * crackle and willow shells, a scatter of tiny pops that thin out as the stars burn away. The
 * sound has no bright hiss and no tonal pings, which sound like glass and chimes. The report arrives a hair after the
 * flash because sound travels slower than light, by a slightly different amount for every shell.
 *
 * Every burst is built from fresh random choices (pitch of the thump, cut-off and length of the
 * rumble, brightness of the crack, the pops themselves, loudness, delay and stereo
 * position), so no two bursts sound the same. It plays on its own context to the device's default
 * output and does nothing when the browser will not start audio.
 */
export class FireworkSound {
  private ctx?: AudioContext;
  private out?: GainNode;
  private white?: AudioBuffer;
  private brown?: AudioBuffer;
  private failed = false;

  /** Create the audio context ahead of the first burst, so it is already running when the first shell goes off */
  prepare(): void {
    if (!onScreen.includes(this)) onScreen.push(this);
    this.ensure();
  }

  /**
   * Play the report of one shell.
   * @param kind peonies crackle moderately, willows glitter heavily, rings only pop a little
   * @param pan stereo position of the burst from -1 (left) to 1 (right)
   * @param size relative size of the shell (about 0.6–1.2): bigger bursts are lower and last longer
   */
  play(kind: ShellKind, pan: number, size: number): void {
    const ctx = this.ensure();
    const out = this.out;
    const white = this.white;
    const brown = this.brown;
    if (!ctx || !out || !white || !brown || ctx.state !== 'running' || onScreen.at(-1) !== this) return;

    const r = Math.random;
    const bang = ctx.currentTime + MIN_SOUND_DELAY + r() * (MAX_SOUND_DELAY - MIN_SOUND_DELAY);
    const level = 0.7 + r() * 0.3;
    const burstPan = Math.max(-0.9, Math.min(0.9, pan));

    const panner = ctx.createStereoPanner();
    panner.pan.value = burstPan;
    panner.connect(out);

    // The sharp crack at the start: short, bright noise
    const crack = this.noise(ctx, white, bang, 0.15, r() * 1.5);
    const crackHigh = ctx.createBiquadFilter();
    crackHigh.type = 'highpass';
    crackHigh.frequency.value = 500 + r() * 600;
    const crackLow = ctx.createBiquadFilter();
    crackLow.type = 'lowpass';
    crackLow.frequency.value = 2200 + r() * 1600;
    const crackGain = this.envelope(ctx, bang, 0.8 * level, 0.002, 0.04 + r() * 0.07);
    crack.connect(crackHigh).connect(crackLow).connect(crackGain).connect(panner);

    // The thump: a low sine whose pitch drops quickly
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const thumpFreq = (105 + r() * 45) / size;
    thump.frequency.setValueAtTime(thumpFreq, bang);
    thump.frequency.exponentialRampToValueAtTime(34 + r() * 8, bang + 0.3);
    const thumpDecay = (0.3 + r() * 0.2) * size;
    const thumpGain = this.envelope(ctx, bang, 1.2 * level, 0.004, thumpDecay);
    thump.connect(thumpGain).connect(panner);
    thump.start(bang);
    thump.stop(bang + thumpDecay + 0.15);

    // The rumble: brown noise whose cut-off falls as it dies away
    const rumbleDecay = Math.min(1.6, (0.6 + r() * 0.6) * size);
    const rumble = this.noise(ctx, brown, bang, rumbleDecay + 0.2, r() * 1.2);
    const rumbleLow = ctx.createBiquadFilter();
    rumbleLow.type = 'lowpass';
    rumbleLow.frequency.setValueAtTime((520 + r() * 300) / size, bang);
    rumbleLow.frequency.exponentialRampToValueAtTime(90 + r() * 50, bang + rumbleDecay);
    const rumbleGain = this.envelope(ctx, bang, 1.3 * level, 0.01 + r() * 0.01, rumbleDecay);
    rumble.connect(rumbleLow).connect(rumbleGain).connect(panner);

    // The pops, spread around the burst's position
    const crackles = ctx.createBufferSource();
    crackles.buffer = this.crackleBuffer(ctx, kind, burstPan);
    crackles.playbackRate.value = 0.92 + r() * 0.2;
    const cracklesHigh = ctx.createBiquadFilter();
    cracklesHigh.type = 'highpass';
    cracklesHigh.frequency.value = 1200 + r() * 800;
    const cracklesGain = ctx.createGain();
    cracklesGain.gain.value = 0.6 * level;
    crackles.connect(cracklesHigh).connect(cracklesGain).connect(out);
    crackles.start(bang + 0.25 + r() * 0.2);
  }

  /** Fade out and release the audio context (the show was removed) */
  dispose(): void {
    const index = onScreen.indexOf(this);
    if (index >= 0) onScreen.splice(index, 1);
    const ctx = this.ctx;
    const out = this.out;
    this.ctx = undefined;
    this.failed = true;
    if (!ctx || !out) return;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  }

  private ensure(): AudioContext | null {
    if (this.failed) return null;
    if (!this.ctx) {
      try {
        const ctx = new AudioContext();
        const compressor = ctx.createDynamicsCompressor();
        // A fast limiter: it only catches peaks and recovers in a blink, so the tail does not swell back after the bang
        compressor.threshold.value = -3;
        compressor.knee.value = 0;
        compressor.ratio.value = 20;
        compressor.attack.value = 0.001;
        compressor.release.value = 0.06;
        const master = ctx.createGain();
        master.gain.value = FIREWORK_SOUND_LEVEL;
        master.connect(compressor).connect(ctx.destination);
        this.ctx = ctx;
        this.out = master;
        this.white = this.noiseBuffer(ctx, 2, false);
        this.brown = this.noiseBuffer(ctx, 3, true);
      } catch {
        this.failed = true;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** White noise, or brown noise (white noise integrated, so it is full of low rumble) */
  private noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  /** A stretch of a noise buffer starting at a random place (`spread` seconds of choice), playing from `when` for `duration` */
  private noise(ctx: AudioContext, buffer: AudioBuffer, when: number, duration: number, spread: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const offset = Math.min(spread, Math.max(0, buffer.duration - duration - 0.01));
    source.start(when, offset, duration);
    return source;
  }

  /** A gain that jumps to `peak` within `attack` seconds and then dies away exponentially over `decay` seconds */
  private envelope(ctx: AudioContext, when: number, peak: number, attack: number, decay: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    return gain;
  }

  /**
   * A fresh stereo buffer of sparse pops (a few milliseconds of fast-decaying noise). Pops are mostly quiet with a few loud ones, they
   * cluster early and thin out, and each sits at its own place around the burst.
   */
  private crackleBuffer(ctx: AudioContext, kind: ShellKind, burstPan: number): AudioBuffer {
    const r = Math.random;
    const duration = kind === 'willow' ? 2 + r() * 0.5 : kind === 'peony' ? 1.2 + r() * 0.5 : 0.8 + r() * 0.3;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(2, Math.ceil(duration * rate), rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const count = Math.round((kind === 'willow' ? 110 : kind === 'peony' ? 60 : 25) * (0.7 + r() * 0.6));

    for (let i = 0; i < count; i++) {
      const at = Math.pow(r(), 1.6) * (duration - 0.1);
      const fade = 1 - at / duration;
      const amp = (0.1 + 0.4 * Math.pow(r(), 2.5)) * (0.4 + 0.6 * fade);
      const pan = Math.max(-1, Math.min(1, burstPan + (r() - 0.5) * 1.4));
      const gainLeft = Math.cos((pan + 1) * Math.PI / 4);
      const gainRight = Math.sin((pan + 1) * Math.PI / 4);
      const start = Math.floor(at * rate);
      const decay = (0.0008 + r() * 0.0035) * rate;
      const length = Math.min(buffer.length - start, Math.ceil(decay * 6));
      for (let n = 0; n < length; n++) {
        const shape = Math.exp(-n / decay);
        const v = (r() * 2 - 1) * shape * amp;
        left[start + n] += v * gainLeft;
        right[start + n] += v * gainRight;
      }
    }
    return buffer;
  }
}
