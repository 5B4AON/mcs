/**
 * Morse Code Studio
 */

import { Injectable, NgZone, OnDestroy, computed, effect, signal, untracked } from '@angular/core';
import { SettingsService } from './settings.service';

/** How often the held lock is verified while the page is visible */
const CHECK_INTERVAL_MS = 10_000;

/**
 * Wake Lock Service — keeps the device screen active using the Screen Wake Lock API.
 *
 * Mobile browsers suspend network connectivity (including Firebase RTDB
 * connections) when the screen locks due to idle timeout. This service
 * acquires a screen wake lock to prevent that, ensuring the app stays
 * connected while in the foreground.
 *
 * Behaviour:
 *  - The `wakeLockEnabled` setting is the user's choice and is never changed
 *    by the browser releasing the lock. The service only tries to make the
 *    real lock state match it.
 *  - Acquires the lock whenever it is wanted, not held and the page is
 *    visible: when the saved profile finishes loading (an effect on the
 *    setting), on `visibilitychange`, `pageshow` and `focus`, when the
 *    browser releases the sentinel, and from a periodic check.
 *  - The lock counts as held only when the sentinel exists and its
 *    `released` flag is false, so a lock the browser dropped silently is
 *    noticed.
 *  - When a request fails, `lastError` is set; `needsAttention` then drives
 *    an amber banner whose button calls `acquire()` from a user gesture.
 *
 * The Screen Wake Lock API is supported in Chrome 84+, Edge 84+,
 * and Safari 16.4+. On unsupported browsers the service is a no-op.
 */
@Injectable({ providedIn: 'root' })
export class WakeLockService implements OnDestroy {

  /** Whether the Screen Wake Lock API is available on this device */
  readonly supported: boolean;

  /** True while a verified, unreleased lock is held */
  readonly held = signal(false);

  /** Message of the last failed request, or null when the last attempt did not fail */
  readonly lastError = signal<string | null>(null);

  /** True when the user closed the banner; cleared once the lock is held again */
  private readonly dismissed = signal(false);

  /** The lock is wanted and not held after a failed attempt, so the user should be told */
  readonly needsAttention = computed(() =>
    this.supported
    && this.settings.settings().wakeLockEnabled
    && !this.held()
    && this.lastError() !== null
    && !this.dismissed());

  /** The active wake lock sentinel, or null if not held */
  private sentinel: WakeLockSentinel | null = null;

  /** In-flight request, so overlapping triggers share one attempt */
  private pending: Promise<void> | null = null;

  /** Periodic verification timer */
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  /** Bound handlers for cleanup */
  private readonly onWake = this.handleWake.bind(this);

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    this.supported = typeof navigator !== 'undefined'
      && 'wakeLock' in navigator;

    if (!this.supported) return;

    document.addEventListener('visibilitychange', this.onWake);
    window.addEventListener('pageshow', this.onWake);
    window.addEventListener('focus', this.onWake);
    this.zone.runOutsideAngular(() => {
      this.checkTimer = setInterval(() => this.zone.run(() => this.onWake()), CHECK_INTERVAL_MS);
    });

    // The saved profile loads after startup, so react to the setting itself
    effect(() => {
      const enabled = this.settings.settings().wakeLockEnabled;
      untracked(() => {
        if (enabled) {
          void this.acquire();
        } else {
          this.release();
        }
      });
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('pageshow', this.onWake);
    window.removeEventListener('focus', this.onWake);
    if (this.checkTimer !== null) clearInterval(this.checkTimer);
    this.release();
  }

  /**
   * Acquire the screen wake lock if supported, enabled and the page is visible.
   *
   * Safe to call multiple times — does nothing while a live lock is held.
   * A sentinel the browser already released is replaced.
   */
  acquire(): Promise<void> {
    if (!this.supported) return Promise.resolve();
    if (!this.settings.settings().wakeLockEnabled) return Promise.resolve();
    if (this.sentinel && !this.sentinel.released) {
      this.held.set(true);
      return Promise.resolve();
    }
    this.sentinel = null;
    this.held.set(false);
    // Requests fail while hidden; the next visibility event retries
    if (document.visibilityState !== 'visible') return Promise.resolve();
    if (!this.pending) {
      this.pending = this.request().finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  /** Release the screen wake lock if currently held. */
  release(): void {
    const s = this.sentinel;
    // Clear first, so the 'release' event is recognised as ours and ignored
    this.sentinel = null;
    this.held.set(false);
    this.lastError.set(null);
    this.dismissed.set(false);
    if (s) s.release().catch(() => {});
  }

  /** Whether a wake lock is currently active */
  get active(): boolean {
    return this.held();
  }

  /** Hide the banner until the lock has been held again */
  dismissWarning(): void {
    this.dismissed.set(true);
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

  /** Ask the browser for the lock and record the outcome */
  private async request(): Promise<void> {
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!this.settings.settings().wakeLockEnabled) {
        s.release().catch(() => {});
        return;
      }
      this.sentinel = s;
      s.addEventListener('release', () => this.zone.run(() => this.onReleased(s)));
      this.held.set(true);
      this.lastError.set(null);
      this.dismissed.set(false);
    } catch (e) {
      this.sentinel = null;
      this.held.set(false);
      const reason = e instanceof Error && e.message ? e.message : 'The browser refused the request.';
      this.lastError.set(reason);
    }
  }

  /** The browser dropped the lock (tab hidden, screen off, low battery). The setting stays as the user left it. */
  private onReleased(s: WakeLockSentinel): void {
    if (this.sentinel !== s) return;
    this.sentinel = null;
    this.held.set(false);
    if (document.visibilityState === 'visible') {
      void this.acquire();
    }
  }

  /** Verify the lock is really held whenever the page could have changed state */
  private handleWake(): void {
    if (document.visibilityState !== 'visible') return;
    void this.acquire();
  }
}
