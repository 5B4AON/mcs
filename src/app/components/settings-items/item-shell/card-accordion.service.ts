/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';

/**
 * Remembers which Settings card is expanded, so that opening one card closes
 * the others. Only card-mode item shells use it; embedded (wizard) items are
 * always open and ignore it.
 */
@Injectable({ providedIn: 'root' })
export class CardAccordionService {
  /** DOM id suffix (`cardId`) of the expanded card, or null when all are collapsed */
  readonly openCardId = signal<string | null>(null);

  /** Expand the given card (collapsing any other) or collapse it if it is already open */
  toggle(cardId: string): void {
    this.openCardId.update(current => (current === cardId ? null : cardId));
  }

  /** Collapse the card only if it is the open one (used when the card is destroyed) */
  close(cardId: string): void {
    this.openCardId.update(current => (current === cardId ? null : current));
  }
}
