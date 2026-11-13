/**
 * Morse Code Studio
 */

import { Injectable, computed, signal } from '@angular/core';
import { EbookPosition } from './ebook-model';
import { blocksFromStream, ebookTextFormat } from './ebook-parsers';
import { playableChars, playableIndexAt } from './ebook-playable';
import { EbookWindow } from './ebook-window';

/** What is known about the loaded book (never its text: that stays in the window). */
export interface EbookInfo {
  /** File name */
  name: string;
  /** Format label for the status line */
  format: string;
  bytes: number;
}

/**
 * E-book Service — the one book Copy Practice and Send Practice read from.
 *
 * Holds the loaded file's name, the reading position and the sliding window of parsed text
 * (`EbookWindow`). The book is read from the file piece by piece and is never stored: not in the
 * settings, the profiles, the presets or an export. Loading is always a user action.
 */
@Injectable({ providedIn: 'root' })
export class EbookService {
  /** The loaded book, or null */
  readonly info = signal<EbookInfo | null>(null);
  /** True while a file is being opened */
  readonly loading = signal(false);
  /** Plain-language reason the last load failed ('' when it did not) */
  readonly error = signal('');
  /**
   * Where the reading stands: the next character to play (Copy: the one sounding; Send: the one to key),
   * as an absolute block and a text offset in it. Always on a playable character (see `snap`).
   */
  readonly position = signal<EbookPosition>({ block: 0, at: 0 });
  /** Counts every change of the window's content, so the reader knows when to draw new blocks */
  readonly revision = signal(0);
  /** True while a driver is playing or keying: the position moves by itself and cannot be jumped */
  readonly busy = signal(false);
  readonly loaded = computed(() => this.info() !== null);

  private window: EbookWindow | null = null;
  private file: File | null = null;
  private loadId = 0;

  /** The window of parsed text, for the reader and the drivers. */
  get text(): EbookWindow | null {
    return this.window;
  }

  /**
   * Open a file as the book. The previous book stays until the new one has been read successfully,
   * so a failed choice changes nothing. Returns whether the book was loaded.
   */
  async loadFile(file: File): Promise<boolean> {
    const format = ebookTextFormat(file.name, file.type);
    if (!format) {
      this.error.set('This kind of file cannot be loaded. Use a text (.txt), Markdown (.md) or web page (.html) file.');
      return false;
    }
    const id = ++this.loadId;
    this.loading.set(true);
    this.error.set('');
    try {
      const window = new EbookWindow(blocksFromStream(file.stream(), format));
      await window.ensure(0);
      if (id !== this.loadId) return false;
      if (!window.held().some(block => playableChars(block).length > 0)) {
        this.error.set('No text that Morse code can play was found in this file. Morse code covers English letters, digits and common punctuation.');
        return false;
      }
      this.window = window;
      this.file = file;
      this.position.set(this.snap({ block: 0, at: 0 }));
      this.revision.update(n => n + 1);
      this.info.set({ name: file.name, format: format === 'markdown' ? 'Markdown' : format === 'html' ? 'Web page' : 'Text', bytes: file.size });
      return true;
    } catch (e) {
      if (id === this.loadId) this.error.set(e instanceof Error && e.message ? e.message : 'The file could not be read.');
      return false;
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }

  /** Read the same file again from its beginning. */
  async startOver(): Promise<void> {
    if (this.file) await this.loadFile(this.file);
  }

  /** Forget the book. */
  remove(): void {
    this.loadId++;
    this.window = null;
    this.file = null;
    this.info.set(null);
    this.error.set('');
    this.loading.set(false);
    this.position.set({ block: 0, at: 0 });
    this.revision.update(n => n + 1);
  }

  /** True once the position is past the last block of a book that has been read to its end. */
  get atEnd(): boolean {
    return !!this.window && this.window.done && this.position().block >= this.window.end;
  }

  /**
   * Move the reading to the playable character at or after `p` (white space, symbols and anything
   * Morse has no code for are passed over, across blocks). Past the last block it returns the end.
   */
  snap(p: EbookPosition): EbookPosition {
    const window = this.window;
    if (!window) return p;
    let block = Math.max(p.block, window.first);
    let at = p.at;
    for (;;) {
      const b = window.block(block);
      if (!b) return { block, at: 0 };
      const chars = playableChars(b);
      let i = playableIndexAt(chars, at);
      while (i < chars.length && chars[i].char === ' ') i++;
      if (i < chars.length) return { block, at: chars[i].at };
      block++;
      at = 0;
    }
  }

  /** Move the reading (snapped to a playable character) and read more of the book if the window runs short. */
  setPosition(p: EbookPosition): void {
    this.position.set(this.snap(p));
    void this.refill();
  }

  private async refill(): Promise<void> {
    const window = this.window;
    if (!window) return;
    await window.ensure(this.position().block);
    if (window === this.window) this.revision.update(n => n + 1);
  }
}
