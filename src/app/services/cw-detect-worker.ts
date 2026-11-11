/**
 * Morse Code Studio
 */

/**
 * Runs the CW detector (public/cw-detect-processor.js, an AudioWorklet
 * processor) in a plain Web Worker fed by a MediaStreamTrackProcessor, with no
 * AudioContext at all. Browsers keep an AudioContext started without a click
 * suspended (after a page reload audio restarts by itself), but reading the
 * microphone's samples has no such rule, so the detector listens at once.
 *
 * The worklet globals it uses (AudioWorkletProcessor with its port,
 * registerProcessor, sampleRate, currentFrame) are provided here; the
 * processor source is appended unchanged. The worker posts the processor's
 * own messages, plus `{ type: '__ready' }` once the first audio arrives. It
 * expects `{ __init: true, readable, channel }` (the processor's readable
 * stream, transferred) and passes every other message to the processor.
 * Pure, no Angular.
 */
const PRELUDE = `
let sampleRate = 48000;
let currentFrame = 0;
let __Proc = null;
class AudioWorkletProcessor {
  constructor() { this.port = { onmessage: null, postMessage: (m) => self.postMessage(m) }; }
}
function registerProcessor(name, cls) { __Proc = cls; }
`;

const RUNNER = `
let __proc = null;
const __early = [];
let __channel = 'both';
function __deliver(d) { if (__proc.port.onmessage) __proc.port.onmessage({ data: d }); }
self.onmessage = (e) => {
  const d = e.data;
  if (d && d.__init) { __channel = d.channel; __run(d.readable); return; }
  if (__proc) __deliver(d); else __early.push(d);
};
let __inter = new Float32Array(0);
function __plane(f, idx, n, ch, dst) {
  if (f.format === 'f32-planar') { f.copyTo(dst, { planeIndex: idx }); return; }
  if (f.format === 'f32') {
    if (__inter.length < n * ch) __inter = new Float32Array(n * ch);
    f.copyTo(__inter, { planeIndex: 0 });
    for (let j = 0; j < n; j++) dst[j] = __inter[j * ch + idx];
    return;
  }
  f.copyTo(dst, { planeIndex: idx, format: 'f32-planar' });
}
async function __run(readable) {
  const reader = readable.getReader();
  // The processor gets 128-sample blocks, as in an AudioWorklet
  const block = new Float32Array(128);
  const planes = [new Float32Array(0), new Float32Array(0)];
  let fill = 0;
  for (;;) {
    const { value: f, done } = await reader.read();
    if (done) break;
    try {
      if (!__proc) {
        sampleRate = f.sampleRate;
        __proc = new __Proc();
        for (const d of __early) __deliver(d);
        __early.length = 0;
        self.postMessage({ type: '__ready' });
      }
      const n = f.numberOfFrames, ch = f.numberOfChannels;
      // 'both' mixes left and right as Web Audio does ((L + R) / 2); a mono input serves every choice
      const pick = __channel === 'left' ? [0] : __channel === 'right' ? [Math.min(1, ch - 1)] : ch > 1 ? [0, 1] : [0];
      for (let i = 0; i < pick.length; i++) {
        if (planes[i].length < n) planes[i] = new Float32Array(n);
        __plane(f, pick[i], n, ch, planes[i]);
      }
      const a = planes[0], b = planes[1], mix = pick.length === 2;
      for (let j = 0; j < n; j++) {
        block[fill++] = mix ? 0.5 * (a[j] + b[j]) : a[j];
        if (fill === 128) { __proc.process([[block]]); currentFrame += 128; fill = 0; }
      }
    } finally {
      f.close();
    }
  }
}
`;

/** The whole worker script around the processor's source */
export function cwDetectWorkerSource(processorSource: string): string {
  return PRELUDE + '\n' + processorSource + '\n' + RUNNER;
}

/** True where the detector can run without an AudioContext (Chromium browsers) */
export function canRunCwDetectWorker(): boolean {
  return typeof Worker !== 'undefined'
    && typeof (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor === 'function';
}
