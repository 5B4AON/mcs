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
 *     width follows the learned speed (20 Hz up to ~33 WPM, ~27 Hz at
 *     40 WPM): just wide enough for the edges, so stations 35 Hz or more
 *     away and most of the noise stay out. While decoding, the lock is not
 *     pulled by the search, only by the clean marks themselves (±4 Hz each),
 *     so a nearby station cannot drag it away. The envelope is read every 1 ms.
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
 *  7. Squelch: noise also crosses the levels now and then, and on its own
 *     it would give random E's and T's at a runaway speed. So characters are
 *     held back (gate closed) until a stretch of marks shows real Morse:
 *     dits and dahs together that fit one speed (1/3 units, gaps 1/3/7),
 *     each mark a steady tone at the locked frequency (phase coherence over
 *     the mark, little energy outside the filter, all on the same pitch
 *     within a few Hz, at a speed that is not pinned at the 50 WPM limit;
 *     at least three marks). Then the held marks are
 *     split again with the fitted speed and released, so the first letters
 *     are kept (a short burst such as TU or R decodes; a lone E cannot be
 *     told from noise and is dropped). While open, marks that do not fit
 *     (too short, much weaker than the station, or no tone) are ignored, a
 *     character with a mark that drags the speed away from the station's is
 *     dropped, single-element letters at a word start (T, E) are shown only
 *     if the word goes on, and the gate closes again when the marks stop
 *     fitting the station's pitch, speed and rhythm, or after a long silence.
 *     While the fit score dips, letters are held back: they are shown when
 *     the station fits again or ends with a normal silence, and dropped if
 *     the gate closes on the poor fit (the last moments before noise takes
 *     over). A station heard recently is trusted, so it reopens on fewer
 *     marks, unless the new marks are much weaker than it was (the noise the
 *     radio turns up once it stops): those need six marks.
 *
 * MESSAGES IN:
 *   { wpm }                                     starting speed (used until one is measured)
 *
 * MESSAGES OUT:
 *   { type: 'key', down, time }                 key edge (audio seconds) while the gate is open, drives the sidetone
 *   { type: 'pattern', pattern, unitMs }        dots and dashes of the character so far ('' clears it)
 *   { type: 'char', pattern, unitMs, wpm }      a finished character
 *   { type: 'word' }                            a word gap
 *   { type: 'stat', state, gate, freq, wpm, snrDb, env, noise, signal, hi, lo, fc, windowMs }
 *                                               gate: 'open' (decoding) or 'closed' (listening for Morse)
 *   { type: 'scope', env, raw, key, hi, lo, noise, signal, spectrum? }
 *                                               key per sample: 0 up, 1 down, 2 down but held back by the squelch
 */

