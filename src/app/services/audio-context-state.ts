/**
 * Morse Code Studio
 */

/**
 * True when the browser has paused an AudioContext: `suspended` (autoplay
 * rules, idle) or `interrupted` (iOS only: a phone call or app switch took
 * the audio session). Both are recovered with `resume()`; on iOS that works
 * only from a user gesture or once the interruption has ended.
 */
export function isContextPaused(ctx: AudioContext | null | undefined): boolean {
  if (!ctx) return false;
  const state = ctx.state as string;
  return state === 'suspended' || state === 'interrupted';
}
