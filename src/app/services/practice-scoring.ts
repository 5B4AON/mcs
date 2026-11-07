/**
 * Morse Code Studio
 */

/** Per-character feedback entry after a round completes */
export interface PracticeFeedback {
  /** The reference character */
  ref: string;
  /** 'correct' | 'incorrect' | 'missed' */
  result: 'correct' | 'incorrect' | 'missed';
}

/**
 * Compute per-character feedback by aligning the typed or keyed text to the
 * reference text using longest common subsequence (LCS).
 * Spaces are treated as regular characters: the user must enter them to get
 * a correct match.
 */
export function computePracticeFeedback(reference: string, typed: string): PracticeFeedback[] {
  const ref = reference.toUpperCase();
  const usr = typed.toUpperCase();

  // Build LCS table
  const m = ref.length;
  const n = usr.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = ref[i - 1] === usr[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find which ref indices were matched by the LCS
  const matched = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (ref[i - 1] === usr[j - 1]) {
      matched.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Build per-character feedback:
  // Walk ref and user input in parallel. Matched chars are 'correct'.
  // Unmatched ref chars (skipped by user) are 'missed' (grey).
  // Chars where the user typed something wrong are 'incorrect' (red) —
  // detected when the user consumed input but ref wasn't matched.
  const result: PracticeFeedback[] = [];
  let userIdx = 0;
  for (let ri = 0; ri < m; ri++) {
    if (matched.has(ri)) {
      result.push({ ref: ref[ri], result: 'correct' });
      // Advance userIdx to the matching user char
      while (userIdx < n && usr[userIdx] !== ref[ri]) userIdx++;
      userIdx++;
    } else {
      // Check if user typed an incorrect char at this position
      // (user has remaining input that didn't match)
      if (userIdx < n && !isUpcomingMatch(usr, userIdx, ref, ri, matched)) {
        result.push({ ref: ref[ri], result: 'incorrect' });
        userIdx++;
      } else {
        result.push({ ref: ref[ri], result: 'missed' });
      }
    }
  }
  return result;
}

/** Accuracy percentage (correct / total reference chars, ignoring spaces) */
export function practiceAccuracy(feedback: PracticeFeedback[]): number {
  if (feedback.length === 0) return 0;
  const chars = feedback.filter(f => f.ref !== ' ');
  if (chars.length === 0) return 0;
  const correct = chars.filter(f => f.result === 'correct').length;
  return Math.round((correct / chars.length) * 100);
}

/**
 * Check if the user's next input char matches an upcoming ref char
 * that is in the LCS. If so, the current ref char was skipped (missed),
 * not incorrectly typed.
 */
function isUpcomingMatch(usr: string, userIdx: number, ref: string, refIdx: number, matched: Set<number>): boolean {
  // Look ahead in ref for the next matched char
  for (let ri = refIdx + 1; ri < ref.length; ri++) {
    if (matched.has(ri) && usr[userIdx] === ref[ri]) return true;
    if (matched.has(ri)) break; // next match is a different char
  }
  return false;
}
