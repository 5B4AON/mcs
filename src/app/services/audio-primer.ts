/**
 * Morse Code Studio
 */

/** The `localStorage` flag that `AppComponent` sets while audio is running, so a reload starts it again. */
export const AUDIO_RUNNING_KEY = 'morseAudioRunning';

interface Primer {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
}

let primer: Primer | null = null;

/** Cancels the start-up that `primeAudioOutput()` has scheduled but not yet run */
let cancelPending: (() => void) | null = null;

/** After the first frame is drawn, or at the latest after this long when frames are not drawn (hidden page) */
const DEFER_FALLBACK_MS = 500;

/**
 * Opens an output `AudioContext` on the default sound output as early as possible (called first in
 * `main.ts`, before Angular boots), when audio was running last time. A phone that has been idle or
 * locked takes up to a second or two to wake its audio hardware after the first stream opens, so
 * the app starts that wake-up while it loads instead of waiting for `AudioOutputService.start()`.
 * The context itself is created only after the first frame has been drawn: creating it can block
 * the main thread while the hardware wakes, which must never delay the first paint (a Trusted Web
 * Activity keeps its splash screen until then). If the output service asks for the context or
 * releases it before that, the scheduled start is cancelled, so no context is created that nobody owns.
 * That service adopts this context (`takePrimedContext()`) when it uses the default output, and
 * closes it otherwise. Not used on iOS, where opening an output before the microphone changes the
 * audio session. The settings are not loaded yet, so nothing audible is connected.
 */
export function primeAudioOutput(): void {
  if (primer || cancelPending || typeof AudioContext === 'undefined') return;
  try {
    if (localStorage.getItem(AUDIO_RUNNING_KEY) !== '1') return;
    if (typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none')) return;
  } catch {
    return;
  }

  let frame = 0;
  let afterFrame: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    cancelAnimationFrame(frame);
    clearTimeout(afterFrame);
    clearTimeout(fallback);
    cancelPending = null;
  };
  const start = (): void => {
    cancel();
    openPrimer();
  };
  cancelPending = cancel;
  frame = requestAnimationFrame(() => { afterFrame = setTimeout(start, 0); });
  fallback = setTimeout(start, DEFER_FALLBACK_MS);
}

function openPrimer(): void {
  if (primer) return;
  try {
    const ctx = new AudioContext({ sampleRate: 48000 });
    // Real, inaudible samples (-80 dB at 20 kHz) so the stream is opened and kept awake
    const osc = ctx.createOscillator();
    osc.frequency.value = 20000;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    primer = { ctx, osc, gain };
    ctx.resume().catch(() => { /* resumed later by the output service or the next gesture */ });
  } catch {
    primer = null;
  }
}

/** Hands the warmed-up context over to the output service (its own nodes replace the primer's). */
export function takePrimedContext(): AudioContext | null {
  cancelPending?.();
  const taken = primer;
  primer = null;
  if (!taken) return null;
  try { taken.osc.stop(); } catch { }
  try { taken.gain.disconnect(); } catch { }
  if (taken.ctx.state === 'closed') return null;
  taken.ctx.resume().catch(() => { });
  return taken.ctx;
}

/** Closes the primed context when nobody adopted it (another output device, or audio never started). */
export async function releasePrimedContext(): Promise<void> {
  cancelPending?.();
  const unused = primer;
  primer = null;
  if (!unused) return;
  try { unused.osc.stop(); } catch { }
  try { unused.gain.disconnect(); } catch { }
  await unused.ctx.close().catch(() => { });
}
