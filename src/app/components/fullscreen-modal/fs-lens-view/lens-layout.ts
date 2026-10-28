/**
 * Morse Code Studio
 */

/** Width in units of the longest ordinary character (five dashes plus four gaps). */
export const LENS_MIN_UNITS = 19;

/** One symbol, in units where a dot is 1 wide, a dash 3 wide and the gap between symbols 1. */
export interface LensElement {
  kind: 'dot' | 'dash';
  x: number;
  width: number;
}

/** Positions of the revealed symbols inside an SVG that is `viewWidth` units wide and 1 unit high. */
export interface LensGeometry {
  viewWidth: number;
  elements: LensElement[];
}

/** Total width of a pattern in units, including the gaps between its symbols. */
export function patternUnits(pattern: string): number {
  let units = 0;
  for (const c of pattern) units += c === '-' ? 3 : 1;
  return pattern.length > 0 ? units + pattern.length - 1 : 0;
}

/**
 * Lay out the revealed symbols. The group is centred as if the `planned`
 * pattern were fully shown, so a sent character does not shift while it
 * grows. The view is never narrower than five dashes, so every ordinary
 * character is drawn at the same size; longer patterns such as `<SOS>`
 * widen it and are scaled down by the caller.
 */
export function layoutPattern(revealed: string, planned: string = revealed): LensGeometry {
  const total = Math.max(patternUnits(planned), patternUnits(revealed));
  const viewWidth = Math.max(LENS_MIN_UNITS, total);
  let x = (viewWidth - total) / 2;
  const elements: LensElement[] = [];
  for (const c of revealed) {
    const width = c === '-' ? 3 : 1;
    elements.push({ kind: c === '-' ? 'dash' : 'dot', x, width });
    x += width + 1;
  }
  return { viewWidth, elements };
}

/** Spoken form of a pattern for screen readers, for example `dash dot dash`. */
export function patternWords(pattern: string): string {
  return [...pattern].map(c => (c === '-' ? 'dash' : 'dot')).join(' ');
}
