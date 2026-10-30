/**
 * Morse Code Studio
 */

/**
 * Fonts offered for the fullscreen view. The ids are historical names kept so saved
 * settings, presets and exported files stay valid; they no longer match the fonts and
 * must not be renamed without a migration. A removed id (such as the former 'arial')
 * is rejected on import and falls back to the default for a stored profile.
 */
export type FullscreenFontId = 'courier' | 'times' | 'verdana' | 'code';

export interface FullscreenFont {
  id: FullscreenFontId;
  label: string;
  /**
   * CSS font-family stack: the bundled font first (self-hosted Fontsource woff2 files, OFL-1.1,
   * loaded lazily the first time the font is used), then a generic fallback shown until it loads.
   */
  stack: string;
}

/**
 * Faces chosen for reading single characters at a glance: a typewriter face, a heavy
 * screen serif, a sans designed so look-alike characters differ (0/O, 1/I/l), and a
 * monospace made for aircraft cockpit displays.
 */
export const FULLSCREEN_FONTS: readonly FullscreenFont[] = [
  { id: 'courier', label: 'Typewriter', stack: "'Courier Prime', 'Courier New', Courier, monospace" },
  { id: 'times', label: 'Classic', stack: "Merriweather, Georgia, 'Times New Roman', serif" },
  { id: 'verdana', label: 'Readable', stack: "'Atkinson Hyperlegible', Verdana, system-ui, sans-serif" },
  { id: 'code', label: 'Cockpit', stack: "'B612 Mono', Consolas, Menlo, 'DejaVu Sans Mono', monospace" },
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
