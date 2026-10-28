/**
 * Morse Code Studio
 */

/** Fonts offered for the fullscreen view; all are system fonts, so nothing is downloaded. */
export type FullscreenFontId = 'courier' | 'times' | 'arial' | 'verdana' | 'code';

export interface FullscreenFont {
  id: FullscreenFontId;
  label: string;
  /**
   * CSS font-family stack with a generic fallback for systems without the named font.
   * Linux equivalents are named explicitly because browsers there ignore the system's
   * non-metric-compatible substitutes (for example Verdana would otherwise become the
   * default sans, identical to Arial).
   */
  stack: string;
}

/**
 * Faces chosen for reading single characters at a glance: a typewriter face, a
 * classic serif, a clean sans, a wide sans with clearly different 0/O and 1/I/l,
 * and a coding face with a slashed or dotted zero.
 */
export const FULLSCREEN_FONTS: readonly FullscreenFont[] = [
  { id: 'courier', label: 'Typewriter (Courier)', stack: "'Courier New', Courier, 'Liberation Mono', monospace" },
  { id: 'times', label: 'Classic (Times)', stack: "'Times New Roman', Times, 'Liberation Serif', serif" },
  { id: 'arial', label: 'Clean (Arial)', stack: "Arial, Helvetica, 'Liberation Sans', sans-serif" },
  { id: 'verdana', label: 'Wide (Verdana)', stack: "Verdana, Geneva, 'DejaVu Sans', sans-serif" },
  { id: 'code', label: 'Code (Consolas)', stack: "Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace" },
];

export const DEFAULT_FULLSCREEN_FONT: FullscreenFontId = 'courier';

/** CSS font-family for a stored id; an unknown or missing id falls back to the default. */
export function fullscreenFontStack(id: string | undefined): string {
  return (FULLSCREEN_FONTS.find(f => f.id === id) ?? FULLSCREEN_FONTS[0]).stack;
}

/** True when the value is one of the offered font ids. */
export function isFullscreenFontId(value: unknown): value is FullscreenFontId {
  return FULLSCREEN_FONTS.some(f => f.id === value);
}