const SEARCH_LO = 400;
const SEARCH_HI = 900;
const SEARCH_STEP = 10;
const MIN_UNIT_MS = 24;   // 50 WPM
const MAX_UNIT_MS = 200;  // 6 WPM
const FIT_GRID = 100;
const HISTORY = 24;
const LV_BINS = 240;       // 0.5 dB bins from -120 dB to 0 dB
const LV_WINDOW = 3000;    // ticks (ms) of envelope in the level histogram
const LV_HOLD_MS = 4000;   // keep the last good levels this long through a pause
const LV_MIN_RATIO = 3.55; // 11 dB between the noise and tone classes
const LV_MIN_SEP = 2.05;  // class distance over spread; noise alone stays under 1.95
const MK_MAX = 2000;       // ticks of I/Q kept per mark
const SQ_C_MIN = 0.55;     // phase coherence below this: not a steady tone
const SQ_C_GOOD = 0.9;     // coherence of a clean tone
const SQ_Q_A = 0.45;       // mean mark quality to open on rhythm (3+ marks)
const SQ_Q_STRONG = 0.8;   // quality to open on 2 marks, or on carrier alone
const SQ_Q_TRUST = 0.5;    // quality to reopen for a recently trusted station
const SQ_TRUST_MS = 30000; // how long a station stays trusted after the gate closes
const SQ_IMPULSE = 6;      // broadband rise over tone power: a click or crash, not a tone
const SQ_OFF_OPEN = 3.5;  // Hz: mean pitch error of the newest marks allowed to open the gate
const SQ_OFF_BAD = 6;     // Hz: a mark this far off the station's pitch is not the station
const SQ_UNIT_DEV = Math.log(1.33); // a mark that drags the speed this far from the station's is noise
const SQ_DOUBT = 0.8;     // while open, letters are held back while the fit score is under this
const SQ_WEAK_OPEN = 0.5; // a stretch this much weaker than the last station heard...
const SQ_WEAK_M = 6;      // ...needs this many marks to open (noise after a station ends is weak)
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
    // Single-element letters at a word start are held until the word goes on (noise makes these)
    this.singles = [];
    this.charBad = false; // a mark of this character did not sound like the station
    this.doubt = [];      // letters ('w' = word gap) held back while the fit is doubtful
    this.wordStart = true;
    this.ditRun = 0;

    // Per-mark carrier check: I/Q, broadband power and envelope of each tick of the mark
    this.mkI = new Float32Array(MK_MAX); this.mkQ = new Float32Array(MK_MAX);
    this.mkW = new Float32Array(MK_MAX); this.mkE = new Float32Array(MK_MAX);
    this.mkN = 0;
    this.wbAcc = 0; this.wbBase = -1;
    this.tickMs = this.tickN * 1000 / this.sr;
    this.nowMs = 0;
    this.pendGap = -1; this.prevUpMs = -1;

    // Squelch gate: characters are held back until the rhythm and the carrier show real Morse
    this.gateOpen = false;
    this.run = [];      // recent accepted marks ('m') and gaps ('g'); 'b' breaks the sequence
    this.goodEma = 1;
    this.refUnit = this.unitMs; // the open station's speed, followed slowly
    this.keyPosted = false;
    this.trustUnit = this.unitMs; this.trustMarks = []; this.trustGaps = [];
    this.trustMs = -1e9; this.trustFreq = 0;
    // Typical strength of the station's marks above the noise (0 = not known yet)
    this.ampRef = 0; this.trustAmp = 0;

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
      this.trustUnit = this.unitMs;
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
    const fc = Math.max(20, Math.min(90, 800 / this.unitMs));
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
    this.wbAcc = 0;
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
    this.wbAcc += y * y;
    if (++this.tickCount >= this.tickN) {
      this.tickCount = 0;
      const norm = 1 / Math.sqrt(this.nc * this.nc + this.ns * this.ns);
      this.nc *= norm; this.ns *= norm;
      const wb = this.wbAcc / this.tickN;
      this.wbAcc = 0;
      // A sine of amplitude A gives an envelope of A
      this._tick(2 * Math.sqrt(i * i + q * q), (idx + 1) * 1000 / this.sr, i, q, wb);
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

    // Locked: follow the tone near the locked frequency. While decoding, only the
    // station's own clean marks correct the pitch, so a neighbouring station cannot
    // pull the lock away.
    let near = -1;
    for (let b = 0; b < this.nBins; b++) {
      if (Math.abs(this.binFreqs[b] - this.freq) <= 40 && (near < 0 || this.score[b] > this.score[near])) near = b;
    }
    const nearScore = near >= 0 ? this.score[near] : 0;
    if (near >= 0 && nearScore >= 3) {
      if (!this.gateOpen) this._setFreq(this.freq + 0.15 * (this._refine(near) - this.freq));
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
      this._closeGate(ms, true);
      this._discardRun();
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
    // A new station starts from scratch: nothing it sent is trusted yet
    this._closeGate(ms, false);
    this._discardRun();
    if (Math.abs(f - this.trustFreq) > 30) this.trustMs = -1e9;
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

  _tick(env, ms, zi, zq, wb) {
    if (this.lvAdd) this._histAdd(env);
    if (this.seeding) return;
    const U = this.unitMs;
    this.nowMs = ms;

    if (++this.lvCount >= (this.levelOk ? 20 : 5)) {
      this.lvCount = 0;
      this._levelsFromHist();
      if (this.levelOk) { this.goodMu = this.mu; this.goodSig = this.sig; this.goodSdev = this.sdev; this.goodMs = ms; }
    }
    let mu = this.mu, sig = this.sig, sdev = this.sdev, ok = this.levelOk;
    // A station being decoded proves the levels: hold them while its marks keep coming
    // (between marks a radio's AGC lifts the noise, which can blur the histogram)
    if (!ok && (ms - this.goodMs < LV_HOLD_MS || (this.gateOpen && ms - this.lastGoodMs < LV_HOLD_MS))) { mu = this.goodMu; sig = this.goodSig; sdev = this.goodSdev; ok = true; }
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

    // Keep the I/Q of the mark (from the first crossing) for the carrier check
    if (this.keyDown || this.pendDown >= 0) {
      const n = this.mkN;
      if (n < MK_MAX) { this.mkI[n] = zi; this.mkQ[n] = zq; this.mkW[n] = wb; this.mkE[n] = env; this.mkN = n + 1; }
    } else {
      this.mkN = 0;
      // Broadband power of the background, to tell clicks and crashes from a tone
      if (this.wbBase < 0) this.wbBase = wb;
      else this.wbBase += (wb - this.wbBase) / 400;
    }

    // Character and word ends, on audio time
    if (!this.keyDown && this.pendDown < 0 && this.upMs >= 0) {
      const g = ms - this.upMs;
      if (this.charMarks.length && g >= 2 * this.unitMs) this._finishChar();
      if (this.wordOpen && g >= this.wordGapMs) {
        this.wordOpen = false;
        if (this.gateOpen) {
          if (this.singles.length) {
            // A word of single-element letters only: almost never real text, typical of noise
            this.singles = [];
            this._gateScore(0, 0.3, ms);
          } else {
            this._emit('w');
            this.wordStart = true;
          }
        }
      }
      if (this.gateOpen) {
        // Hang time: a long silence ends the transmission; the station stays trusted for a while
        if (g >= Math.max(1500, 3 * this.wordGapMs)) this._closeGate(ms, true);
      } else if (this.run.length && g >= Math.max(1200, 2 * this.wordGapMs)) {
        this._decideRun(ms);
      }
    }

    if (!this.replaying) this._output(env, ms);
  }

  _startMark(t) {
    // The gap is only counted once the mark proves to be a real tone
    this.prevUpMs = this.upMs;
    this.pendGap = this.upMs >= 0 && t - this.upMs < 1500 ? t - this.upMs : -1;
    this.keyDown = true;
    this.downMs = t;
    this.pendDown = -1; this.pendUp = -1;
    if (this.gateOpen && !this.replaying) {
      this.port.postMessage({ type: 'key', down: true, time: t / 1000 });
      this.keyPosted = true;
    }
  }

  _endMark(t) {
    const m = Math.max(1, t - this.downMs);
    this.keyDown = false;
    this.pendDown = -1; this.pendUp = -1;
    if (this.keyPosted) {
      this.keyPosted = false;
      if (!this.replaying) this.port.postMessage({ type: 'key', down: false, time: t / 1000 });
    }
    const n = this.mkN - Math.max(0, Math.round((this.nowMs - t) / this.tickMs));
    const qual = this._markQuality(Math.max(1, n), m);
    this.mkN = 0;
    // A long steady tone (tuning carrier) is not an element
    if (m > 8 * this.unitMs && m > 700) {
      this.upMs = t; this.lastMarkEndMs = t;
      this._runPush({ k: 'b' });
      return;
    }
    // While decoding a known station, a mark far weaker than its others is a noise peak
    // (fading is slow enough for the reference to follow it mark by mark)
    const known = this.ampRef > 0 && (this.gateOpen || this._trusted(t));
    const weak = known && qual.amp < 0.25 * this.ampRef;
    if (!qual.ok || weak || m < 0.4 * this.unitMs) {
      // Noise, a click, another station or a blip far shorter than a dit: as if it never happened
      this.upMs = this.prevUpMs;
      if (this.gateOpen) this._gateScore(0, 0.08, t);
      return;
    }
    this.upMs = t;
    this.lastMarkEndMs = t;
    this.lastGoodMs = Math.max(this.lastGoodMs, t);
    // Rises quickly, sinks slowly: a few noise peaks cannot drag it down to their level
    if (known) this.ampRef += (qual.amp > this.ampRef ? 0.3 : 0.15) * (qual.amp - this.ampRef);
    if (this.pendGap >= 0) {
      this._push(this.gaps, this.pendGap);
      this._runPush({ k: 'g', d: this.pendGap });
    } else {
      this._runPush({ k: 'b' });
    }
    this._push(this.marks, m);
    this.charMarks.push(m);
    this._runPush({ k: 'm', d: m, q: qual.score, t0: this.downMs, a: qual.amp, o: qual.offHz });
    // Only a station being decoded moves the speed: between transmissions noise peaks
    // would drag it to the fastest end (and widen the filter), so a new station is
    // judged at the last station's speed and at a speed fitted from its own burst
    if (this.gateOpen) {
      this._fitUnit();
      this._updateWordGap();
    }
    // Follow the station's pitch from its own marks (other stations never move it)
    if (qual.score >= SQ_Q_STRONG) this._setFreq(this.freq + Math.max(-4, Math.min(4, 0.25 * qual.offHz)));
    if (this.gateOpen) {
      const U = this.unitMs;
      const cls = this._markClass(m, U);
      // A real station keeps its pitch and its speed; noise peaks scatter both
      const onSpeed = Math.abs(Math.log(U / this.refUnit)) < SQ_UNIT_DEV;
      const fits = onSpeed && Math.abs(qual.offHz) <= SQ_OFF_BAD && cls > 0 && (this.pendGap < 0 || this._gapClass(this.pendGap, U) > 0);
      // Noise peaks make only dits; real text has a dah every few elements
      this.ditRun = cls === 3 ? 0 : this.ditRun + 1;
      const good = fits && qual.score > 0 && this.ditRun < 10;
      if (good) this.refUnit += 0.1 * (U - this.refUnit);
      // A mark that drags the speed away is a noise peak: drop its character rather than show a wrong one
      else if (!onSpeed) this.charBad = true;
      this._gateScore(good ? 1 : 0, 0.2, t);
      if (this.gateOpen && good && this.doubt.length && this.goodEma >= SQ_DOUBT) this._flushDoubt();
      if (this.gateOpen) {
        this.port.postMessage({ type: 'pattern', pattern: this._pattern(), unitMs: this.unitMs });
        if (this.goodEma >= 0.8) this._saveTrust(t);
      }
    } else {
      this._tryOpen(t);
    }
  }

  _finishChar() {
    const marks = this.charMarks;
    this.charMarks = [];
    const bad = this.charBad;
    this.charBad = false;
    this.wordOpen = true;
    if (this.gateOpen) {
      if (bad) {
        // A noise peak mixed in: better shown as nothing
        this.port.postMessage({ type: 'pattern', pattern: '', unitMs: this.unitMs });
        return;
      }
      if (marks.length === 1 && this.wordStart) {
        this.singles.push(marks);
        this.port.postMessage({ type: 'pattern', pattern: '', unitMs: this.unitMs });
        return;
      }
      for (const m of this.singles) this._emit(m);
      this.singles = [];
      this._emit(marks);
      this.wordStart = false;
    }
    // While closed the marks stay in the run, to be split again once the speed is known
  }

  /**
   * Show a letter (or 'w', a word gap), or hold it back while the fit is in doubt:
   * at the end of a transmission noise peaks keep the gate open for a moment, and
   * their letters come out exactly then. Held letters are shown as soon as the
   * station fits well again, or when it ends normally (long silence).
   */
  _emit(item) {
    if (this.doubt.length || this.goodEma < SQ_DOUBT) {
      this.doubt.push(item);
      if (this.doubt.length > 40) this.doubt.shift();
    } else if (item === 'w') this.port.postMessage({ type: 'word' });
    else this._postChar(item);
  }

  _flushDoubt() {
    const items = this.doubt;
    this.doubt = [];
    for (const it of items) {
      if (it === 'w') this.port.postMessage({ type: 'word' });
      else this._postChar(it);
    }
  }

  _postChar(marks) {
    this.port.postMessage({ type: 'char', pattern: this._patternOf(marks), unitMs: this.unitMs, wpm: Math.round(1200 / this.unitMs) });
  }

  _pattern() {
    return this._patternOf(this.charMarks);
  }

  _patternOf(marks) {
    let p = '';
    for (const m of marks) p += m < 2 * this.unitMs ? '.' : '-';
    return p;
  }

  // ---------------------------------------------------------------- squelch

  /**
   * Is this mark a real tone at our frequency? A keyed carrier keeps one steady
   * phase (after removing its small frequency offset); a noise bump wanders. A
   * mark whose frequency is clearly off belongs to another station, and one that
   * lifts the whole spectrum is a click or static crash.
   */
  _markQuality(n, markMs) {
    const I = this.mkI, Q = this.mkQ;
    let ar = 0, ai = 0;
    for (let k = 1; k < n; k++) {
      ar += I[k] * I[k - 1] + Q[k] * Q[k - 1];
      ai += Q[k] * I[k - 1] - I[k] * Q[k - 1];
    }
    const w = n > 1 ? Math.atan2(ai, ar) : 0;
    let sr = 0, si = 0, sa = 0, se2 = 0, sw = 0;
    const cw = Math.cos(w), sw1 = Math.sin(w);
    let c = 1, s = 0;
    for (let k = 0; k < n; k++) {
      sr += I[k] * c + Q[k] * s;
      si += Q[k] * c - I[k] * s;
      sa += Math.sqrt(I[k] * I[k] + Q[k] * Q[k]);
      se2 += this.mkE[k] * this.mkE[k];
      sw += this.mkW[k];
      const c2 = c * cw - s * sw1; s = s * cw + c * sw1; c = c2;
    }
    const coh = sa > 0 ? Math.sqrt(sr * sr + si * si) / sa : 0;
    const offHz = w * 1000 / (2 * Math.PI * this.tickMs);
    const tol = Math.max(15, 700 / Math.max(markMs, 1));
    // Tone power in our band vs the rise of the whole spectrum
    const pTone = Math.max(1e-14, (se2 / n - 1.27 * this.curMu * this.curMu) / 2);
    const dWide = sw / n - Math.max(0, this.wbBase);
    const impulse = dWide > SQ_IMPULSE * pTone;
    const ok = coh >= SQ_C_MIN && Math.abs(offHz) <= tol && !impulse;
    const score = Math.max(0, Math.min(1, (coh - SQ_C_MIN) / (SQ_C_GOOD - SQ_C_MIN)));
    return { ok, score, offHz, amp: Math.max(0, Math.sqrt(se2 / n) - this.curMu) };
  }

  /** 1 = dit, 3 = dah, 0 = neither (a mark that fits no Morse element) */
  _markClass(d, U) {
    const r = d / U;
    if (r >= 0.5 && r <= 1.75) return 1;
    if (r >= 2.1 && r <= 5) return 3;
    return 0;
  }

  /** 1 = gap inside a letter, 3 = letter or word gap, 0 = neither */
  _gapClass(d, U) {
    const r = d / U;
    if (r >= 0.5 && r <= 1.8) return 1;
    if (r >= 2.1) return 3;
    return 0;
  }

  _runPush(e) {
    if (e.k === 'b' && (!this.run.length || this.run[this.run.length - 1].k === 'b')) return;
    this.run.push(e);
    if (this.run.length > 160) this.run.shift();
  }

  /**
   * The newest unbroken stretch of marks and gaps that all fit Morse timing at
   * the fitted speed, with how good its marks sound.
   */
  _stretch(U = this.unitMs, jMin = 0) {
    let M = 0, sumQ = 0, minQ = 1, t0 = -1, j0 = -1, dit = false, dah = false, inGap = false, whole = true, off = 0, offMax = 0, offAll = 0, offAllMax = 0;
    const amps = [];
    for (let j = this.run.length - 1; j >= jMin; j--) {
      const e = this.run[j];
      if (e.k === 'b') { whole = j === 0 && whole; break; }
      if (e.k === 'g') {
        const c = this._gapClass(e.d, U);
        if (!c) { whole = false; break; }
        if (c === 1) inGap = true;
        continue;
      }
      const c = this._markClass(e.d, U);
      if (!c) { whole = false; break; }
      if (c === 1) dit = true; else dah = true;
      M++; sumQ += e.q; minQ = Math.min(minQ, e.q); t0 = e.t0; j0 = j; amps.push(e.a);
      if (M <= 5) { off += Math.abs(e.o); offMax = Math.max(offMax, Math.abs(e.o)); }
      offAll += Math.abs(e.o); offAllMax = Math.max(offAllMax, Math.abs(e.o));
    }
    if (!M) return null;
    // Bounded search (a burst's own marks): whole only if no mark lies before the bound
    if (whole && jMin > 0) for (let j = 0; j < jMin; j++) if (this.run[j].k === 'm') { whole = false; break; }
    amps.sort((a, b) => a - b);
    // A noise bump gives no rhythm to compare: real Morse has dits and dahs side by side,
    // and letters of more than one element (a slower station read at a faster speed
    // looks like a row of one-element letters: H as TTTT).
    // Dahs are long enough for the carrier test to mean something; short blips always look coherent.
    // A real station's marks all sit on its pitch; noise peaks scatter around it.
    // A speed pinned at the fastest the fit allows is noise too.
    const steady = off / Math.min(M, 5) <= SQ_OFF_OPEN && offMax <= SQ_OFF_BAD && U > MIN_UNIT_MS + 1;
    // Every mark on pitch, not only the newest: what weak stretches (noise left by a station) must show
    const steadyAll = steady && offAll / M <= SQ_OFF_OPEN && offAllMax <= SQ_OFF_BAD;
    return { M, U, meanQ: sumQ / M, minQ, t0, j0, structure: dit && dah && inGap, inGap, whole, steady, steadyAll, amp: amps[amps.length >> 1] };
  }

  /**
   * The newest burst judged at its own speed: after a fast station, or noise that
   * pushed the fit to the top speed, a slower station would otherwise be measured
   * with the old unit (its dits look like dahs, its dahs fit nothing) and lost
   * until the shared fit crept back. The speed is fitted (with no pull) from the
   * newest 3, 4, … marks, so stray marks before the station cannot drag it; the
   * one that explains the longest stretch wins.
   */
  _localStretch() {
    const marks = [], gaps = [];
    let jMin = this.run.length;
    for (let j = this.run.length - 1; j >= 0 && marks.length < 16; j--) {
      const e = this.run[j];
      if (e.k === 'b') break;
      // Noise peaks just before the station scatter around its pitch: stop at the first
      if (e.k === 'm' && Math.abs(e.o) > SQ_OFF_BAD) break;
      if (e.k === 'm') { marks.unshift(e.d); jMin = j; } else if (marks.length) gaps.unshift(e.d);
    }
    let best = null, lastU = 0;
    for (let k = 3; k <= marks.length; k++) {
      const U = this._fitOf(marks.slice(-k), gaps.slice(-(k - 1)), 0, 0);
      if (Math.abs(Math.log(U / this.unitMs)) < Math.log(1.2) || Math.abs(U - lastU) < 0.5) continue;
      lastU = U;
      const st = this._stretch(U, jMin);
      if (st && (!best || st.M > best.M)) { st.marks = marks.slice(-st.M); st.gaps = gaps.slice(-(st.M - 1)); best = st; }
    }
    return best;
  }

  /** Take the burst's own speed for good (it opened the gate) */
  _adoptLocal(st) {
    this.marks = st.marks.slice(-HISTORY);
    this.gaps = st.gaps.slice(-HISTORY);
    this.unitMs = st.U;
    this._updateWordGap();
    this._updateFilter(false);
  }

  /** Same pitch and speed as the station decoded a moment ago (U: the speed it is judged at) */
  _trusted(ms, U = this.unitMs) {
    return ms - this.trustMs < SQ_TRUST_MS && Math.abs(this.freq - this.trustFreq) <= 20 &&
      Math.abs(Math.log(U / this.trustUnit)) < Math.log(1.3);
  }

  /**
   * Marks much weaker than the last station heard: usually the noise left when it
   * stopped (the radio's AGC turns the noise up). They need a longer stretch.
   */
  _weak(st) {
    return this.trustAmp > 0 && st.amp < SQ_WEAK_OPEN * this.trustAmp;
  }

  /** Enough of a stretch to open on: weak ones need more marks, all of them clean and on pitch */
  _enough(st) {
    return this._weak(st) ? st.M >= SQ_WEAK_M && st.steadyAll && st.minQ >= SQ_Q_TRUST : st.M >= 3;
  }

  _tryOpen(ms) {
    const st = this._stretch(), loc = this._localStretch();
    const a = this._opens(st, ms), b = this._opens(loc, ms);
    // Both fit: the speed that explains more of the burst is the station's
    // (a slower station read at a fast speed fits only in short pieces)
    if (b && (!a || loc.M >= st.M)) { this._adoptLocal(loc); this._openGate(loc, ms); }
    else if (a) this._openGate(st, ms);
  }

  _opens(st, ms) {
    if (!st || !st.steady) return false;
    // Dits and dahs side by side, three marks at least: short noise blips all look like dits
    const weak = this._weak(st);
    return st.structure && this._enough(st) &&
      (st.meanQ >= SQ_Q_A || st.minQ >= SQ_Q_STRONG || (!weak && this._trusted(ms, st.U) && st.minQ >= SQ_Q_TRUST));
  }

  /** A burst ended without opening the gate: keep it only if every mark is a clean tone */
  _decideRun(ms) {
    let st = this._stretch();
    let keep = this._keeps(st, ms);
    const loc = this._localStretch();
    if (this._keeps(loc, ms) && (!keep || loc.M >= st.M)) { this._adoptLocal(loc); st = loc; keep = true; }
    if (keep) {
      this._openGate(st, ms);
      if (this.charMarks.length) {
        this._postChar(this.charMarks);
        this.charMarks = [];
        this.wordStart = false;
        this.wordOpen = true;
      }
      this._closeGate(ms, true);
    } else {
      this._discardRun();
    }
  }

  _keeps(st, ms) {
    const weak = st && this._weak(st);
    return !!st && st.whole && st.steady && st.structure && this._enough(st) &&
      (st.minQ >= SQ_Q_STRONG || (!weak && this._trusted(ms, st.U) && st.minQ >= SQ_Q_TRUST));
  }

  /**
   * Start decoding and release the held-back marks of the fitting stretch, split
   * into letters and words again with the speed fitted now (the gaps were judged
   * against an older guess while the gate was closed).
   */
  _openGate(st, ms) {
    if (!this.ampRef || !this._trusted(ms)) this.ampRef = st.amp;
    this.gateOpen = true;
    this.goodEma = 1;
    this.refUnit = this.unitMs;
    this.singles = [];
    this.doubt = [];
    this.charBad = false;
    this.ditRun = 0;
    this.wordStart = true;
    const U = this.unitMs;
    let cur = [];
    for (let j = st.j0; j < this.run.length; j++) {
      const e = this.run[j];
      if (e.k === 'm') { cur.push(e.d); continue; }
      if (e.k !== 'g' || e.d < 2 * U || !cur.length) continue;
      this._postChar(cur);
      cur = [];
      this.wordStart = false;
      if (e.d >= this.wordGapMs) { this.port.postMessage({ type: 'word' }); this.wordStart = true; }
    }
    this.charMarks = cur;
    this.wordOpen = false;
    if (cur.length) this.port.postMessage({ type: 'pattern', pattern: this._pattern(), unitMs: U });
    this._saveTrust(ms);
  }

  _saveTrust(ms) {
    this.trustUnit = this.unitMs;
    this.trustMarks = this.marks.slice();
    this.trustGaps = this.gaps.slice();
    this.trustMs = ms;
    this.trustFreq = this.freq;
    this.trustAmp = this.ampRef;
  }

  /** Back to listening: an unfinished character is dropped */
  _closeGate(ms, keepTrust) {
    if (!this.gateOpen) return;
    this.gateOpen = false;
    if (keepTrust) this.trustMs = Math.max(this.trustMs, ms);
    // A normal end (long silence) shows what was held; closing on a poor fit drops it
    if (keepTrust) this._flushDoubt();
    else {
      this.doubt = [];
      // The marks that broke the fit were noise: go back to the speed the station had
      if (this.trustUnit > 0) {
        this.marks = this.trustMarks.slice();
        this.gaps = this.trustGaps.slice();
        this.unitMs = this.trustUnit;
        this._updateWordGap();
        this._updateFilter(false);
      }
    }
    if (this.charMarks.length) {
      this.charMarks = [];
      this.port.postMessage({ type: 'pattern', pattern: '', unitMs: this.unitMs });
    }
    if (this.wordOpen && !this.wordStart) this.port.postMessage({ type: 'word' });
    this.wordOpen = false;
    this.singles = [];
    this.charBad = false;
    this.wordStart = true;
    this.run = [];
  }

  /** Forget a burst that was not Morse, and the speed it suggested */
  _discardRun() {
    this.run = [];
    if (this.gateOpen) return;
    this.charMarks = [];
    this.wordOpen = false;
    this.marks = this.trustMarks.slice();
    this.gaps = this.trustGaps.slice();
    this.unitMs = this.trustUnit;
    this.ampRef = this.trustAmp;
    this._updateWordGap();
    this._updateFilter(false);
  }

  /** While open: a running share of marks and gaps that fit; too few and the gate closes */
  _gateScore(good, alpha, ms) {
    this.goodEma += alpha * (good - this.goodEma);
    if (this.goodEma < 0.45) this._closeGate(ms, false);
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
    if (this.marks.length < 2) return;
    this.unitMs = this._fitOf(this.marks, this.gaps, Math.log(this.unitMs), 0.3);
    this._updateFilter(false);
  }

  /** Best unit for these marks and gaps; `pull` weighs a squared log distance from lnPrev */
  _fitOf(marks, gaps, lnPrev, pull) {
    const lnMin = Math.log(MIN_UNIT_MS), step = (Math.log(MAX_UNIT_MS) - lnMin) / (FIT_GRID - 1);
    const costs = new Float64Array(FIT_GRID);
    const L3 = Math.log(3), L7 = Math.log(7);
    let bestK = 0;
    for (let k = 0; k < FIT_GRID; k++) {
      const lnU = lnMin + k * step;
      let cost = pull * (lnU - lnPrev) * (lnU - lnPrev);
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
    return Math.exp(lnMin + kk * step);
  }

  // ---------------------------------------------------------------- UI data

  _output(env, ms) {
    this.scopeEnv.push(env);
    this.scopeRaw.push(this.rawPeakTick);
    this.scopeKey.push(this.keyDown ? (this.gateOpen ? 1 : 2) : 0);
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
        gate: this.gateOpen ? 'open' : 'closed',
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
