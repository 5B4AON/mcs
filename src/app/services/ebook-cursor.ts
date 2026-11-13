/**
 * Morse Code Studio
 */

import { EbookPosition } from './ebook-model';
import { PlayableChar, playableChars, playableIndexAt } from './ebook-playable';
import { EbookWindow } from './ebook-window';

/**
 * Where Send practice stands in the book: the playable character the learner has to key next. Word
 * gaps and everything Morse has no code for are never keyed, so the cursor passes over them, across
 * blocks. It only reads blocks the window already holds; `pending` says when the next one is still
 * being read (`settle` looks again).
 */
export class EbookCursor {
  private block: number;
  private index = -1;
  private at: number;
  private chars: PlayableChar[] | null = null;

  /**
   * @param window The book's window
   * @param start  The first character to key is the first playable one at or after this position
   */
  constructor(readonly window: EbookWindow, start: EbookPosition) {
    this.block = start.block;
    this.at = start.at;
    this.settle();
  }

  /** The character to key next with its place in the text, or null at the end (or while the next block is read). */
  get current(): { char: string; position: EbookPosition } | null {
    if (!this.chars || this.index >= this.chars.length || !this.window.block(this.block)) return null;
    return { char: this.chars[this.index].char, position: { block: this.block, at: this.chars[this.index].at } };
  }

  /** Where the reading stands: on the character to key, or just past the last block when there is none. */
  get position(): EbookPosition {
    return this.current?.position ?? { block: this.block, at: 0 };
  }

  /** True when every block has been passed. */
  get ended(): boolean {
    return !this.window.block(this.block) && this.window.done;
  }

  /** True while the next block has not been read yet. */
  get pending(): boolean {
    return !this.window.block(this.block) && !this.window.done;
  }

  /** The block the cursor is in (what to ask the window for while `pending`). */
  get blockIndex(): number {
    return this.block;
  }

  /** The character was keyed: on to the next one. */
  advance(): void {
    if (this.index >= 0) this.index++;
    this.settle();
  }

  /** Land on a playable character, passing over gaps and blocks without one. */
  settle(): void {
    for (;;) {
      const block = this.window.block(this.block);
      if (!block) {
        this.chars = null;
        return;
      }
      const chars = this.chars ??= playableChars(block);
      if (this.index < 0) this.index = playableIndexAt(chars, this.at);
      while (this.index < chars.length && chars[this.index].char === ' ') this.index++;
      if (this.index < chars.length) return;
      this.block++;
      this.index = 0;
      this.chars = null;
    }
  }
}
