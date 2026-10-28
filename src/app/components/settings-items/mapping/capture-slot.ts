/**
 * Morse Code Studio
 */

/**
 * Tracks which field of an editor is waiting for the user to press a key or
 * MIDI note ("detect"). Only one field can listen at a time; starting another
 * cancels the first. Used by the keyboard and MIDI mapping editors.
 */
export class CaptureSlot<F extends string> {
  /** The field that is currently listening, or null */
  active: F | null = null;

  private stop: (() => void) | null = null;

  /**
   * Start listening on `field`, or stop if it is already listening.
   * `start` begins the capture and returns a function that ends it.
   */
  toggle(field: F, start: () => () => void): void {
    const wasActive = this.active === field;
    this.cancel();
    if (wasActive) return;
    this.active = field;
    this.stop = start();
  }

  /** The capture delivered its value by itself; nothing left to stop. */
  finish(): void {
    this.active = null;
    this.stop = null;
  }

  /** Stop listening without a value (Cancel, Escape, closing the editor). */
  cancel(): void {
    const stop = this.stop;
    this.active = null;
    this.stop = null;
    stop?.();
  }
}
