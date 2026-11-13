/**
 * Morse Code Studio
 */

import { EbookBlock, EbookBlockKind, EbookBlockSource } from './ebook-model';

/** The largest block the parsers hand out; longer paragraphs are cut at a sentence end. */
const MAX_BLOCK_CHARS = 2500;

/** The largest file the formats that cannot be read piece by piece (HTML) may have. */
export const EBOOK_MAX_WHOLE_FILE_BYTES = 20 * 1024 * 1024;

const GUTENBERG_START = /^\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG/i;
const GUTENBERG_END = /^\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG/i;
const GUTENBERG_SCAN_LINES = 150;
const LIST_MARKER = /^(\s*)([-*+\u2022]|\d{1,3}[.)])\s+(.*)$/;
const CHAPTER_WORD = /^(chapter|book|part|prologue|epilogue|preface|introduction|contents)\b/i;

// ---- Reading text from a stream ----

/**
 * Decode a byte stream as text, piece by piece. UTF-8 is used unless the first piece is not valid
 * UTF-8 (then Windows-1252, the usual encoding of old text files); a UTF-16 byte order mark is honoured.
 */
export async function* decodeStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  let decoder: TextDecoder | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!decoder) decoder = pickDecoder(value);
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder?.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function pickDecoder(first: Uint8Array): TextDecoder {
  if (first[0] === 0xFF && first[1] === 0xFE) return new TextDecoder('utf-16le');
  if (first[0] === 0xFE && first[1] === 0xFF) return new TextDecoder('utf-16be');
  try {
    // The piece may end inside a multi-byte character: only the part that ends cleanly is checked
    new TextDecoder('utf-8', { fatal: true }).decode(first, { stream: true });
    return new TextDecoder('utf-8');
  } catch {
    return new TextDecoder('windows-1252');
  }
}

/** Split decoded text into lines (any line ending), keeping a half-read last line for the next piece. */
export async function* decodeLines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buf = '';
  for await (const chunk of chunks) {
    buf += chunk;
    // A CR at the very end may be the first half of a CRLF
    const hold = buf.endsWith('\r') ? 1 : 0;
    const parts = buf.slice(0, buf.length - hold).split(/\r\n|\r|\n/);
    buf = parts.pop() + (hold ? '\r' : '');
    for (const line of parts) yield line;
  }
  for (const line of buf.split(/\r\n|\r|\n/)) yield line;
}

/** Drop the licence text round a Project Gutenberg book (only when its start marker shows up in the first lines). */
async function* withoutGutenbergFrame(lines: AsyncIterable<string>): AsyncGenerator<string> {
  const head: string[] = [];
  let scanning = true;
  for await (const line of lines) {
    if (scanning) {
      if (GUTENBERG_START.test(line.trim())) {
        head.length = 0;
        scanning = false;
        continue;
      }
      head.push(line);
      if (head.length < GUTENBERG_SCAN_LINES) continue;
      scanning = false;
      for (const held of head) yield held;
      head.length = 0;
      continue;
    }
    if (GUTENBERG_END.test(line.trim())) return;
    yield line;
  }
  for (const held of head) yield held;
}

// ---- Text and Markdown ----

/** Cut a very long paragraph at sentence ends so blocks stay small. */
function* splitLong(text: string, kind: EbookBlockKind): Generator<EbookBlock> {
  let rest = text;
  let continued = false;
  while (rest.length > MAX_BLOCK_CHARS) {
    let cut = rest.lastIndexOf('. ', MAX_BLOCK_CHARS);
    if (cut < MAX_BLOCK_CHARS / 2) cut = rest.lastIndexOf(' ', MAX_BLOCK_CHARS);
    if (cut <= 0) cut = MAX_BLOCK_CHARS;
    else cut += 1;
    yield continued ? { kind, text: rest.slice(0, cut).trim(), continued } : { kind, text: rest.slice(0, cut).trim() };
    rest = rest.slice(cut).trim();
    continued = true;
  }
  if (rest) yield continued ? { kind, text: rest, continued } : { kind, text: rest };
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (CHAPTER_WORD.test(t)) return true;
  // THE END, A SCANDAL IN BOHEMIA: only capitals, and not a sentence
  return /[A-Z]/.test(t) && t === t.toUpperCase() && !/[.,;:]$/.test(t);
}

