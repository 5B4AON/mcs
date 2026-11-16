/**
 * Morse Code Studio
 */

import { EbookPosition } from './ebook-model';
import { PracticeFeedback } from './practice-scoring';
import { TypedPlacer } from './typed-placer';

type Result = PracticeFeedback['result'];

/** Slots that share one displayed character (an expansion such as "..." or "AE"), and the gap after it */
const SHARED_SLOTS = 4;

/** What is drawn for one displayed character of the book: the typed text under it and how it compares. */
export interface TypedCell {
  text: string;
  result: Result | null;
}

/** Where a slot's typed text is drawn: the displayed character it belongs to; a gap's has a `g` (drawn after the character before it); typed-ahead text has a `p`. */
export function typedKey(position: EbookPosition): string {
  return `${position.block}:${position.at}`;
}

/**
 * Lines what the learner types up with the characters of an e-book that have been played, for the reader to
 * draw under each of them. A slot is one playable character (the unit Copy practice is scored on: a word gap
 * is a slot too); the text of a slot goes to the displayed character the slot sits on.
 *
 * The placing is done by `TypedPlacer`: typed characters stay together under the next free places and only move
 * when the last few of them fit somewhere else exactly. Characters typed ahead of what has played wait.
 */
export class EbookTypedTracker {
  private chars = '';
  private keys: string[] = [];
  private readonly placer = new TypedPlacer();
  /** Cells that have text or a result */
  private readonly cells = new Map<string, TypedCell>();
  private reached = 0;
  /** Typed ahead of what has played: drawn grey after the last played character, under the text still to come */
  private ghostKey = '';
  private ghostText = '';

  /** The cell of a displayed character. */
  cell(key: string): TypedCell {
    return this.cells.get(key) ?? { text: '', result: null };
  }

  /** The displayed characters that have a cell. */
  cellKeys(): Set<string> {
    return new Set(this.cells.keys());
  }

  /** Add the slots of the next piece of the book: their characters and where each sits. */
  addSlots(chars: string, positions: EbookPosition[]): void {
    for (let i = 0; i < chars.length; i++) {
      const gap = chars[i] === ' ' && this.keys.length > 0;
      this.keys.push(gap ? this.gapKey(this.keys[this.keys.length - 1]) : typedKey(positions[i]));
    }
    this.chars += chars;
  }

  private gapKey(key: string): string {
    return key.endsWith('g') ? key : key + 'g';
  }

  /** The character of the last slot ('' when there are none). */
  get lastChar(): string {
    return this.chars.slice(-1);
  }

  /** How many slots there are so far. */
  get slotCount(): number {
    return this.chars.length;
  }

  /** Forget everything; returns the displayed characters that had a cell, so they can be cleared. */
  reset(): string[] {
    const old = [...this.cells.keys()];
    this.chars = '';
    this.keys = [];
    this.cells.clear();
    this.placer.reset();
    this.reached = 0;
    this.ghostKey = '';
    this.ghostText = '';
    return old;
  }

  /** The feedback for the slots that have played, for a score: a place nobody typed under is missed. */
  feedback(played: number): PracticeFeedback[] {
    const out: PracticeFeedback[] = [];
    for (let s = 0; s < Math.min(played, this.chars.length); s++) {
      const typed = this.placer.first(s);
      out.push({
        ref: this.chars[s],
        result: typed === '' ? 'missed' : typed === this.chars[s] ? 'correct' : 'incorrect',
      });
    }
    return out;
  }

  /**
   * Line the typed text up with the first `played` slots. Returns the displayed characters whose cell changed.
   */
  update(typed: string, played: number): string[] {
    const hi = Math.min(played, this.chars.length);
    const before = this.reached;
    const dirty = new Set(this.placer.update(this.chars, hi, typed));
    this.reached = this.placer.reached;
    // The places between the old and the new reach changed from "not reached" to missed or back
    for (let s = Math.min(before, this.reached); s < Math.max(before, this.reached); s++) dirty.add(s);

    const changed: string[] = [];
    const done = new Set<string>();
    for (const slot of dirty) {
      const key = this.keys[slot];
      if (key === undefined || done.has(key)) continue;
      done.add(key);
      let start = slot;
      while (start > 0 && slot - start < SHARED_SLOTS && this.keys[start - 1] === key) start--;
      let text = '';
      let result: Result | null = null;
      for (let s = start; s < this.keys.length && s <= slot + SHARED_SLOTS && this.keys[s] === key; s++) {
        text += this.placer.text(s);
        // A gap is drawn beside the character before it and has no colour of its own
        if (!key.endsWith('g')) result = worse(result, this.placer.result(s));
      }
      const old = this.cells.get(key);
      if ((old?.text ?? '') === text && (old?.result ?? null) === result) continue;
      if (text || result) this.cells.set(key, { text, result });
      else this.cells.delete(key);
      changed.push(key);
    }

    // Characters typed before they have played have no place yet: they are shown grey after the last played character
    const ghostText = hi > 0 ? this.placer.pending : '';
    const ghostKey = ghostText ? this.keys[hi - 1] + 'p' : '';
    if (this.ghostKey && this.ghostKey !== ghostKey) {
      this.cells.delete(this.ghostKey);
      changed.push(this.ghostKey);
    }
    if (ghostKey && (ghostKey !== this.ghostKey || ghostText !== this.ghostText)) {
      this.cells.set(ghostKey, { text: ghostText, result: null });
      changed.push(ghostKey);
    }
    this.ghostKey = ghostKey;
    this.ghostText = ghostText;
    return changed;
  }
}

/** The result of a displayed character made of several slots: a mistake outweighs a miss, a miss a right answer. */
function worse(a: Result | null, b: Result | null): Result | null {
  const rank = { correct: 1, missed: 2, incorrect: 3 };
  if (!a) return b;
  if (!b) return a;
  return rank[b] > rank[a] ? b : a;
}
