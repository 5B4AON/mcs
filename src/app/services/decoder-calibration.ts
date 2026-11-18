/**
 * Morse Code Studio
 */

/** Typical dit and dah lengths (ms) the decoder uses to tell a dit from a dah. */
export interface DitDah {
  dit: number;
  dah: number;
}

/** Key-down times shorter than this are contact bounce, not elements. */
export const MIN_ELEMENT_MS = 10;

/**
 * Key-down times longer than this (a dah of about 3 WPM) are somebody holding the key or leaning on it.
 * They still read as a dah but never teach the decoder anything.
 */
export const MAX_ELEMENT_MS = 1200;

/** How many of the latest key-down times the decoder looks at. */
export const ELEMENT_WINDOW = 16;

/** A key-down that is this far off both the dit and the dah length (and the same for the three before it) starts the picture over. */
const MISFIT_RATIO = 1.9;
const MISFIT_COUNT = 4;

/** What a believable split between dits and dahs looks like: dahs 1.6 to 5.5 times a dit, with a real gap between them. */
const MIN_RATIO = 1.6;
const MAX_RATIO = 5.5;
const MIN_HOLE = 1.25;

function median(sorted: readonly number[], from: number, to: number): number {
  const count = to - from;
  const mid = from + Math.floor(count / 2);
  return count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Find the dit and dah lengths in the latest key-down times.
 *
 * The times are split into a short and a long group wherever the best believable gap lies, so the answer
 * comes from what was keyed lately and not from what the decoder believed before: a wrong belief (the
 * threshold left too high or too low by a long hold, or by a change of speed) cannot keep itself alive,
 * because every new element is judged on the evidence of all the recent ones. A group needs two members
 * once there are six elements, so a single odd press never forms a group, and each group is taken at its
 * median. With no believable gap the elements are all the same kind (all dits, or all dahs); which kind
 * is judged from the previous answer, and an in-between value leaves that answer alone.
 */
export function analyseElements(samples: readonly number[], prior: DitDah): DitDah {
  const n = samples.length;
  if (n === 0) return prior;
  const s = [...samples].sort((a, b) => a - b);

  const sum = [0];
  const sumSq = [0];
  for (const v of s) {
    const l = Math.log(v);
    sum.push(sum[sum.length - 1] + l);
    sumSq.push(sumSq[sumSq.length - 1] + l * l);
  }
  const spread = (a: number, b: number): number => {
    const count = b - a;
    const mean = (sum[b] - sum[a]) / count;
    return (sumSq[b] - sumSq[a]) - count * mean * mean;
  };

  const minGroup = n >= 6 ? 2 : 1;
  let bestSplit = -1;
  let bestCost = Infinity;
  for (let k = minGroup; k <= n - minGroup; k++) {
    const ratio = median(s, k, n) / median(s, 0, k);
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
    if (s[k] / s[k - 1] < MIN_HOLE) continue;
    const cost = spread(0, k) + spread(k, n);
    if (cost < bestCost) {
      bestCost = cost;
      bestSplit = k;
    }
  }
  if (bestSplit > 0) {
    return { dit: median(s, 0, bestSplit), dah: median(s, bestSplit, n) };
  }

  const m = median(s, 0, n);
  if (m >= prior.dit * 0.65 && m <= prior.dit * 1.5) return { dit: m, dah: m * 3 };
  if (m >= prior.dah * 0.65 && m <= prior.dah * 1.5) return { dit: m / 3, dah: m };
  if (m < prior.dit * 0.65) return { dit: m, dah: m * 3 };
  if (m > prior.dah * 1.5) return { dit: m / 3, dah: m };
  return prior;
}

/** The dit length (ms) behind a dit/dah pair: the dit itself and a third of the dah, averaged. */
export function unitFromDitDah(est: DitDah): number {
  return (est.dit + est.dah / 3) / 2;
}

/**
 * Add one key-down time to the window. Returns the window to keep: normally the latest ELEMENT_WINDOW times,
 * but when the last MISFIT_COUNT key-downs all lie far from both the dit and the dah length (the sender changed
 * speed a lot) the older ones are forgotten at once, so the decoder follows the new speed after a few elements
 * instead of waiting for the old ones to scroll out.
 */
export function pushElement(samples: readonly number[], duration: number, current: DitDah): number[] {
  const next = [...samples, duration];
  if (next.length > ELEMENT_WINDOW) next.shift();
  if (next.length > MISFIT_COUNT) {
    const misfit = (d: number): boolean => {
      const off = Math.min(Math.abs(Math.log(d / current.dit)), Math.abs(Math.log(d / current.dah)));
      return off > Math.log(MISFIT_RATIO);
    };
    if (next.slice(-MISFIT_COUNT).every(misfit)) return next.slice(-MISFIT_COUNT);
  }
  return next;
}