/** Remove Markdown marks from a line of text, keeping the words. */
function stripMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:|mailto:)[^>]*>/gi, '')
    .replace(/<\/?[a-zA-Z!][^>]*>/g, '')
    .replace(/(\*\*|~~|`)/g, '')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/(^|\W)_+([^_]+?)_+(?=\W|$)/g, '$1$2');
}

/**
 * Turn the lines of a text or Markdown file into blocks. Paragraphs end at blank lines and their
 * hard-wrapped lines are joined with spaces. In plain text a short line of capitals or one that
 * starts with "Chapter" is a heading; in Markdown `#` lines are.
 */
export async function* textBlocks(lines: AsyncIterable<string>, markdown: boolean): AsyncGenerator<EbookBlock> {
  let parts: string[] = [];
  let kind: EbookBlockKind = 'p';
  let fenced = false;

  function* flush(): Generator<EbookBlock> {
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    const single = parts.length === 1;
    parts = [];
    const was = kind;
    kind = 'p';
    if (!text) return;
    if (!markdown && was === 'p' && single && looksLikeHeading(text)) {
      yield { kind: 'h', text, ...(CHAPTER_WORD.test(text) ? { chapterStart: true } : {}) };
      return;
    }
    yield* splitLong(text, was);
  }

  for await (const raw of withoutGutenbergFrame(lines)) {
    if (markdown && /^\s*(```|~~~)/.test(raw)) {
      yield* flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const trimmed = raw.trim();
    if (!trimmed) {
      yield* flush();
      continue;
    }
    if (markdown) {
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(trimmed);
      if (heading) {
        yield* flush();
        const text = stripMarkdown(heading[2]).trim();
        if (text) yield { kind: 'h', text, ...(heading[1].length <= 2 ? { chapterStart: true } : {}) };
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,}|={3,})$/.test(trimmed)) {
        yield* flush();
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(trimmed);
      if (quote) {
        if (kind !== 'quote') yield* flush();
        kind = 'quote';
        parts.push(stripMarkdown(quote[1]));
        continue;
      }
    }

    const item = LIST_MARKER.exec(raw);
    // A marker only starts a list item at the start of a block (or markdown, where a list may follow text),
    // so a wrapped line that starts with "1914. " is not taken for one
    if (item && (parts.length === 0 || kind === 'li' || markdown)) {
      yield* flush();
      kind = 'li';
      parts.push(markdown ? stripMarkdown(item[3]) : item[3]);
      continue;
    }
    if (kind === 'li' && !/^\s/.test(raw)) yield* flush();
    if (kind === 'quote') yield* flush();
    parts.push(markdown ? stripMarkdown(trimmed) : trimmed);
  }
  yield* flush();
}

// ---- HTML ----

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'HEAD', 'TEMPLATE', 'IFRAME', 'NAV', 'SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'SUP']);
const BLOCKS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'UL', 'OL', 'DL', 'DT', 'DD', 'TABLE', 'TR',
  'FIGURE', 'FIGCAPTION', 'PRE', 'HR', 'ADDRESS', 'BODY', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE',
]);

/**
 * The blocks of an HTML page or EPUB chapter: headings, paragraphs, list items and quotes in reading
 * order, `<br>` as a real line break, scripts, styles, navigation and footnote marks left out.
 * `chapterStart` marks the first block as the start of a chapter.
 */
export function htmlToBlocks(html: string, chapterStart = false): EbookBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: EbookBlock[] = [];
  let cur = '';
  let pre = false;

  const flush = (kind: EbookBlockKind): void => {
    const text = cur.replace(/[ \t\f\v]*\n[ \t\f\v\n]*/g, '\n').replace(/[ \t\f\v]+/g, ' ').trim();
    cur = '';
    if (!text) return;
    out.push(...splitLong(text, kind));
  };

  const walk = (node: Node, kind: EbookBlockKind): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      cur += pre ? text : text.replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIPPED.has(tag) || el.hasAttribute('hidden')) return;
    if (tag === 'BR') {
      cur += '\n';
      return;
    }
    if (!BLOCKS.has(tag)) {
      for (const child of Array.from(el.childNodes)) walk(child, kind);
      return;
    }
    flush(kind);
    const inner: EbookBlockKind = /^H[1-6]$/.test(tag) ? 'h' : tag === 'LI' ? 'li' : tag === 'BLOCKQUOTE' ? 'quote' : kind;
    const wasPre = pre;
    if (tag === 'PRE') pre = true;
    const before = out.length;
    for (const child of Array.from(el.childNodes)) walk(child, inner);
    flush(inner);
    pre = wasPre;
    // A big heading opens a chapter
    if ((tag === 'H1' || tag === 'H2') && out.length > before) out[before].chapterStart = true;
  };

  walk(doc.body ?? doc.documentElement, 'p');
  flush('p');
  if (chapterStart && out.length > 0) out[0] = { ...out[0], chapterStart: true };
  return out;
}

// ---- Entry points ----

/** The formats of a file that are read in this module (EPUB has its own reader). */
export type EbookTextFormat = 'text' | 'markdown' | 'html';

/** Which text format a file name or MIME type is, or null if it is not one of them. */
export function ebookTextFormat(name: string, mime = ''): EbookTextFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (['md', 'markdown'].includes(ext) || mime === 'text/markdown') return 'markdown';
  if (['html', 'htm', 'xhtml'].includes(ext) || mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (['txt', 'text', ''].includes(ext) || mime === 'text/plain') return 'text';
  return null;
}

/**
 * Blocks of a text, Markdown or HTML byte stream. Text and Markdown are read piece by piece; HTML needs
 * the whole page and refuses a file bigger than `EBOOK_MAX_WHOLE_FILE_BYTES`.
 */
export function blocksFromStream(stream: ReadableStream<Uint8Array>, format: EbookTextFormat): EbookBlockSource {
  if (format === 'html') {
    return (async function* () {
      let html = '';
      for await (const chunk of decodeStream(stream)) {
        html += chunk;
        if (html.length > EBOOK_MAX_WHOLE_FILE_BYTES) throw new Error('This page is too large to load.');
      }
      yield* htmlToBlocks(html);
    })();
  }
  return textBlocks(decodeLines(decodeStream(stream)), format === 'markdown');
}
