/**
 * Morse Code Studio
 */

import { pauseToken } from '../morse-table';
import { EbookPosition } from './ebook-model';
import { blockEndPause } from './ebook-pauses';
import { PlayableChar, playableChars, playableIndexAt } from './ebook-playable';
import { EbookWindow } from './ebook-window';

/** A piece of the book for the encoder, and where each of its characters is in the book. */
export interface FeedChunk {
  /** Characters to play, with ' ' for a word gap and pause tokens (see `pauseToken`) between them */
  text: string;
  /** One position per character of `text`: where it sits in the displayed text. Gaps and pauses sit on the white space. */
  positions: EbookPosition[];
}

/** Pauses are counted in quarters of a word gap */
const quartersOf = (wordGaps: number): number => Math.round(wordGaps * 4);

/**
 * Cuts the book into pieces for the encoder: the playable characters of each block, a word gap and
 * the block's closing pause between blocks, and the pause of each punctuated gap inside a block (see
 * `ebook-pauses.ts`). It only reads the window, a little ahead of the position, so the encoder's
 * buffer stays small however long the book is.
 */
export class EbookFeed {
  private block: number;
  /** Index of the next playable character in the block; -1 until the starting offset has been resolved */
  private index = -1;
  private startAt: number;
  private chars: PlayableChar[] | null = null;
  private ended = false;
  private end: EbookPosition;

  /**
   * @param window The book's window; blocks are asked for as they are needed
   * @param start  Where playing begins (the first playable character at or after it)
   */
  constructor(private readonly window: EbookWindow, start: EbookPosition) {
    this.block = start.block;
    this.startAt = start.at;
    this.end = { block: start.block, at: 0 };
  }

  /** True once the last character of the book has been handed out. */
  get done(): boolean {
    return this.ended;
  }

  /** Where the reading ends up when the whole book has been played: past the last block. */
  get endPosition(): EbookPosition {
    return this.end;
  }

  /**
   * The next piece of at least `minChars` characters (less at the end of the book), or null when
   * there is nothing left. A pause always travels with the gap it belongs to.
   */
  async next(minChars: number): Promise<FeedChunk | null> {
    let text = '';
    const positions: EbookPosition[] = [];
    const push = (char: string, at: EbookPosition): void => {
      text += char;
      positions.push(at);
    };

    while (!this.ended && text.length < minChars) {
      await this.window.ensure(this.block);
      const block = this.window.block(this.block);
      if (!block) {
        this.ended = true;
        break;
      }
      const chars = this.chars ??= playableChars(block);
      if (this.index < 0) {
        this.index = playableIndexAt(chars, this.startAt);
        while (this.index < chars.length && chars[this.index].char === ' ') this.index++;
      }
      while (this.index < chars.length && text.length < minChars) {
        const c = chars[this.index];
        push(c.char, { block: this.block, at: c.at });
        if (c.char === ' ' && c.pause > 0) push(pauseToken(quartersOf(c.pause)), { block: this.block, at: c.at });
        this.index++;
      }
      if (this.index < chars.length) break;

      // The block is done: a gap with the block's closing pause, then the next block
      await this.window.ensure(this.block + 1);
      const next = this.window.block(this.block + 1);
      if (chars.length > 0) {
        if (!next) {
          this.ended = true;
          this.end = { block: this.block + 1, at: 0 };
          break;
        }
        const end: EbookPosition = { block: this.block, at: block.text.length };
        push(' ', end);
        const before = chars.slice(-4).map(c => c.char).join('');
        const pause = blockEndPause(before, block.kind, next);
        if (pause > 0) push(pauseToken(quartersOf(pause)), end);
      } else if (!next) {
        this.ended = true;
        this.end = { block: this.block + 1, at: 0 };
        break;
      }
      this.block++;
      this.index = 0;
      this.chars = null;
      this.startAt = 0;
    }
    return text ? { text, positions } : null;
  }
}
