/**
 * Morse Code Studio
 */

/** Result of one prompt character: keyed right, keyed as something else, skipped, or not reached yet */
export type SendRefMark = 'correct' | 'incorrect' | 'missed' | 'pending';

/** Result of one keyed character: it matched a prompt character, or was wrong or a repeat */
export type SendKeyedMark = 'correct' | 'incorrect';

/** How the keyed characters line up with the prompt. */
export interface SendAlignment {
  /**
   * How far into the prompt the keying has got: the number of prompt characters
   * consumed. The next character to key is the one at this index.
   */
  position: number;
  /** One result per prompt character; characters from `position` on are 'pending' */
  ref: SendRefMark[];
  /** One result per keyed character */
  keyed: SendKeyedMark[];
}

/**
 * Line the keyed characters up with the prompt, tolerating the mistakes people make
 * while keying: a wrong character, a character repeated until it comes out right, or
 * a skipped one. Mistakes need not be deleted; the alignment finds the cheapest way to
 * explain the keying (a wrong, extra or skipped character costs 1) and reads off where
 * the user is. The keyed characters may cover only the start of the prompt, so the
 * result is the best alignment of ALL keyed characters with a prefix of the prompt; of
 * equally cheap prefixes the longest wins, so a wrong attempt still moves on.
 *
 * Spaces are not part of either list (word gaps depend on timing, not on skill).
 */
export function alignKeying(ref: readonly string[], keyed: readonly string[]): SendAlignment {
  const n = ref.length;
  const m = keyed.length;
  // cost[i][j]: cheapest alignment of the first i prompt characters with the first j keyed ones
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i][0] = i;
  for (let j = 1; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + (ref[i - 1] === keyed[j - 1] ? 0 : 1),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      );
    }
  }

  let position = n;
  for (let i = n; i >= 0; i--) {
    if (cost[i][m] < cost[position][m]) position = i;
  }

  const refMarks: SendRefMark[] = new Array<SendRefMark>(n).fill('pending');
  const keyedMarks: SendKeyedMark[] = new Array<SendKeyedMark>(m).fill('incorrect');
  let i = position;
  let j = m;
  while (i > 0 || j > 0) {
    // On a tie, a repeated character counts as the extra one: the first attempt keeps its mark
    if (j > 0 && cost[i][j] === cost[i][j - 1] + 1) {
      keyedMarks[j - 1] = 'incorrect';
      j--;
    } else if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (ref[i - 1] === keyed[j - 1] ? 0 : 1)) {
      const same = ref[i - 1] === keyed[j - 1];
      refMarks[i - 1] = same ? 'correct' : 'incorrect';
      keyedMarks[j - 1] = same ? 'correct' : 'incorrect';
      i--;
      j--;
    } else {
      refMarks[i - 1] = 'missed';
      i--;
    }
  }
  return { position, ref: refMarks, keyed: keyedMarks };
}
