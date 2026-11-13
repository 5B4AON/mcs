/**
 * Morse Code Studio
 */

import { Injectable, inject } from '@angular/core';
import { APP_VERSION, WHATS_NEW } from '../version';
import { ConfirmService } from './confirm.service';

/** The last version whose "What's new" dialog was shown */
const SEEN_KEY = 'mcsWhatsNewSeen';
/** Present once the app has been used on this device (see `showOnce`) */
const PROFILES_KEY = 'morseProfiles';

/**
 * The "What's new in vX.X.X" dialog: a dismissable note with the text from `version.ts`.
 *
 * `showOnce()` opens it after the app was updated to a new version and never again for the
 * same version; `show()` opens it on request (Settings → Other → Application Updates).
 */
@Injectable({ providedIn: 'root' })
export class WhatsNewService {
  private readonly confirm = inject(ConfirmService);

  /**
   * Show the dialog when this version has not been shown on this device yet. A device that has
   * never used the app has nothing to compare with, so it only records the version.
   */
  showOnce(): void {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === APP_VERSION) return;
      const firstVisit = seen === null && localStorage.getItem(PROFILES_KEY) === null;
      localStorage.setItem(SEEN_KEY, APP_VERSION);
      if (firstVisit) return;
    } catch {
      return;
    }
    void this.show();
  }

  /** Open the dialog for the installed version. */
  show(): Promise<boolean> {
    return this.confirm.ask({
      title: `What's new in v${APP_VERSION}`,
      message: WHATS_NEW,
      confirmLabel: 'Got it',
      singleAction: true,
    });
  }
}
