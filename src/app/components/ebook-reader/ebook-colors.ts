/**
 * Morse Code Studio
 */

/** The colours the reader needs on top of the text colour: the current character and its highlight (played text takes the full screen's TX colour). */
export interface EbookReaderColors {
  current: string;
  currentBackground: string;
}

/** Whether a `#rgb` or `#rrggbb` colour is light (anything else counts as dark, like the full screen's default). */
export function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

/** Colours that stay readable on the given background. */
export function ebookReaderColors(background: string): EbookReaderColors {
  return isLightColor(background)
    ? { current: '#111', currentBackground: 'rgba(255, 190, 0, .65)' }
    : { current: '#000', currentBackground: 'rgba(255, 205, 60, .9)' };
}
