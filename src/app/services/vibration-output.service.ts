/**
 * Morse Code Studio
 */

import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * Vibration Output Service — haptic feedback when keying (TX or RX).
 *
 * Uses the Vibration API (`navigator.vibrate()`) to produce tactile
 * feedback that mirrors sidetone: the device vibrates while the key
 * is down and stops when it goes up.
 *
 * **Enhanced mode** (Option F) compensates for Android vibration motor
 * spin-up lag (~20-50 ms) by:
 *  1. Firing a short pre-pulse pattern on key-down to prime the motor.
 *  2. Delaying the cancel on key-up so the vibration extends slightly
 *     past the element boundary, making dits more perceptible.
 *
 * **Android only.** The Vibration API is available in most Android
 * browsers (Chrome, Firefox, Edge). iOS Safari does not support
 * `navigator.vibrate()` at all, and desktop browsers may silently
 * ignore it.
 *
 * Implementation notes:
 *  - `vibrate(10000)` starts a long continuous buzz.
 *  - To cancel, `vibrate(1)` replaces the running vibration with an
 *    imperceptible 1 ms pulse. `vibrate(0)` silently fails to cancel
 *    on some Android devices/browsers, so we avoid it.
 *  - A 10-second safety timeout auto-cancels vibration in case
 *    `touchend` or `keyUp()` is never delivered.
 */
@Injectable({ providedIn: 'root' })
export class VibrationOutputService {

  /** True when vibration is currently active */
  private active = false;

  /** Safety timeout that auto-stops vibration after 10 s */
  private safetyTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Delayed cancel timer for enhanced mode */
  private cancelDelay: ReturnType<typeof setTimeout> | null = null;

  /** Whether the Vibration API is available on this device */
  readonly supported: boolean;

  /** Pre-pulse pattern: 5 ms buzz, 1 ms gap, then 10 s sustained buzz */
  private static readonly PREPULSE_PATTERN = [5, 1, 10_000];

  /** How long (ms) to extend vibration past key-up in enhanced mode */
  private static readonly CANCEL_DELAY_MS = 20;

  constructor(private settings: SettingsService) {
    this.supported = typeof navigator !== 'undefined'
      && typeof navigator.vibrate === 'function';
  }

  /** Key down — start vibrating if enabled and forward mode matches */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    if (!this.settings.settings().vibrateEnabled) return;
    const fwd = this.settings.settings().vibrateForward;
    if (fwd !== 'both' && fwd !== source) return;
    if (!this.supported) return;

    // If a delayed cancel from previous key-up is pending, clear it
    if (this.cancelDelay) {
      clearTimeout(this.cancelDelay);
      this.cancelDelay = null;
    }

    if (this.active) return;   // already vibrating

    if (this.settings.settings().vibrateEnhanced) {
      // Enhanced: pre-pulse pattern to prime the motor
      navigator.vibrate(VibrationOutputService.PREPULSE_PATTERN);
    } else {
      navigator.vibrate(10000);
    }
    this.active = true;

    // Safety: auto-stop after 10 s in case keyUp() is never called
    this.safetyTimeout = setTimeout(() => this.keyUp(), 10_000);
  }

  /** Key up — stop vibrating (with optional enhanced delay) */
  keyUp(): void {
    if (!this.active) return;

    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }

    if (this.settings.settings().vibrateEnhanced) {
      // Enhanced: extend vibration slightly past key-up
      if (!this.cancelDelay) {
        this.cancelDelay = setTimeout(() => {
          this.cancelDelay = null;
          navigator.vibrate(1);
          this.active = false;
        }, VibrationOutputService.CANCEL_DELAY_MS);
      }
    } else {
      // Standard: immediate cancel
      navigator.vibrate(1);
      this.active = false;
    }
  }

  /**
   * Schedule a timed vibration pulse (for the morse encoder).
   * Mirrors AudioOutputService.scheduleTone().
   */
  schedulePulse(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    if (!this.settings.settings().vibrateEnabled) return Promise.resolve();
    const fwd = this.settings.settings().vibrateForward;
    if (fwd !== 'both' && fwd !== source) return Promise.resolve();
    if (!this.supported) return Promise.resolve();

    return new Promise(resolve => {
      navigator.vibrate(durationMs);
      setTimeout(resolve, durationMs);
    });
  }

  /** Force-stop any active vibration (e.g. on component destroy) */
  stop(): void {
    if (this.cancelDelay) {
      clearTimeout(this.cancelDelay);
      this.cancelDelay = null;
    }
    this.active = true;  // ensure keyUp() runs
    this.keyUp();
    // Force immediate cancel regardless of enhanced mode
    if (this.supported) navigator.vibrate(1);
    this.active = false;
  }
}
