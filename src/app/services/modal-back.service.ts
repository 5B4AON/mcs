/**
 * Morse Code Studio
 */

import { Injectable } from '@angular/core';

/**
 * Lets a popup that is opened by a card (not by the app shell), such as a mapping
 * editor in Settings, take part in the browser Back button. The popup registers a
 * close function while it is open: the app shell adds a history entry for it, and
 * Back closes the popup instead of the dialog underneath it.
 */
@Injectable({ providedIn: 'root' })
export class ModalBackService {
  private readonly entries: (() => boolean | void)[] = [];

  /** Set by the app shell: add or remove the history entry that goes with an entry */
  host: { push(): void; pop(): void; restore(): void } | null = null;

  /**
   * Register an open popup. `close` runs when Back is pressed; it returns true when the popup
   * stays open (for example a review step that only steps back), which keeps its history entry.
   * Returns the function to call when the popup closes by itself.
   */
  open(close: () => boolean | void): () => void {
    this.entries.push(close);
    this.host?.push();
    return () => {
      const index = this.entries.indexOf(close);
      if (index < 0) return; // already closed by the Back button
      this.entries.splice(index, 1);
      this.host?.pop();
    };
  }

  /** Back was pressed: close the most recent popup. Returns false when none is open. */
  handleBack(): boolean {
    const close = this.entries.pop();
    if (!close) return false;
    if (close() === true) {
      // Stays open: go forward again to the entry Back just left, instead of pushing a new one
      // (browsers may skip entries a page adds without a user gesture)
      this.entries.push(close);
      this.host?.restore();
    }
    return true;
  }
}
