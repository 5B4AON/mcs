/**
 * Morse Code Studio
 */

/** What a draft test tone should sound like. */
export interface TestToneOptions {
  frequency: number;
  /** 0..1 */
  amplitude: number;
  channel: 'left' | 'right' | 'both';
  /** Output device id, or 'default' */
  deviceId: string;
  durationMs?: number;
}

/**
 * Play a short tone on its own audio context.
 *
 * Wizards keep choices as a draft, so the running audio engine (which still
 * uses the live settings) cannot play them. This helper uses a throwaway
 * context, routed to the chosen device and channel, and closes it afterwards.
 * Call it from a click so the browser allows audio.
 */
export async function playTestTone(options: TestToneOptions): Promise<void> {
  const ctx = new AudioContext();
  try {
    if (options.deviceId !== 'default') {
      // Not every browser can route a context to a device; fall back to the default one
      await (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(options.deviceId);
    }
  } catch {
    // keep the default device
  }
  const durationS = (options.durationMs ?? 1000) / 1000;
  const osc = ctx.createOscillator();
  osc.frequency.value = options.frequency;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(options.amplitude, now + 0.005);
  gain.gain.setValueAtTime(options.amplitude, now + durationS - 0.005);
  gain.gain.linearRampToValueAtTime(0, now + durationS);
  const merger = ctx.createChannelMerger(2);
  osc.connect(gain);
  if (options.channel !== 'right') gain.connect(merger, 0, 0);
  if (options.channel !== 'left') gain.connect(merger, 0, 1);
  merger.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationS);
  osc.onended = () => void ctx.close();
}
