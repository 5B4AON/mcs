/**
 * Morse Code Studio
 */

import { EbookBlock, EbookBlockSource } from './ebook-model';

/** How much text the window keeps around the position (characters of block text). */
export const EBOOK_WINDOW_AHEAD = 12000;
export const EBOOK_WINDOW_BEHIND = 6000;

/**
 * The part of a book held in memory: a few screens behind and ahead of the position, more than the
 * visible area so scrolling is smooth and switching between the main screen and full screen is
 * instant. Blocks are numbered from the start of the book and keep their numbers when old ones are
 * dropped. More is read from the source only when the position gets close to the end of the window.
 */
export class EbookWindow {
  private blocks: EbookBlock[] = [];
  private firstIndex = 0;
  private iterator: AsyncIterator<EbookBlock> | null;
  private reading: Promise<void> = Promise.resolve();
  private ended = false;

  constructor(
    source: EbookBlockSource,
    private readonly ahead = EBOOK_WINDOW_AHEAD,
    private readonly behind = EBOOK_WINDOW_BEHIND,
  ) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  /** Absolute index of the first block still held */
  get first(): number {
    return this.firstIndex;
  }

  /** Absolute index just after the last block held */
  get end(): number {
    return this.firstIndex + this.blocks.length;
  }

  /** True once the source has no more blocks */
  get done(): boolean {
    return this.ended;
  }

  /** The block with this absolute index, if it is in the window. */
  block(index: number): EbookBlock | undefined {
    return this.blocks[index - this.firstIndex];
  }

  /** The blocks in the window, oldest first. */
  held(): readonly EbookBlock[] {
    return this.blocks;
  }

  /**
   * Make sure enough text is held ahead of `position` and drop what is far behind it. Calls queue up,
   * so overlapping requests never read the source at the same time.
   */
  ensure(position: number): Promise<void> {
    this.reading = this.reading.then(() => this.fill(position));
    return this.reading;
  }

  private async fill(position: number): Promise<void> {
    while (!this.ended && this.textAfter(position) < this.ahead) {
      const next = await this.iterator?.next();
      if (!next || next.done) {
        this.ended = true;
        this.iterator = null;
      } else {
        this.blocks.push(next.value);
      }
    }
    this.trim(position);
  }

  private textAfter(position: number): number {
    let total = 0;
    for (let i = Math.max(position, this.firstIndex); i < this.end; i++) total += this.blocks[i - this.firstIndex].text.length;
    return total;
  }

  private trim(position: number): void {
    let kept = 0;
    let drop = 0;
    for (let i = Math.min(position, this.end) - 1; i >= this.firstIndex; i--) {
      kept += this.blocks[i - this.firstIndex].text.length;
      if (kept > this.behind) {
        drop = i - this.firstIndex;
        break;
      }
    }
    if (drop > 0) {
      this.blocks.splice(0, drop);
      this.firstIndex += drop;
    }
  }
}
