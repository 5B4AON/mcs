/**
 * Morse Code Studio
 */

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Lets any item ask the app to show a Help section on top of whatever is
 * open (Settings, a wizard step, a mapping popup). The app opens Help
 * without closing anything, so closing Help or pressing Escape returns
 * the user to the place they came from.
 */
@Injectable({ providedIn: 'root' })
export class HelpLinkService {
  private readonly requests = new Subject<string>();

  /** Emits the id of the Help section to show */
  readonly requested$ = this.requests.asObservable();

  /** Ask the app to open Help at the given section id */
  open(sectionId: string): void {
    this.requests.next(sectionId);
  }
}
