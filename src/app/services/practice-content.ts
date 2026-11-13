/**
 * Morse Code Studio
 */

import { PRACTICE_WORDS } from '../data/practice-words';
import { CALLSIGN_PREFIXES } from '../data/callsign-prefixes';
import { KOCH_NEWEST_WEIGHT, kochNewChars, kochPool } from '../data/koch-lessons';
import { MORSE_TABLE } from '../morse-table';

/** Content kinds shared by Copy Practice and Send Practice. */
export type PracticeContentKind = 'characters' | 'words' | 'callsigns' | 'koch' | 'ebook';

/** The settings a practice mode hands to the generator (each mode maps its own keys to these). */
export interface PracticeContentOptions {
  contentMode: PracticeContentKind;
  /** Groups, words or callsigns per round */
  groupCount: number;
  /** Characters per group (characters and Koch) */
  charGroupSize: number;
  includeLetters: boolean;
  includeNumbers: boolean;
  includePunctuation: boolean;
  /** Koch lesson 1–40 */
  kochLesson: number;
  /** Allowed word lengths */
  wordLengths: number[];
}

/** Punctuation characters that have morse encodings */
const PUNCTUATION_CHARS = Object.keys(MORSE_TABLE).filter(
  ch => ch.length === 1 && !/[A-Z0-9 ]/.test(ch)
);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/**
 * Builds practice sequences (random characters, words, callsigns or Koch
 * method groups) and remembers what it used recently so that repeats are
 * avoided. Each practice mode owns its own instance, so Copy Practice and
 * Send Practice never share that memory.
 */
export class PracticeSequenceGenerator {
  private recentChars: string[] = [];
  private usedWordIndices = new Set<number>();

  /** Generate one sequence of space-separated groups for the given options. */
  generate(options: PracticeContentOptions): string {
    switch (options.contentMode) {
      case 'characters': return this.generateCharacters(options);
      case 'words': return this.generateWords(options);
      case 'callsigns': return this.generateCallsigns(options);
      case 'koch': return this.generateKoch(options);
      // An e-book is read from the book, not generated
      case 'ebook': return '';
    }
  }

  /** Forget which words were used (the character history is kept, as before). */
  clearUsedWords(): void {
    this.usedWordIndices.clear();
  }

  private generateCharacters(o: PracticeContentOptions): string {
    let pool = '';
    if (o.includeLetters) pool += LETTERS;
    if (o.includeNumbers) pool += DIGITS;
    if (o.includePunctuation) pool += PUNCTUATION_CHARS.join('');
    if (!pool) pool = LETTERS; // fallback

    // Keep a history window to avoid repeating the same character too soon.
    // Window size scales with pool size but stays reasonable.
    const historySize = Math.min(Math.floor(pool.length / 2), 10);

    return this.buildGroups(o, () => this.pickNonRecentChar(pool, historySize));
  }

  /** Build the configured number of space-separated groups from a character picker. */
  private buildGroups(o: PracticeContentOptions, pick: () => string): string {
    const groups: string[] = [];
    for (let g = 0; g < o.groupCount; g++) {
      let group = '';
      for (let c = 0; c < o.charGroupSize; c++) {
        group += pick();
      }
      groups.push(group);
    }
    return groups.join(' ');
  }

  /**
   * Koch method: random characters from lessons 1 to N, where the characters
   * the current lesson introduced get KOCH_NEWEST_WEIGHT of the picks. Recently
   * used characters are skipped, with a shorter window than Random Characters
   * so a two-character pool does not simply alternate.
   */
  private generateKoch(o: PracticeContentOptions): string {
    const pool = kochPool(o.kochLesson);
    const newest = kochNewChars(o.kochLesson);
    const historySize = Math.min(Math.floor((pool.length - 1) / 2), 10);
    const weightOf = (ch: string): number => pool.length === newest.length
      ? 1
      : newest.includes(ch)
        ? KOCH_NEWEST_WEIGHT / newest.length
        : (1 - KOCH_NEWEST_WEIGHT) / (pool.length - newest.length);

    return this.buildGroups(o, () => {
      const recent = historySize > 0 ? this.recentChars.slice(-historySize) : [];
      const candidates = pool.filter(ch => !recent.includes(ch));
      const total = candidates.reduce((sum, ch) => sum + weightOf(ch), 0);
      let r = Math.random() * total;
      let picked = candidates[candidates.length - 1];
      for (const ch of candidates) {
        r -= weightOf(ch);
        if (r < 0) { picked = ch; break; }
      }
      this.recentChars.push(picked);
      if (this.recentChars.length > 10) this.recentChars.shift();
      return picked;
    });
  }

  private pickNonRecentChar(pool: string, historySize: number): string {
    // Try to pick a character not in the recent history
    for (let attempt = 0; attempt < 20; attempt++) {
      const ch = pool[Math.floor(Math.random() * pool.length)];
      if (!this.recentChars.includes(ch)) {
        this.recentChars.push(ch);
        if (this.recentChars.length > historySize) this.recentChars.shift();
        return ch;
      }
    }
    // Fallback: pick any random character
    const ch = pool[Math.floor(Math.random() * pool.length)];
    this.recentChars.push(ch);
    if (this.recentChars.length > historySize) this.recentChars.shift();
    return ch;
  }

  private generateWords(o: PracticeContentOptions): string {
    const filtered = PRACTICE_WORDS
      .map((w, i) => ({ word: w, index: i }))
      .filter(e => o.wordLengths.includes(e.word.length));

    if (filtered.length === 0) return this.generateCharacters(o); // fallback

    // Bias toward earlier (more common) words using weighted random
    // Also avoid duplicates within the current set of used indices
    const available = filtered.filter(e => !this.usedWordIndices.has(e.index));
    const source = available.length >= o.groupCount ? available : filtered;

    // If we've exhausted most words, reset the used set
    if (available.length < o.groupCount) {
      this.usedWordIndices.clear();
    }

    const picked: string[] = [];
    const pickedIndices = new Set<number>();
    for (let i = 0; i < o.groupCount; i++) {
      // Weighted random: bias toward lower indices (more common words)
      // Using an exponential distribution: index = floor(|random²| * length)
      let attempts = 0;
      let entry = source[0];
      while (attempts < 50) {
        const r = Math.random();
        const idx = Math.floor(r * r * source.length);
        entry = source[idx];
        if (!pickedIndices.has(entry.index)) break;
        attempts++;
      }
      picked.push(entry.word.toUpperCase());
      pickedIndices.add(entry.index);
      this.usedWordIndices.add(entry.index);
    }
    return picked.join(' ');
  }

  private generateCallsigns(o: PracticeContentOptions): string {
    const calls: string[] = [];
    for (let i = 0; i < o.groupCount; i++) {
      calls.push(this.randomCallsign());
    }
    return calls.join(' ');
  }

  private randomCallsign(): string {
    const entry = CALLSIGN_PREFIXES[Math.floor(Math.random() * CALLSIGN_PREFIXES.length)];
    const digit = entry.digits.length > 0
      ? String(entry.digits[Math.floor(Math.random() * entry.digits.length)])
      : '';
    const suffixLen = 1 + Math.floor(Math.random() * 3); // 1–3
    let suffix = '';
    for (let i = 0; i < suffixLen; i++) {
      suffix += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    return `${entry.prefix}${digit}${suffix}`;
  }
}
