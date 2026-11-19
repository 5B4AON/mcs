/**
 * Morse Code Studio
 */

import type { PaddleMode } from './settings-common';

/** One contact of the simulated paddle opening or closing, `at` ms after the character starts. */
export interface PaddleContactStep {
  at: number;
  side: 'dit' | 'dah';
  down: boolean;
}

/** Element and gap lengths in ms (`timingsFromWpm()` shaped, only these three are used). */
export interface PaddleTimings {
  dit: number;
  dah: number;
  intraChar: number;
}

type Side = 'dit' | 'dah';

interface Interval {
  side: Side;
  press: number;
  release: number;
}

const other = (side: Side): Side => (side === 'dit' ? 'dah' : 'dit');

/**
 * Plays the contacts into a keyer that follows the real rules of `mode` and returns the dots and dashes it
 * would send. Used to check a plan before it is shown; it never touches the app's own keyer.
 *
 *  - **Iambic A**: at the end of each element (after its gap) the contacts are sampled. The opposite
 *    contact wins (so a squeeze alternates); otherwise the same one repeats; with nothing closed it stops.
 *    Nothing is remembered.
 *  - **Iambic B**: as A, but the opposite contact being closed at any time during the element is
 *    remembered, so releasing a squeeze still sends one more, opposite element.
 *  - **Ultimatic**: the contact pressed last wins while both are closed; no memory.
 *  - **Single lever**: one contact at a time (both closed counts as a mistake of the plan); no memory.
 */
export function simulatePaddleKeyer(mode: PaddleMode, steps: PaddleContactStep[], timings: PaddleTimings): {
  morse: string;
  valid: boolean;
} {
  const events = [...steps].sort((a, b) => a.at - b.at || Number(a.down) - Number(b.down));
  const down: Record<Side, boolean> = { dit: false, dah: false };
  const pressedAt: Record<Side, number> = { dit: -1, dah: -1 };
  let valid = true;
  let next = 0;

  /** Apply every event up to and including `time` */
  const advance = (time: number, onPress?: (side: Side) => void): void => {
    while (next < events.length && events[next].at <= time) {
      const e = events[next++];
      down[e.side] = e.down;
      if (e.down) {
        pressedAt[e.side] = e.at;
        onPress?.(e.side);
      }
      if (mode === 'single-lever' && down.dit && down.dah) valid = false;
    }
  };

  const first = events.find(e => e.down);
  if (!first) return { morse: '', valid: true };
  let t = first.at;
  advance(t);
  let current: Side = down.dit ? 'dit' : 'dah';
  let morse = '';

  for (let guard = 0; guard < 64; guard++) {
    morse += current === 'dit' ? '.' : '-';
    const elementEnd = t + (current === 'dit' ? timings.dit : timings.dah);
    const pick = elementEnd + timings.intraChar;
    const opposite = other(current);
    // The opposite contact may already be closed when the element starts
    let latched = down[opposite];
    advance(pick - 1e-6, side => { if (side === opposite) latched = true; });
    advance(pick);

    let chosen: Side | null = null;
    if (mode === 'iambic-a') {
      chosen = down[opposite] ? opposite : down[current] ? current : null;
    } else if (mode === 'iambic-b') {
      chosen = down[opposite] || latched ? opposite : down[current] ? current : null;
    } else if (down.dit && down.dah) {
      chosen = pressedAt.dit > pressedAt.dah ? 'dit' : 'dah';
    } else {
      chosen = down.dit ? 'dit' : down.dah ? 'dah' : null;
    }
    if (!chosen) break;
    current = chosen;
    t = pick;
  }

  // Contacts pressed after the keyer stopped would start a new, mistimed element
  if (events.slice(next).some(e => e.down)) valid = false;
  return { morse, valid };
}

/**
 * Works out how a person would work the paddles to send one character in `mode`, so the animated paddle
 * follows the rules of the keyer instead of showing two unrelated keys.
 *
 *  - A run of the same element keeps its paddle closed through the gaps, as a hand does.
 *  - Changing paddle overlaps the two: the next paddle is closed while the old one is still down, and the
 *    first one always leads, by a lead that grows with the dot length (a person needs about 50–140 ms
 *    between two fingers, never less than a visible 50 ms). Single lever never closes both: the lever swings.
 *    Ultimatic keeps the old paddle down into the next element, because the last paddle pressed wins.
 *  - A character that alternates all the way (C, K, R, …) is a held squeeze in Iambic A and B. In A both
 *    paddles are let go during the last element; in B during the one before it, because B adds the final
 *    element by itself.
 *
 * Every plan is played through `simulatePaddleKeyer()` first and the next idea is tried when it would not
 * send the same dots and dashes, so what is drawn is what that keyer really does.
 */
