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
  // Same context setup as the live sidetone (48 kHz, stereo destination that is not up- or down-mixed),
  // so the draft test sounds like the running sidetone
  const ctx = new AudioContext({ sampleRate: 48000 });
  try {
    if (options.deviceId !== 'default') {
      // Not every browser can route a context to a device; fall back to the default one
      await (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(options.deviceId);
    }
  } catch {
    // keep the default device
  }
  ctx.destination.channelCount = 2;
  ctx.destination.channelCountMode = 'explicit';
  ctx.destination.channelInterpretation = 'discrete';

  const durationS = (options.durationMs ?? 1000) / 1000;
  const ramp = 0.003;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = options.frequency;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  // A smooth exponential rise and fall, like the live sidetone, with a little headroom so a full-scale
  // tone cannot clip in the sound card or the operating system's mixer
  gain.gain.setValueAtTime(0, now);
  gain.gain.setTargetAtTime(options.amplitude * 0.89, now, ramp);
  gain.gain.setTargetAtTime(0, now + durationS - ramp * 4, ramp);
  gain.gain.setValueAtTime(0, now + durationS);
  const merger = ctx.createChannelMerger(2);
  osc.connect(gain);
  if (options.channel !== 'right') gain.connect(merger, 0, 0);
  if (options.channel !== 'left') gain.connect(merger, 0, 1);
  merger.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationS);
  osc.onended = () => void ctx.close();
}
