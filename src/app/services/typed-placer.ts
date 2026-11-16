/**
 * Morse Code Studio
 */

import { typedDisplay } from './practice-scoring';

/** A re-alignment needs this many typed characters in a row to fit one place exactly (more when it is far away). */
const SURE_NEAR = 3;
const SURE_FAR = 5;
/** How far from where the typing stands a re-alignment is looked for, with the number of characters that must fit */
const RANGE_NEAR = 6;
const RANGE_FAR = 60;

/**
 * Places what the learner types under the characters of the challenge while it plays, one typed character
 * under one challenge character, and keeps them together.
 *
 * Every typed character goes under the next free place, the one after the previous character. A wrong or
 * extra character therefore stays where it was typed and nothing jumps while the typing is still unclear.
 * Only when the last few typed characters (three, or five when the match is far away) all fit another place
 * exactly, and fit the place they are in at most once, are they moved there: a skipped character leaves
 * its place empty, and when the typing goes back (a repeated character), the extra characters it ran over
 * are dropped. Typing ahead of what has played waits (`pending`) until the challenge catches up.
 *
 * It works step by step, so a change costs only the characters that are new; deleting characters takes
 * them back, and an edit in the middle places everything after it again.
 */
export class TypedPlacer {
  private ref = '';
  private typed = '';
  /** The place of every processed typed character, -1 for one that was dropped */
  private placed: number[] = [];
  private cursor = 0;
  private bySlot = new Map<number, number[]>();
  /** The full typed text of the last update (upper case) */
  private latest = '';

  /** Forget everything. */
  reset(): void {
    this.ref = '';
    this.typed = '';
    this.placed = [];
    this.cursor = 0;
    this.bySlot.clear();
    this.latest = '';
  }

  /** Typed characters waiting for the challenge to play the place they belong to. */
  get pending(): string {
    return this.latest.slice(this.placed.length);
  }

  /** The first place nothing has been typed for yet; every place before it was typed under or skipped. */
  get reached(): number {
    return this.cursor;
  }

  /** How the typing under a place compares so far: null for places not reached yet. */
  result(slot: number): 'correct' | 'incorrect' | 'missed' | null {
    if (slot >= this.cursor) return null;
    const typed = this.first(slot);
    if (typed === '') return 'missed';
    return typed === this.ref[slot] ? 'correct' : 'incorrect';
  }

  /** The places that have typed text now. */
  slots(): number[] {
    return [...this.bySlot.keys()];
  }

  /** The typed characters under a place, as they are drawn. */
  text(slot: number): string {
    const indices = this.bySlot.get(slot);
    return indices ? typedDisplay(indices.map(i => this.typed[i]).join(''), this.ref[slot] ?? '') : '';
  }

  /** The first typed character under a place ('' when none). */
  first(slot: number): string {
    const indices = this.bySlot.get(slot);
    return indices ? this.typed[indices[0]] : '';
  }

  /**
   * Bring the placing up to date: `ref` is the challenge (it may have grown), `played` how many of its characters have
   * played, `typed` everything typed. Returns the places whose text changed.
   */
  update(ref: string, played: number, typed: string): number[] {
    const dirty = new Set<number>();
    this.ref = ref;
    const text = typed.toUpperCase();
    this.latest = text;

    // Deleted or edited characters take the places of those and everything after them back
    let common = 0;
    const limit = Math.min(this.typed.length, text.length);
    while (common < limit && this.typed[common] === text[common]) common++;
    if (common < this.typed.length) this.truncate(common, dirty);

    while (this.placed.length < text.length && this.cursor < played) {
      const i = this.placed.length;
      this.typed += text[i];
      this.put(i, this.cursor, dirty);
      this.cursor++;
      this.realign(i, played, dirty);
    }
    return [...dirty];
  }

  private put(i: number, slot: number, dirty: Set<number>): void {
    this.placed[i] = slot;
    const list = this.bySlot.get(slot);
    if (list) list.push(i);
    else this.bySlot.set(slot, [i]);
    dirty.add(slot);
  }

  private take(i: number, dirty: Set<number>): void {
    const slot = this.placed[i];
    if (slot < 0) return;
    const list = this.bySlot.get(slot);
    if (list) {
      const at = list.indexOf(i);
      if (at >= 0) list.splice(at, 1);
      if (!list.length) this.bySlot.delete(slot);
    }
    dirty.add(slot);
  }

  private truncate(count: number, dirty: Set<number>): void {
    for (let i = count; i < this.placed.length; i++) this.take(i, dirty);
    this.placed.length = count;
    this.typed = this.typed.slice(0, count);
    this.cursor = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (this.placed[i] >= 0) {
        this.cursor = this.placed[i] + 1;
        break;
      }
    }
  }

  /** Move the last few typed characters to another place, but only when they fit it exactly and hardly fit where they are. */
  private realign(last: number, played: number, dirty: Set<number>): void {
    for (const count of [SURE_NEAR, SURE_FAR]) {
      const first = last - count + 1;
      if (first < 0) continue;
      const start = this.placed[first];
      if (start < 0) continue;
      let together = true;
      let fits = 0;
      for (let k = 0; k < count; k++) {
        if (this.placed[first + k] !== start + k) together = false;
        if (this.ref[start + k] === this.typed[first + k]) fits++;
      }
      if (!together || fits > count - 2) continue;

      const range = count === SURE_NEAR ? RANGE_NEAR : RANGE_FAR;
      for (let distance = 1; distance <= range; distance++) {
        for (const target of [start + distance, start - distance]) {
          if (target < 0 || target + count > played) continue;
          let exact = true;
          for (let k = 0; k < count && exact; k++) exact = this.ref[target + k] === this.typed[first + k];
          if (!exact) continue;
          this.move(first, count, target, dirty);
          return;
        }
      }
    }
  }

  private move(first: number, count: number, target: number, dirty: Set<number>): void {
    for (let k = 0; k < count; k++) this.take(first + k, dirty);
    // Going back over places that are taken: the characters that ran over them were extra
    for (let i = first - 1; i >= 0; i--) {
      if (this.placed[i] < 0) continue;
      if (this.placed[i] < target) break;
      this.take(i, dirty);
      this.placed[i] = -1;
    }
    for (let k = 0; k < count; k++) this.put(first + k, target + k, dirty);
    this.cursor = target + count;
  }
}