export function planPaddleContacts(morse: string, mode: PaddleMode, timings: PaddleTimings): PaddleContactStep[] {
  const n = morse.length;
  if (n === 0) return [];
  const sides: Side[] = Array.from(morse, c => (c === '.' ? 'dit' : 'dah'));
  const dur = sides.map(s => (s === 'dit' ? timings.dit : timings.dah));
  const gap = timings.intraChar;
  const start: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    start.push(t);
    t += dur[i] + gap;
  }
  const end = (i: number) => start[i] + dur[i];
  const window = (i: number) => dur[i] + gap;
  const lead = Math.min(Math.max(timings.dit * 0.6, 50), 140);
  const fullyAlternating = n >= 3 && sides.every((s, i) => i === 0 || s !== sides[i - 1]);

  const toSteps = (intervals: Interval[]): PaddleContactStep[] =>
    intervals.flatMap(iv => [
      { at: iv.press, side: iv.side, down: true },
      { at: iv.release, side: iv.side, down: false },
    ]).sort((a, b) => a.at - b.at || Number(a.down) - Number(b.down));

  /** Runs of one paddle, each handed over to the next in the given style */
  const swaps = (style: 'overlap' | 'ultimatic' | 'lever'): Interval[] => {
    const runs: { side: Side; first: number; last: number }[] = [];
    sides.forEach((side, i) => {
      const run = runs[runs.length - 1];
      if (run && run.side === side) run.last = i;
      else runs.push({ side, first: i, last: i });
    });
    const intervals: Interval[] = [];
    // Presses and releases at a hand-over are filled in below
    runs.forEach(run => intervals.push({ side: run.side, press: 0, release: end(run.last) + gap * 0.2 }));
    for (let j = 1; j < runs.length; j++) {
      const e = runs[j - 1].last;
      const w = window(e);
      const prev = intervals[j - 1];
      const cur = intervals[j];
      if (style === 'overlap') {
        cur.press = start[e] + w * 0.45;
        prev.release = cur.press + Math.min(lead, w * 0.3);
      } else if (style === 'ultimatic') {
        cur.press = start[e] + w * 0.55;
        prev.release = start[e + 1] + dur[e + 1] * 0.25;
      } else {
        prev.release = end(e) + gap * 0.15;
        cur.press = end(e) + gap * 0.55;
      }
    }
    return intervals;
  };

  /** All the way alternating: both paddles held, the first one leading by `lead` */
  const squeeze = (releaseEarly: boolean): Interval[] => {
    const leader = sides[0];
    const followerPress = Math.min(lead, window(0) * 0.8);
    const lastIdx = n - 1;
    // A lets go during the last element; B during the one before it (it then adds the last one itself)
    const k = releaseEarly ? lastIdx - 1 : lastIdx;
    const first = start[k] + dur[k] * 0.35;
    const second = Math.min(first + lead * 0.7, end(k) + gap * 0.5);
    const needed = sides[lastIdx];
    // The paddle that must not be closed during the last element goes first, the other one after it
    const firstToGo: Side = other(needed);
    const releases: Record<Side, number> = {
      [firstToGo]: first, [other(firstToGo)]: Math.max(second, first + 1),
    } as Record<Side, number>;
    return [
      { side: leader, press: 0, release: releases[leader] },
      { side: other(leader), press: followerPress, release: releases[other(leader)] },
    ];
  };

  const candidates: (() => Interval[])[] = [];
  if (mode === 'iambic-a' || mode === 'iambic-b') {
    if (fullyAlternating) candidates.push(() => squeeze(mode === 'iambic-b'));
    candidates.push(() => swaps('overlap'));
  } else if (mode === 'ultimatic') {
    candidates.push(() => swaps('ultimatic'));
  }
  candidates.push(() => swaps('lever'));

  for (const candidate of candidates) {
    const steps = toSteps(candidate());
    const result = simulatePaddleKeyer(mode, steps, timings);
    if (result.valid && result.morse === morse) return steps;
  }
  // A plan that no mode rule can confirm is still better drawn than lost: the plain lever swing
  return toSteps(swaps('lever'));
}
