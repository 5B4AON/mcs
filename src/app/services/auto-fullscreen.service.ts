/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy, computed, effect, signal, untracked } from '@angular/core';
import { SettingsService } from './settings.service';
import { InstallHintService } from './install-hint.service';

/** Events that count as a user gesture for the Fullscreen API */
const GESTURE_EVENTS = ['pointerup', 'touchend', 'keydown'] as const;

/**
 * Auto Full Screen Service — puts the whole browser page into full screen
 * with the Fullscreen API (not the app's own fullscreen conversation view).
 *
 * Behaviour:
 *  - The `autoFullscreen` setting is the user's choice. Turning it on asks
 *    the browser for full screen; turning it off leaves full screen.
 *  - Browsers only allow full screen after a tap or key press. When the
 *    request is refused (for example right after a reload), the service waits
 *    for the next tap or key press and `needsTap` drives a small prompt.
 *  - Leaving full screen (Esc, a swipe) never pulls the user back in. The app
 *    asks again only when the setting is switched on again or at the next
 *    app start.
 *  - Nothing happens when the app runs as an installed PWA (already full
 *    screen) or when the browser has no Fullscreen API (iPhone).
 *  - `isFullscreen` follows `document.fullscreenElement` and the
 *    `fullscreenchange` event, so it also reflects changes made outside the app.
 */
@Injectable({ providedIn: 'root' })
export class AutoFullscreenService implements OnDestroy {

  /** Whether this browser can show the page in full screen */
  readonly supported: boolean;

  /** True when the app is installed and therefore already full screen */
  readonly installed: boolean;

  /** True while the page is really in full screen */
  readonly isFullscreen = signal(document.fullscreenElement !== null);

  /** Message of the last refused request, or null */
  readonly lastError = signal<string | null>(null);

  /** The request was refused without a gesture and a tap or key press will retry it */
  readonly waitingForTap = signal(false);

  /** True when the user closed the prompt */
  private readonly dismissed = signal(false);

  /** Drives the "Tap for full screen" prompt */
  readonly needsTap = computed(() => this.waitingForTap() && !this.dismissed());

  /** In-flight request, so overlapping triggers share one attempt */
  private pending: Promise<void> | null = null;

  private readonly wanted = computed(() => this.settings.settings().autoFullscreen);

  private readonly onChange = (): void => {
    const full = document.fullscreenElement !== null;
    this.isFullscreen.set(full);
    if (full) this.stopWaiting();
  };

  private readonly onGesture = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') return;
    // Closing the prompt must not itself go full screen
    if (event.target instanceof Element && event.target.closest('[data-no-fullscreen]')) return;
    this.stopWaiting();
    void this.enter(true);
  };

  constructor(
    private settings: SettingsService,
    install: InstallHintService,
  ) {
    this.installed = install.standalone
      || window.matchMedia('(display-mode: fullscreen)').matches;
    this.supported = typeof document.documentElement.requestFullscreen === 'function'
      && document.fullscreenEnabled !== false;

    if (!this.supported) return;

    document.addEventListener('fullscreenchange', this.onChange);

    // The saved profile loads after startup, so react to the setting itself
    effect(() => {
      const enabled = this.wanted();
      untracked(() => void this.onSettingChanged(enabled));
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onChange);
    this.stopWaiting();
  }

  /**
   * Called when the setting changes (and once the saved profile loads).
   * Safe to call from a click handler so the browser sees the user gesture.
   */
  async onSettingChanged(enabled: boolean): Promise<void> {
    if (!this.supported) return;
    this.stopWaiting();
    this.lastError.set(null);
    this.dismissed.set(false);
    if (enabled) {
      if (!this.installed) await this.enter(false);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }

  /** Try again from a user click (the prompt and the card button) */
  retry(): Promise<void> {
    this.stopWaiting();
    this.dismissed.set(false);
    return this.enter(true);
  }

  /** Hide the prompt and stop waiting for a tap */
  dismissPrompt(): void {
    this.dismissed.set(true);
    this.stopWaiting();
  }

  /** Ask for full screen; a refusal outside a gesture means "wait for the next tap or key press" */
  private enter(fromGesture: boolean): Promise<void> {
    if (document.fullscreenElement || !this.wanted()) return Promise.resolve();
    // A second request while one is open would find the gesture already used
    if (!this.pending) {
      this.pending = this.request(fromGesture).finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  private async request(fromGesture: boolean): Promise<void> {
    try {
      await document.documentElement.requestFullscreen();
      this.lastError.set(null);
    } catch (e) {
      if (fromGesture) {
        this.lastError.set(e instanceof Error && e.message ? e.message : 'The browser refused the request.');
      } else {
        this.startWaiting();
      }
    }
  }

  private startWaiting(): void {
    if (this.waitingForTap()) return;
    this.waitingForTap.set(true);
    for (const type of GESTURE_EVENTS) document.addEventListener(type, this.onGesture, true);
  }

  private stopWaiting(): void {
    this.waitingForTap.set(false);
    for (const type of GESTURE_EVENTS) document.removeEventListener(type, this.onGesture, true);
  }
}
