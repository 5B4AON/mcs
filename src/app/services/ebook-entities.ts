/**
 * Morse Code Studio
 */

/** The HTML entities books and READMEs use most; the browser's own decoder is not available to the parsers. */
const NAMED: Record<string, string> = {
  nbsp: '\u00A0', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', middot: '\u00B7', bull: '\u2022',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', laquo: '\u00AB', raquo: '\u00BB',
  copy: '\u00A9', reg: '\u00AE', trade: '\u2122', deg: '\u00B0', times: '\u00D7', ensp: ' ', emsp: ' ', thinsp: ' ',
};

/**
 * Turn HTML entities in a line of text into their characters (`&nbsp;` into a space, `&amp;` into `&`,
 * `&#233;` and `&#xE9;` into é). Markdown files carry them for GitHub and the like; an entity that is
 * not known is left as it is.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}
