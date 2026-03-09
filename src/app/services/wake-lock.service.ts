/**
 * Morse Code Studio
 */

import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * Wake Lock Service — keeps the device screen active using the Screen Wake Lock API.
 *
 * Mobile browsers suspend network connectivity (including Firebase RTDB
 * connections) when the screen locks due to idle timeout. This service
 * acquires a screen wake lock to prevent that, ensuring the app stays
 * connected while in the foreground.
 *
 * Behaviour:
 *  - Acquires the wake lock when `wakeLockEnabled` is true and the
 *    document is visible.
 *  - Automatically re-acquires the lock on `visibilitychange` when the
 *    page returns to the foreground (browsers release the sentinel
 *    when a tab is hidden or the device sleeps).
 *  - Releases the lock when the setting is disabled or the service
 *    is destroyed.
 *
 * The Screen Wake Lock API is supported in Chrome 84+, Edge 84+,
 * and Safari 16.4+. On unsupported browsers the service is a no-op.
 */
@Injectable({ providedIn: 'root' })
export class WakeLockService implements OnDestroy {

  /** Whether the Screen Wake Lock API is available on this device */
  readonly supported: boolean;

  /** The active wake lock sentinel, or null if not held */
  private sentinel: WakeLockSentinel | null = null;

  /** Flag to track explicit releases (vs. browser-initiated releases) */
  private explicitlyReleasing = false;

  /** Bound visibility change handler for cleanup */
  private readonly onVisibilityChange = this.handleVisibilityChange.bind(this);

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    this.supported = typeof navigator !== 'undefined'
      && 'wakeLock' in navigator;

    if (this.supported) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.release();
  }

  /**
   * Acquire the screen wake lock if supported and enabled.
   *
   * Safe to call multiple times — will not acquire a second lock
   * if one is already held.
   */
  async acquire(): Promise<void> {
    if (!this.supported) return;
    if (!this.settings.settings().wakeLockEnabled) return;
    if (this.sentinel) return;

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.zone.run(() => {
          this.sentinel = null;
          // If the lock was released by the browser (not explicitly by us),
          // update the setting to reflect the lost lock state
          if (!this.explicitlyReleasing && this.settings.settings().wakeLockEnabled) {
            this.settings.update({ wakeLockEnabled: false });
          }
        });
      });
    } catch {
      // Wake lock request can fail if the document is not visible
      // or the browser denies the request. Silently ignore.
      this.sentinel = null;
    }
  }

  /** Release the screen wake lock if currently held. */
  release(): void {
    if (this.sentinel) {
      this.explicitlyReleasing = true;
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
      this.explicitlyReleasing = false;
    }
  }

  /** Whether a wake lock is currently active */
  get active(): boolean {
    return this.sentinel !== null;
  }

  /**
   * Called when the setting changes. Acquires or releases the lock
   * based on the new value.
   */
  async onSettingChanged(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.acquire();
    } else {
      this.release();
    }
  }

  /**
   * Re-acquire the wake lock when the page becomes visible again.
   * Browsers release the sentinel when a page is hidden.
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.acquire();
    }
  }
}
