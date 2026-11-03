/**
 * Morse Code Studio
 */

import { Injectable, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Subscription } from 'rxjs';

/** Where the update check stands */
export type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error' | 'unavailable';

/** Automatic checks: at most this often when the app returns to the foreground, and on this interval while open */
const FOREGROUND_CHECK_GAP_MS = 5 * 60 * 1000;
const PERIODIC_CHECK_MS = 30 * 60 * 1000;
/** A manual check that gets no answer (offline, service worker not registered yet) gives up after this long */
const CHECK_TIMEOUT_MS = 20 * 1000;

/**
 * Finds out when a new version of the app has been deployed and lets the user switch to it.
 *
 * The Angular service worker serves the cached version first, downloads a new one in the
 * background and normally starts using it only on the next load, which is why a fresh deploy
 * could take several reloads to appear. This service asks the worker to check at start-up,
 * whenever the app returns to the foreground and every 30 minutes, reports when a new
 * version is downloaded (`ready`), and `applyUpdate()` switches to it and reloads. Nothing
 * reloads by itself: a surprise reload could interrupt keying or a relay session.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService implements OnDestroy {
  private readonly sw = inject(SwUpdate);
  private readonly zone = inject(NgZone);
  private readonly subs: Subscription[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private checking = false;
  private lastCheckAt = 0;

  /** False in the dev server and in browsers without service workers */
  readonly supported = this.sw.isEnabled;

  readonly state = signal<UpdateState>(this.supported ? 'idle' : 'unavailable');

  /** Extra detail for the status line (an error reason) */
  readonly message = signal('');

  /** When the last check finished without an error */
  readonly lastChecked = signal<Date | null>(null);

  /** The main-screen notice is hidden for the rest of this visit once dismissed */
  readonly noticeDismissed = signal(false);

  /** A downloaded version is waiting for the user */
  readonly ready = computed(() => this.state() === 'ready');

  constructor() {
    if (!this.supported) return;

    this.subs.push(
      this.sw.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_DETECTED') {
          if (this.state() !== 'ready') this.state.set('downloading');
        } else if (event.type === 'VERSION_READY') {
          this.noticeDismissed.set(false);
          this.state.set('ready');
        } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
          this.message.set('The new version could not be downloaded. It will be tried again.');
          this.state.set('error');
        }
      }),
      this.sw.unrecoverable.subscribe(() => {
        this.noticeDismissed.set(false);
        this.message.set('The app files on this device are out of date. Reload to fix it.');
        this.state.set('ready');
      }),
    );

    document.addEventListener('visibilitychange', this.onVisibility);
    // Outside the zone: a repeating timer would keep the app "unstable" and delay the service worker registration
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => this.zone.run(() => void this.check()), PERIODIC_CHECK_MS);
    });
    void this.check();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearInterval(this.timer);
    this.subs.forEach(s => s.unsubscribe());
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible' && Date.now() - this.lastCheckAt > FOREGROUND_CHECK_GAP_MS) {
      void this.check();
    }
  };

  /**
   * Ask the service worker whether a new version exists. Does nothing while one is already
   * downloaded or downloading. Resolves when the check is answered; the download then reports
   * through `state` (`downloading`, then `ready`).
   */
  async check(): Promise<void> {
    if (!this.supported || this.checking) return;
    if (this.state() === 'ready' || this.state() === 'downloading') return;
    this.checking = true;
    this.lastCheckAt = Date.now();
    this.message.set('');
    this.state.set('checking');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const found = await Promise.race([
        this.sw.checkForUpdate(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
        }),
      ]);
      this.lastChecked.set(new Date());
      // The version events may already have moved the state on (downloading or ready)
      if (this.state() === 'checking') this.state.set(found ? 'downloading' : 'up-to-date');
    } catch (error) {
      this.message.set(error instanceof Error && error.message === 'timeout'
        ? 'No answer from the update server. Check your connection and try again.'
        : 'The update check failed. Check your connection and try again.');
      this.state.set('error');
    } finally {
      clearTimeout(timeout);
      this.checking = false;
    }
  }

  /** Switch to the downloaded version and reload the page */
  async applyUpdate(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } catch {
      // Nothing to activate (for example after an unrecoverable state): a plain reload still helps
    }
    document.location.reload();
  }

  /** Hide the main-screen notice until the next visit */
  dismissNotice(): void {
    this.noticeDismissed.set(true);
  }
}
