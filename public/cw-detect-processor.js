/**
 * Morse Code Studio
 */

/**
 * AudioWorkletProcessor: adaptive CW tone detector and decoder front end.
 *
 * Everything that depends on timing runs here, on the audio clock, so the
 * main thread's timers and load can never stretch a dit into a dah or merge
 * two characters.
 *
 * PIPELINE (per input sample, carrying state from window to window):
 *  1. DC blocker; the last 0.6 s of audio is kept in a ring buffer.
 *  2. Tone search: every ~21 ms a Hann-windowed Goertzel bank (400–900 Hz,
 *     10 Hz steps) measures each frequency. Each bin's power is averaged and
 *     compared to the median of all bins (the noise), and its on/off
 *     variation is measured so a steady carrier is not taken for CW.
 *  3. Lock: the same peak must win several blocks; the frequency is refined
 *     between bins, then followed slowly. After 5 s without the tone the
 *     detector searches again; a much stronger tone elsewhere takes over.
 *     When it locks, the buffered audio is run through the detector again,
 *     so the characters heard while it was still searching are not lost.
 *  4. Envelope: the audio is mixed down with a sine/cosine at the locked
 *     frequency and low-pass filtered (4th-order Butterworth). The filter
 *     width follows the learned speed: wide enough for 40 WPM edges, narrow
 *     enough at 15 WPM to reject noise. The envelope is read every 1 ms.
 *  5. Levels (auto gain): the last 3 s of envelope go into a histogram in
 *     dB, which is split into a noise class and a tone class (Otsu's
 *     method). The levels come from the sound itself, never from the
 *     detector's own decisions, so a missed or false mark cannot drag them
 *     off. Key-down at 50 % and key-up at 33 % of the way from noise to
 *     signal, only while the two classes are clearly apart; the last good
 *     levels are held for 4 s through pauses. Spikes and drop-outs shorter
 *     than ~30 % of a dit are ignored; edge times are back-dated to where
 *     the crossing started.
 *  6. Timing: the dit length is fitted to the recent marks (1 or 3 units)
 *     and gaps (1, 3 or 7 units) by a robust least-squares search, so the
 *     speed is found within a few elements and dits, dahs, letter and word
 *     gaps are classified with the same unit. A character ends after a
 *     2-unit silence, a word after 5 units: under 0.2 s at 15 WPM.
 *
 * MESSAGES IN:
 *   { wpm }                                     starting speed (used until one is measured)
 *
 * MESSAGES OUT:
 *   { type: 'key', down, time }                 key edge (audio seconds), drives the sidetone
 *   { type: 'pattern', pattern, unitMs }        dots and dashes of the character so far
 *   { type: 'char', pattern, unitMs, wpm }      a finished character
 *   { type: 'word' }                            a word gap
 *   { type: 'stat', state, freq, wpm, snrDb, env, noise, signal, hi, lo, fc, windowMs }
 *   { type: 'scope', env, raw, key, hi, lo, noise, signal, spectrum? }
 */

