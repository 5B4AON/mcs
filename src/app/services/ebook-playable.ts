/**
 * Morse Code Studio
 */

import { MORSE_TABLE } from '../morse-table';
import { EbookBlock } from './ebook-model';
import { gapPause } from './ebook-pauses';

/**
 * One character the encoder will play (or the learner will key), tied to where it sits in the
 * displayed block text so the reader can highlight it in place.
 */
export interface PlayableChar {
  /** Offset of the displayed character in `EbookBlock.text` (an expansion such as "..." shares one) */
  at: number;
  /** Upper-case character in the Morse table, or a single space for a word gap */
  char: string;
  /** Extra pause after this character, in word gaps (set on gaps only; see `ebook-pauses.ts`) */
  pause: number;
}

/** Typographic characters books use that the table has an equivalent for. */
const TYPOGRAPHIC: Record<string, string> = {
  '\u2018': '\'', '\u2019': '\'', '\u201A': '\'', '\u2032': '\'',
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u2033': '"',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2015': '-', '\u2212': '-',
  '\u2026': '...',
  '\u00E6': 'AE', '\u00C6': 'AE', '\u0153': 'OE', '\u0152': 'OE', '\u00DF': 'SS', '\u00F8': 'O', '\u00D8': 'O',
};

const COMBINING_MARKS = /[\u0300-\u036F]/g;
const WHITESPACE = /\s/;

/**
 * What a displayed character becomes in Morse: the characters to play (possibly several, possibly none)
 * or ' ' for white space. Anything the table has no code for is discarded silently.
 */
export function playableOf(char: string): string {
  if (WHITESPACE.test(char) || char === '\u00A0') return ' ';
  const mapped = TYPOGRAPHIC[char] ?? char;
  let out = '';
  for (const c of mapped) {
    const upper = c.toUpperCase();
    if (upper.length === 1 && MORSE_TABLE[upper]) {
      out += upper;
      continue;
    }
    // Strip accents (é → E); a character that still has no code is dropped
    const base = c.normalize('NFD').replace(COMBINING_MARKS, '').toUpperCase();
    if (base.length === 1 && MORSE_TABLE[base]) out += base;
  }
  return out;
}

/**
 * The characters of a block that get played, in order. White space (including real line breaks) becomes
 * one word gap; gaps are never first or last in a block, and discarded characters leave no trace, so
 * "wait 😀 for" is "WAIT FOR". Each gap carries the pause the text before it asks for.
 */
export function playableChars(block: EbookBlock): PlayableChar[] {
  const out: PlayableChar[] = [];
  const text = block.text;
  let before = '';
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0;
    const char = String.fromCodePoint(cp);
    const width = char.length;
    const p = playableOf(char);
    if (p === ' ') {
      // One run of white space is one gap, however many characters it has
      let end = i + width;
      let line = char === '\n';
      while (end < text.length && WHITESPACE.test(text[end])) {
        if (text[end] === '\n') line = true;
        end++;
      }
      const last = out[out.length - 1];
      if (last && last.char === ' ') {
        // A discarded character split the run: keep one gap, keep the strongest pause
        last.pause = Math.max(last.pause, gapPause(before, line));
      } else if (last) {
        out.push({ at: i, char: ' ', pause: gapPause(before, line) });
      }
      i = end;
      continue;
    }
    for (const c of p) {
      out.push({ at: i, char: c, pause: 0 });
      before += c;
    }
    if (before.length > 4) before = before.slice(-4);
    i += width;
  }
  while (out.length && out[out.length - 1].char === ' ') out.pop();
  return out;
}

/** Index in `chars` of the first playable character at or after the displayed offset `at` (chars.length when none). */
export function playableIndexAt(chars: PlayableChar[], at: number): number {
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chars[mid].at < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
