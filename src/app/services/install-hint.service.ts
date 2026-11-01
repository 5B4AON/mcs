/**
 * Morse Code Studio
 */

import { Injectable, computed, signal } from '@angular/core';
import { ViewportService } from './viewport.service';

/** The non-standard install prompt event of Chromium browsers */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Which install hint the Try Morse guide shows, if any */
export type InstallHintKind = 'ios' | 'prompt';

/**
 * Install Hint Service — decides whether to suggest installing the app.
 *
 * The app is never hinted when it already runs installed
 * (`display-mode: standalone`, or `navigator.standalone` on iOS).
 *
 *  - Android and other Chromium touch devices: Chrome fires
 *    `beforeinstallprompt` only when the app is installable and not yet
 *    installed, so that event is the signal. The hint then carries an Install
 *    button that opens Chrome's own install dialog from a user click.
 *  - iPhone and iPad: there is no install event and an installed app cannot
 *    be detected from a browser tab, so the hint is shown whenever the iOS
 *    layout is active and the app is not running standalone. It lives in the
 *    dismissible Try Morse guide, so it is seen once and then closed.
 *
 * The hint only suggests; nothing is installed without the user's action.
 */
@Injectable({ providedIn: 'root' })
export class InstallHintService {

  /** True when the app is already running as an installed app */
  readonly standalone: boolean;

  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);

  /** The hint to show, or null */
  readonly hint = computed<InstallHintKind | null>(() => {
    if (this.standalone) return null;
    if (this.viewport.iosLayout) return 'ios';
    return this.deferred() && this.touchDevice ? 'prompt' : null;
  });

  private readonly touchDevice: boolean;

  constructor(private viewport: ViewportService) {
    this.standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    this.touchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (this.standalone) return;

    window.addEventListener('beforeinstallprompt', (event) => {
      // Keeps the event so the Install button can open the dialog from a click
      event.preventDefault();
      this.deferred.set(event as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => this.deferred.set(null));
  }

  /** Opens the browser's install dialog. Call it from a user click. */
  async install(): Promise<void> {
    const event = this.deferred();
    if (!event) return;
    // The event can be used once
    this.deferred.set(null);
    try {
      await event.prompt();
      await event.userChoice;
    } catch { /* dialog could not be shown */ }
  }
}
