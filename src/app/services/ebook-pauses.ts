/**
 * Morse Code Studio
 */

import { EbookBlock, EbookBlockKind } from './ebook-model';

/**
 * E-book pauses in Copy practice, in word gaps (the encoder's 7-dit space after any Farnsworth
 * stretch) added on top of the normal gap, so they follow the encoder speed. Tune them here.
 */
export const EBOOK_PAUSE = {
  comma: 0.5,
  colon: 0.5,
  semicolon: 0.75,
  fullStop: 1,
  /** A real line break inside a block (verse, address) */
  line: 0.5,
  /** End of a paragraph or quote */
  paragraph: 2,
  /** End of a list item: a real line break */
  listItem: 0.5,
  heading: 2.5,
  /** Before the first block of a chapter */
  chapter: 3,
} as const;

/** Characters that close a quotation or bracket and may follow the punctuation they belong to. */
const CLOSERS = new Set(['"', '\'', ')']);

/**
 * The pause the punctuation at the end of `before` asks for. A closing quote or bracket is looked
 * through (`end."` is a full stop). Punctuation inside a word (3.14) never reaches here: pauses are
 * only taken where a gap or a block boundary follows.
 */
export function punctuationPause(before: string): number {
  let i = before.length - 1;
  while (i >= 0 && CLOSERS.has(before[i])) i--;
  switch (i >= 0 ? before[i] : '') {
    case '.': case '?': case '!': return EBOOK_PAUSE.fullStop;
    case ';': return EBOOK_PAUSE.semicolon;
    case ',': return EBOOK_PAUSE.comma;
    case ':': return EBOOK_PAUSE.colon;
    default: return 0;
  }
}

/** The pause of a word gap inside a block: its punctuation, or a real line break. The longer one wins. */
export function gapPause(before: string, lineBreak: boolean): number {
  return Math.max(punctuationPause(before), lineBreak ? EBOOK_PAUSE.line : 0);
}

/** The pause at the end of a block (`before` = the end of its playable text). The longest of punctuation and boundary wins. */
export function blockEndPause(before: string, kind: EbookBlockKind, next: EbookBlock | null): number {
  const boundary = next?.continued ? 0
    : kind === 'h' ? EBOOK_PAUSE.heading : kind === 'li' ? EBOOK_PAUSE.listItem : EBOOK_PAUSE.paragraph;
  return Math.max(punctuationPause(before), boundary, next?.chapterStart ? EBOOK_PAUSE.chapter : 0);
}
