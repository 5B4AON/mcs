/**
 * Morse Code Studio
 */

/** What a block of the book is; headings and list items matter for the pauses and the look. */
export type EbookBlockKind = 'p' | 'h' | 'li' | 'quote';

/**
 * One paragraph-sized piece of the book. `text` keeps the original letter case; a `\n` in it is a real
 * line break (a verse line, an address line), while the hard wraps of a text file are already spaces.
 */
export interface EbookBlock {
  kind: EbookBlockKind;
  text: string;
  /** First block of a chapter (EPUB spine item or a "Chapter" heading): gets the longest pause before it */
  chapterStart?: boolean;
  /** A very long paragraph was cut here at a sentence end: the same paragraph goes on, so no paragraph pause */
  continued?: boolean;
}

/** Where the reader is: an absolute block index (stable while old blocks are dropped) and a text offset in it. */
export interface EbookPosition {
  block: number;
  at: number;
}

/** A source of blocks that may take a while to produce (a file or URL read on demand). */
export type EbookBlockSource = AsyncIterable<EbookBlock>;