const SEARCH_LO = 400;
const SEARCH_HI = 900;
const SEARCH_STEP = 10;
const MIN_UNIT_MS = 20;   // 60 WPM
const MAX_UNIT_MS = 200;  // 6 WPM
const FIT_GRID = 100;
const HISTORY = 24;
const LV_BINS = 240;       // 0.5 dB bins from -120 dB to 0 dB
const LV_WINDOW = 3000;    // ticks (ms) of envelope in the level histogram
const LV_HOLD_MS = 4000;   // keep the last good levels this long through a pause
const LV_MIN_RATIO = 3.55; // 11 dB between the noise and tone classes
const LV_MIN_SEP = 2.05;  // class distance over spread; noise alone stays under 1.95
const LV_LIN = new Float64Array(LV_BINS);
for (let b = 0; b < LV_BINS; b++) LV_LIN[b] = Math.pow(10, ((b + 0.5) / 2 - 120) / 20);

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  setLowpass(fc, q, sr) {
    const w = 2 * Math.PI * fc / sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = (1 - cw) / 2 / a0;
    this.b1 = (1 - cw) / a0;
    this.b2 = this.b0;
    this.a1 = -2 * cw / a0;
    this.a2 = (1 - alpha) / a0;
  }
  reset() { this.z1 = 0; this.z2 = 0; }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class CwDetectProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;

    // Settings
    this.unitMs = 60;

    // DC blocker and the replay ring
    this.dcX = 0; this.dcY = 0;
    this.ring = new Float32Array(Math.round(this.sr * 0.6));
    this.ringPos = 0; this.ringFill = 0;
    this.sampleIdx = -1;

    // Tone search
    this.searchN = Math.round(this.sr * 0.02133);
    this.searchWin = new Float32Array(this.searchN);
    for (let i = 0; i < this.searchN; i++) this.searchWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (this.searchN - 1));
    this.searchBuf = new Float32Array(this.searchN);
    this.searchW = new Float32Array(this.searchN);
    this.searchPos = 0;
    this.binFreqs = [];
    for (let f = SEARCH_LO; f <= SEARCH_HI; f += SEARCH_STEP) this.binFreqs.push(f);
    this.nBins = this.binFreqs.length;
    this.binCoeff = new Float64Array(this.nBins);
    for (let b = 0; b < this.nBins; b++) this.binCoeff[b] = 2 * Math.cos(2 * Math.PI * this.binFreqs[b] / this.sr);
    this.meanP = new Float64Array(this.nBins);
    this.m2P = new Float64Array(this.nBins);
    this.score = new Float64Array(this.nBins);
    this.sortTmp = new Float64Array(this.nBins);
    this.searchBlocks = 0;

    // Lock state
    this.state = 'search';
    this.freq = 600;
    this.cand = 0; this.candHits = 0; this.candLastMs = 0;
    this.swCand = 0; this.swHits = 0;
    this.lastGoodMs = 0;

    // Mixer (rotating phasor) and envelope filters
    this.nc = 1; this.ns = 0; this.dc = 1; this.ds = 0;
    this.lpI = [new Biquad(), new Biquad()];
    this.lpQ = [new Biquad(), new Biquad()];
    this.fc = 0;
    this.tickN = Math.max(1, Math.round(this.sr / 1000));
    this.tickCount = 0;
    this.rawPeakTick = 0;
    this._setFreq(this.freq);
    this._updateFilter(true);

    // Levels
    this._resetLevels();

    // Key state
    this.keyDown = false;
    this.pendDown = -1; this.pendUp = -1;
    this.downMs = 0; this.upMs = -1;
    this.lastMarkEndMs = -1e9;

    // Timing
    this.marks = []; this.gaps = [];
    this.charMarks = [];
    this.wordOpen = false;
    this.wordGapMs = 5 * this.unitMs;

    // Output
    this.replaying = false;
    this.scopeEnv = []; this.scopeRaw = []; this.scopeKey = [];
    this.lastScopeMs = 0; this.scopeCount = 0;
    this.lastStatMs = 0;

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(d) {
    if (d.wpm !== undefined && this.marks.length === 0) {
      this.unitMs = Math.max(MIN_UNIT_MS, Math.min(MAX_UNIT_MS, 1200 / d.wpm));
      this.wordGapMs = 5 * this.unitMs;
      this._updateFilter(false);
    }
  }

  // ---------------------------------------------------------------- audio

  process(inputs) {
    const input = inputs[0];
    const x = input && input[0];
    if (!x || x.length === 0) return true;
    if (this.sampleIdx < 0) this.sampleIdx = currentFrame;

    const ring = this.ring, ringLen = ring.length;
    for (let n = 0; n < x.length; n++) {
      const v = x[n];
      const y = v - this.dcX + 0.995 * this.dcY;
      this.dcX = v; this.dcY = y;
      ring[this.ringPos] = y;
      this.ringPos = this.ringPos + 1 === ringLen ? 0 : this.ringPos + 1;
      if (this.ringFill < ringLen) this.ringFill++;

      this._demod(y, this.sampleIdx);
      this.sampleIdx++;

      this.searchBuf[this.searchPos++] = y;
      if (this.searchPos >= this.searchN) {
        this.searchPos = 0;
        this._searchBlock(this.sampleIdx * 1000 / this.sr);
      }
    }
    return true;
  }

  _setFreq(f) {
    this.freq = f;
    const w = 2 * Math.PI * f / this.sr;
    this.dc = Math.cos(w); this.ds = Math.sin(w);
  }

  /** Envelope filter width follows the speed */
  _updateFilter(force) {
    const fc = Math.max(30, Math.min(90, 2000 / this.unitMs));
    if (!force && Math.abs(fc - this.fc) < this.fc * 0.08) return;
    this.fc = fc;
    // Two sections with these Qs make a 4th-order Butterworth
    const qs = [0.5412, 1.3066];
    for (let k = 0; k < 2; k++) {
      this.lpI[k].setLowpass(fc, qs[k], this.sr);
      this.lpQ[k].setLowpass(fc, qs[k], this.sr);
    }
  }

  _resetDemod() {
    this.nc = 1; this.ns = 0;
    for (const f of this.lpI) f.reset();
    for (const f of this.lpQ) f.reset();
    this.tickCount = 0;
  }

  _demod(y, idx) {
    let i = y * this.nc;
    let q = -y * this.ns;
    const nc = this.nc * this.dc - this.ns * this.ds;
    this.ns = this.ns * this.dc + this.nc * this.ds;
    this.nc = nc;
    i = this.lpI[1].process(this.lpI[0].process(i));
    q = this.lpQ[1].process(this.lpQ[0].process(q));
    const a = y < 0 ? -y : y;
    if (a > this.rawPeakTick) this.rawPeakTick = a;
    if (++this.tickCount >= this.tickN) {
      this.tickCount = 0;
      const norm = 1 / Math.sqrt(this.nc * this.nc + this.ns * this.ns);
      this.nc *= norm; this.ns *= norm;
      // A sine of amplitude A gives an envelope of A
      this._tick(2 * Math.sqrt(i * i + q * q), (idx + 1) * 1000 / this.sr);
    }
  }

  // ---------------------------------------------------------------- tone search and lock

  _searchBlock(ms) {
    const N = this.searchN, buf = this.searchBuf, w = this.searchW, win = this.searchWin;
    for (let i = 0; i < N; i++) w[i] = buf[i] * win[i];
    for (let b = 0; b < this.nBins; b++) {
      const c = this.binCoeff[b];
      let s1 = 0, s2 = 0;
      for (let i = 0; i < N; i++) {
        const s0 = w[i] + c * s1 - s2;
        s2 = s1; s1 = s0;
      }
      const p = (s1 * s1 + s2 * s2 - c * s1 * s2) / (N * N);
      this.meanP[b] += 0.25 * (p - this.meanP[b]);
      this.m2P[b] += 0.25 * (p * p - this.m2P[b]);
    }
    this.searchBlocks++;
    this.sortTmp.set(this.meanP);
    this.sortTmp.sort();
    const noise = Math.max(this.sortTmp[this.nBins >> 1], 1e-20);
    let best = 0;
    for (let b = 0; b < this.nBins; b++) {
      this.score[b] = this.meanP[b] / noise;
      if (this.score[b] > this.score[best]) best = b;
    }
    if (this.searchBlocks < 4) return;

    const keyed = this._cv(best) >= 0.3;
    const bestF = this._refine(best);

    if (this.state === 'search') {
      if (this.score[best] >= 6 && keyed) {
        if (this.candHits > 0 && Math.abs(bestF - this.cand) <= 20) this.candHits++;
        else { this.cand = bestF; this.candHits = 1; }
        this.candLastMs = ms;
        if (this.candHits >= 4) this._lock(bestF, ms);
      } else if (ms - this.candLastMs > 1500) {
        this.candHits = 0;
      }
      return;
    }

    // Locked: follow the tone near the locked frequency
    let near = -1;
    for (let b = 0; b < this.nBins; b++) {
      if (Math.abs(this.binFreqs[b] - this.freq) <= 40 && (near < 0 || this.score[b] > this.score[near])) near = b;
    }
    const nearScore = near >= 0 ? this.score[near] : 0;
    if (near >= 0 && nearScore >= 3) {
      const f = this._refine(near);
      this._setFreq(this.freq + 0.15 * (f - this.freq));
      this.lastGoodMs = ms;
    }
    // A much stronger keyed tone elsewhere takes over
    if (Math.abs(bestF - this.freq) > 60 && this.score[best] >= 6 && keyed && this.score[best] > 3 * nearScore) {
      if (this.swHits > 0 && Math.abs(bestF - this.swCand) <= 20) this.swHits++;
      else { this.swCand = bestF; this.swHits = 1; }
      if (this.swHits >= 40) this._lock(bestF, ms);
    } else if (this.swHits > 0) {
      this.swHits--;
    }
    if (ms - this.lastGoodMs > 5000) {
      this.state = 'search';
      this.candHits = 0;
      if (this.keyDown) this._endMark(ms);
    }
  }

  _cv(b) {
    const m = this.meanP[b];
    if (m <= 0) return 0;
    return Math.sqrt(Math.max(0, this.m2P[b] - m * m)) / m;
  }

  /** Peak frequency between bins (parabola through the log powers) */
  _refine(b) {
    if (b <= 0 || b >= this.nBins - 1) return this.binFreqs[b];
    const a = Math.log(this.meanP[b - 1] + 1e-30);
    const c = Math.log(this.meanP[b] + 1e-30);
    const d = Math.log(this.meanP[b + 1] + 1e-30);
    const den = a - 2 * c + d;
    const delta = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - d) / den)) : 0;
    return this.binFreqs[b] + delta * SEARCH_STEP;
  }

  _lock(f, ms) {
    const quiet = ms - this.lastMarkEndMs > 600 && !this.keyDown;
    this.state = 'locked';
    this.lastGoodMs = ms;
    this.candHits = 0; this.swHits = 0;
    if (this.keyDown) this._endMark(ms);
    this._setFreq(f);
    this._resetDemod();
    this._resetLevels();
    this.pendDown = -1; this.pendUp = -1;
    if (!quiet) return;
    // Run the buffered audio through the new lock, so nothing heard while searching is lost.
    // Pass 1 only measures the envelope, to seed the noise and signal levels; pass 2 decodes.
    this.replaying = true;
    this.seeding = true;
    this._replayRing();
    this.seeding = false;
    this.lvAdd = false;
    this._resetDemod();
    this._replayRing();
    this.lvAdd = true;
    this.replaying = false;
  }

  _replayRing() {
    const ring = this.ring, len = ring.length, fill = this.ringFill;
    let pos = (this.ringPos - fill + len) % len;
    const firstIdx = this.sampleIdx - fill;
    for (let k = 0; k < fill; k++) {
      this._demod(ring[pos], firstIdx + k);
      pos = pos + 1 === len ? 0 : pos + 1;
    }
  }

  // ---------------------------------------------------------------- levels and keying

  _resetLevels() {
    this.lvRing = new Uint8Array(LV_WINDOW);
    this.lvHist = new Int32Array(LV_BINS);
    this.lvPos = 0; this.lvFill = 0; this.lvCount = 0;
    this.lvAdd = true;
    this.mu = 0; this.sdev = 0; this.sig = 0;
    this.goodMu = 0; this.goodSig = 0; this.goodSdev = 0; this.goodMs = -1e9;
    this.pk = 0;
    this.hi = 0; this.lo = 0;
    this.valid = false;
    this.levelOk = false;
    this.lvSep = 0;
    this.curMu = 0; this.curSig = 0;
  }

  _histAdd(env) {
    const db = env > 1e-6 ? 20 * Math.log10(env) : -120;
    const b = Math.max(0, Math.min(LV_BINS - 1, Math.floor((db + 120) * 2)));
    if (this.lvFill === LV_WINDOW) this.lvHist[this.lvRing[this.lvPos]]--;
    else this.lvFill++;
    this.lvRing[this.lvPos] = b;
    this.lvHist[b]++;
    this.lvPos = this.lvPos + 1 === LV_WINDOW ? 0 : this.lvPos + 1;
  }

  /** Splits the envelope histogram into noise and tone (Otsu) and checks they are clearly apart */
  _levelsFromHist() {
    const h = this.lvHist, n = this.lvFill;
    this.levelOk = false;
    if (n < 150) return;
    let sumAll = 0;
    for (let b = 0; b < LV_BINS; b++) sumAll += b * h[b];
    let w0 = 0, s0 = 0, best = -1, bestT = -1;
    for (let t = 0; t < LV_BINS - 1; t++) {
      w0 += h[t]; s0 += t * h[t];
      const w1 = n - w0;
      if (w0 === 0 || w1 === 0) continue;
      const d = s0 / w0 - (sumAll - s0) / w1;
      const v = w0 * w1 * d * d;
      if (v > best) { best = v; bestT = t; }
    }
    if (bestT < 0) return;
    let c0 = 0, l0 = 0, q0 = 0, c1 = 0, l1 = 0, g0 = 0, g1 = 0, gq0 = 0, gq1 = 0;
    for (let b = 0; b < LV_BINS; b++) {
      const k = h[b]; if (!k) continue;
      const v = LV_LIN[b];
      if (b <= bestT) { c0 += k; l0 += k * v; q0 += k * v * v; g0 += k * b; gq0 += k * b * b; }
      else { c1 += k; l1 += k * v; g1 += k * b; gq1 += k * b * b; }
    }
    const mu = l0 / c0, sig = l1 / c1;
    this.mu = mu; this.sig = sig;
    this.sdev = Math.sqrt(Math.max(0, q0 / c0 - mu * mu));
    // Separation of the two classes in dB, against their spread: noise alone
    // splits into two touching halves, a keyed tone into two clear humps
    const m0 = g0 / c0, m1 = g1 / c1;
    const sd = Math.sqrt(Math.max(1, (gq0 / c0 - m0 * m0) + (gq1 / c1 - m1 * m1)));
    this.lvSep = (m1 - m0) / sd;
    const w1 = c1 / n;
    this.levelOk = w1 >= 0.02 && w1 <= 0.9 && sig >= LV_MIN_RATIO * mu && this.lvSep >= LV_MIN_SEP && sig > 1e-5;
  }

  _tick(env, ms) {
    if (this.lvAdd) this._histAdd(env);
    if (this.seeding) return;
    const U = this.unitMs;

    if (++this.lvCount >= (this.levelOk ? 20 : 5)) {
      this.lvCount = 0;
      this._levelsFromHist();
      if (this.levelOk) { this.goodMu = this.mu; this.goodSig = this.sig; this.goodSdev = this.sdev; this.goodMs = ms; }
    }
    let mu = this.mu, sig = this.sig, sdev = this.sdev, ok = this.levelOk;
    if (!ok && ms - this.goodMs < LV_HOLD_MS) { mu = this.goodMu; sig = this.goodSig; sdev = this.goodSdev; ok = true; }
    this.curMu = mu; this.curSig = sig;

    // Fast signal follower for fading (QSB): rises within a few ms, sinks toward
    // the noise over ~10 units, never below what noise peaks could reach
    if (env > this.pk) this.pk += 0.2 * (env - this.pk);
    else this.pk += (mu - this.pk) / (10 * U);
    const sigEff = Math.max(this.pk, mu + 5 * sdev, mu + 0.25 * (sig - mu));

    const range = sigEff - mu;
    this.hi = mu + 0.5 * range;
    this.lo = mu + 0.33 * range;
    this.valid = ok && this.state !== 'search';

    // Key state with glitch rejection (~30 % of a dit, 3–10 ms); edges back-dated to the crossing
    const glitch = Math.max(3, Math.min(10, 0.3 * U));
    if (!this.keyDown) {
      if (this.valid && env >= this.hi) {
        if (this.pendDown < 0) this.pendDown = ms;
        if (ms - this.pendDown >= glitch) this._startMark(this.pendDown);
      } else {
        this.pendDown = -1;
      }
    } else if (!this.valid || env < this.lo) {
      if (this.pendUp < 0) this.pendUp = ms;
      if (!this.valid || ms - this.pendUp >= glitch * 0.8) this._endMark(this.pendUp);
    } else {
      this.pendUp = -1;
    }

    // Character and word ends, on audio time
    if (!this.keyDown && this.pendDown < 0 && this.upMs >= 0) {
      const g = ms - this.upMs;
      if (this.charMarks.length && g >= 2 * this.unitMs) this._finishChar();
      if (this.wordOpen && g >= this.wordGapMs) {
        this.wordOpen = false;
        this.port.postMessage({ type: 'word' });
      }
    }

    if (!this.replaying) this._output(env, ms);
  }

  _startMark(t) {
    if (this.upMs >= 0) {
      const g = t - this.upMs;
      if (g < 1500) this._push(this.gaps, g);
    }
    this.keyDown = true;
    this.downMs = t;
    this.pendDown = -1; this.pendUp = -1;
    if (!this.replaying) this.port.postMessage({ type: 'key', down: true, time: t / 1000 });
  }

  _endMark(t) {
    const m = Math.max(1, t - this.downMs);
    this.keyDown = false;
    this.upMs = t;
    this.lastMarkEndMs = t;
    this.pendDown = -1; this.pendUp = -1;
    if (!this.replaying) this.port.postMessage({ type: 'key', down: false, time: t / 1000 });
    // A long steady tone (tuning carrier) is not an element
    if (m > 8 * this.unitMs && m > 700) return;
    this._push(this.marks, m);
    this.charMarks.push(m);
    this._fitUnit();
    this._updateWordGap();
    this.port.postMessage({ type: 'pattern', pattern: this._pattern(), unitMs: this.unitMs });
  }

  _finishChar() {
    const pattern = this._pattern();
    this.charMarks = [];
    this.wordOpen = true;
    this.port.postMessage({ type: 'char', pattern, unitMs: this.unitMs, wpm: Math.round(1200 / this.unitMs) });
  }

  _pattern() {
    let p = '';
    for (const m of this.charMarks) p += m < 2 * this.unitMs ? '.' : '-';
    return p;
  }

  /** Word gap threshold: 5 units, or more when the letter gaps are stretched (Farnsworth) */
  _updateWordGap() {
    const U = this.unitMs;
    const lg = this.gaps.filter((g) => g > 2 * U).sort((a, b) => a - b);
    let thr = 5 * U;
    if (lg.length >= 4) thr = Math.max(thr, Math.min(20 * U, 1.67 * lg[Math.floor(lg.length * 0.35)]));
    this.wordGapMs = thr;
  }

  _push(arr, v) {
    arr.push(v);
    if (arr.length > HISTORY) arr.shift();
  }

  /**
   * Fit the unit (dit length) to recent marks and gaps: each mark should be
   * 1 or 3 units, each gap 1, 3 or 7. Robust squared log errors, newer items
   * weigh more, and a light pull toward the current unit keeps it steady.
   */
  _fitUnit() {
    const marks = this.marks, gaps = this.gaps;
    if (marks.length < 2) return;
    const lnMin = Math.log(MIN_UNIT_MS), step = (Math.log(MAX_UNIT_MS) - lnMin) / (FIT_GRID - 1);
    const lnPrev = Math.log(this.unitMs);
    const costs = new Float64Array(FIT_GRID);
    const L3 = Math.log(3), L7 = Math.log(7);
    let bestK = 0;
    for (let k = 0; k < FIT_GRID; k++) {
      const lnU = lnMin + k * step;
      let cost = 0.3 * (lnU - lnPrev) * (lnU - lnPrev);
      let w = 1;
      for (let j = marks.length - 1; j >= 0; j--, w *= 0.92) {
        const r = Math.log(marks[j]) - lnU;
        const e = Math.min(r * r, (r - L3) * (r - L3));
        cost += w * Math.min(e, 0.36);
      }
      w = 0.6;
      for (let j = gaps.length - 1; j >= 0; j--, w *= 0.92) {
        const r = Math.log(gaps[j]) - lnU;
        const e = r >= L7 ? (r - L7) * (r - L7) : Math.min(r * r, (r - L3) * (r - L3), (r - L7) * (r - L7));
        cost += w * Math.min(e, 0.36);
      }
      costs[k] = cost;
      if (cost < costs[bestK]) bestK = k;
    }
    let kk = bestK;
    if (bestK > 0 && bestK < FIT_GRID - 1) {
      const a = costs[bestK - 1], b = costs[bestK], c = costs[bestK + 1];
      const den = a - 2 * b + c;
      if (den > 0) kk = bestK + Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
    }
    this.unitMs = Math.exp(lnMin + kk * step);
    this._updateFilter(false);
  }

  // ---------------------------------------------------------------- UI data

  _output(env, ms) {
    this.scopeEnv.push(env);
    this.scopeRaw.push(this.rawPeakTick);
    this.scopeKey.push(this.keyDown ? 1 : 0);
    this.rawPeakTick = 0;
    if (ms - this.lastScopeMs >= 33) {
      this.lastScopeMs = ms;
      const envA = Float32Array.from(this.scopeEnv);
      const rawA = Float32Array.from(this.scopeRaw);
      const keyA = Uint8Array.from(this.scopeKey);
      this.scopeEnv.length = 0; this.scopeRaw.length = 0; this.scopeKey.length = 0;
      const msg = {
        type: 'scope', env: envA, raw: rawA, key: keyA,
        hi: this.hi, lo: this.lo, noise: this.curMu, signal: this.curSig,
      };
      const transfer = [envA.buffer, rawA.buffer, keyA.buffer];
      if (++this.scopeCount % 3 === 0) {
        const spec = new Float32Array(this.nBins);
        for (let b = 0; b < this.nBins; b++) spec[b] = 10 * Math.log10(Math.max(this.score[b], 1e-3));
        msg.spectrum = spec;
        msg.specLo = SEARCH_LO; msg.specStep = SEARCH_STEP;
        transfer.push(spec.buffer);
      }
      this.port.postMessage(msg, transfer);
    }
    if (ms - this.lastStatMs >= 200) {
      this.lastStatMs = ms;
      this.port.postMessage({
        type: 'stat',
        state: this.state,
        freq: this.freq,
        wpm: Math.round(1200 / this.unitMs),
        snrDb: this.curMu > 0 ? 20 * Math.log10(this.curSig / this.curMu) : 0,
        sep: this.lvSep || 0,
        env, noise: this.curMu, signal: this.curSig, hi: this.hi, lo: this.lo,
        fc: this.fc,
        windowMs: Math.round(this.searchN * 1000 / this.sr),
      });
    }
  }
}

registerProcessor('cw-detect-processor', CwDetectProcessor);
