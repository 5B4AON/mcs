/**
 * Morse Code Studio
 */

import { EbookBlock, EbookBlockKind, EbookBlockSource } from './ebook-model';
import { EBOOK_MAX_WHOLE_FILE_BYTES } from './ebook-limits';
import { decodeEntities } from './ebook-entities';
import type { ByteSource } from './ebook-sources';

/** The largest block the parsers hand out; longer paragraphs are cut at a sentence end. */
const MAX_BLOCK_CHARS = 2500;

const GUTENBERG_START = /^\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG/i;
const GUTENBERG_END = /^\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG/i;
const GUTENBERG_SCAN_LINES = 150;
/** How many lines are looked at for a blank line when reading starts in the middle of a file */
const ALIGN_SCAN_LINES = 300;
const LIST_MARKER = /^(\s*)([-*+\u2022]|\d{1,3}[.)])\s+(.*)$/;
const CHAPTER_WORD = /^(chapter|book|part|prologue|epilogue|preface|introduction|contents)\b/i;

// ---- Reading text from a stream ----

/** One line of a text file and where it starts in the file (bytes; see `EbookBlock.offset`). */
export interface TextLine {
  text: string;
  offset: number;
}

/**
 * How a file is encoded, from its first bytes: UTF-16 by its byte order mark, UTF-8 when those bytes are
 * valid UTF-8, otherwise Windows-1252 (the usual encoding of old text files).
 */
export function sniffEncoding(first: Uint8Array): string {
  if (first[0] === 0xFF && first[1] === 0xFE) return 'utf-16le';
  if (first[0] === 0xFE && first[1] === 0xFF) return 'utf-16be';
  try {
    // The piece may end inside a multi-byte character: only the part that ends cleanly is checked
    new TextDecoder('utf-8', { fatal: true }).decode(first, { stream: true });
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

/** The number of bytes a string takes in a UTF-8 file. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** How many bytes a string takes in a file of this encoding. */
export function byteLengthFor(label: string): (s: string) => number {
  if (label.startsWith('utf-16')) return s => s.length * 2;
  return label === 'utf-8' ? utf8Length : s => s.length;
}

/**
 * Decode a byte stream as text, piece by piece, with the encoding given or found from the first piece.
 * `skipContinuation` drops the bytes of a UTF-8 character cut in two by starting in the middle of a file.
 */
export async function* decodeStream(
  stream: ReadableStream<Uint8Array>,
  options: { label?: string; skipContinuation?: boolean; onLabel?: (label: string) => void } = {},
): AsyncGenerator<string> {
  const reader = stream.getReader();
  let decoder: TextDecoder | null = options.label ? new TextDecoder(options.label) : null;
  let first = true;
  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      let value = read.value;
      if (first) {
        first = false;
        if (options.skipContinuation) {
          let i = 0;
          while (i < value.length && (value[i] & 0xC0) === 0x80) i++;
          value = value.subarray(i);
        }
      }
      if (!decoder) {
        const found = sniffEncoding(value);
        options.onLabel?.(found);
        decoder = new TextDecoder(found);
      }
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder?.decode();
    if (tail) yield tail;
  } finally {
    // A stream that is abandoned (the window moved on) must not keep a download running
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Split decoded text into lines (any line ending), keeping a half-read last line for the next piece.
 * Each line carries its byte offset: `startOffset` plus the bytes of what came before it.
 */
export async function* decodeLines(
  chunks: AsyncIterable<string>,
  startOffset = 0,
  byteLength: (s: string) => number = utf8Length,
): AsyncGenerator<TextLine> {
  let buf = '';
  let offset = startOffset;
  const eol = /\r\n|\r|\n/g;
  const take = function* (final: boolean): Generator<TextLine> {
    let from = 0;
    eol.lastIndex = 0;
    for (let m = eol.exec(buf); m; m = eol.exec(buf)) {
      // A CR at the very end may be the first half of a CRLF
      if (!final && m[0] === '\r' && m.index + 1 === buf.length) break;
      const text = buf.slice(from, m.index);
      yield { text, offset };
      offset += byteLength(text) + byteLength(m[0]);
      from = m.index + m[0].length;
    }
    buf = buf.slice(from);
  };
  for await (const chunk of chunks) {
    buf += chunk;
    yield* take(false);
  }
  yield* take(true);
  if (buf) yield { text: buf, offset };
}

/**
 * Start at a paragraph when reading begins in the middle of a file: the first line is cut short, so it
 * is dropped, and so is everything up to the next blank line (when there is one in the next few lines).
 */
async function* fromParagraph(lines: AsyncIterable<TextLine>): AsyncGenerator<TextLine> {
  const held: TextLine[] = [];
  const it = lines[Symbol.asyncIterator]();
  for (let n = await it.next(); !n.done; n = await it.next()) {
    held.push(n.value);
    if (held.length >= ALIGN_SCAN_LINES) break;
  }
  const blank = held.findIndex((l, i) => i > 0 && !l.text.trim());
  for (const line of held.slice(blank > 0 ? blank + 1 : 1)) yield line;
  for (let n = await it.next(); !n.done; n = await it.next()) yield n.value;
}

/**
 * Drop the licence text round a Project Gutenberg book: everything up to its start marker (only when the
 * marker shows up in the first lines of the file) and from its end marker on.
 */
async function* withoutGutenbergFrame(lines: AsyncIterable<TextLine>, fromStart: boolean): AsyncGenerator<TextLine> {
  const head: TextLine[] = [];
  let scanning = fromStart;
  for await (const line of lines) {
    if (scanning) {
      if (GUTENBERG_START.test(line.text.trim())) {
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
    if (GUTENBERG_END.test(line.text.trim())) return;
    yield line;
  }
  for (const held of head) yield held;
}

// ---- Text and Markdown ----

/** Cut a very long paragraph at sentence ends so blocks stay small; `offset` is where the text starts in the book. */
function* splitLong(text: string, kind: EbookBlockKind, offset: number): Generator<EbookBlock> {
  let rest = text;
  let at = offset;
  let continued = false;
  while (rest.length > MAX_BLOCK_CHARS) {
    let cut = rest.lastIndexOf('. ', MAX_BLOCK_CHARS);
    if (cut < MAX_BLOCK_CHARS / 2) cut = rest.lastIndexOf(' ', MAX_BLOCK_CHARS);
    if (cut <= 0) cut = MAX_BLOCK_CHARS;
    else cut += 1;
    const head = rest.slice(0, cut).trim();
    yield continued ? { kind, text: head, continued, offset: at } : { kind, text: head, offset: at };
    at += cut;
    rest = rest.slice(cut).trim();
    continued = true;
  }
  if (rest) yield continued ? { kind, text: rest, continued, offset: at } : { kind, text: rest, offset: at };
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
    .replace(/(^|\W)_+([^_]+?)_+(?=\W|$)/g, '$1$2')
    // After the tags are gone, so a decoded < or > cannot make a tag
    .replace(/&[#a-z0-9]+;/gi, decodeEntities);
}

/**
 * Turn the lines of a text or Markdown file into blocks. Paragraphs end at blank lines and their
 * hard-wrapped lines are joined with spaces. In plain text a short line of capitals or one that
 * starts with "Chapter" is a heading; in Markdown `#` lines are.
 */
export async function* textBlocks(
  lines: AsyncIterable<TextLine>,
  markdown: boolean,
  mode: 'start' | 'aligned' | 'exact' = 'start',
): AsyncGenerator<EbookBlock> {
  let parts: string[] = [];
  let paraOffset = 0;
  let kind: EbookBlockKind = 'p';
  let fenced = false;

  // The paragraph starts where its first line does
  const add = (text: string, at: number): void => {
    if (parts.length === 0) paraOffset = at;
    parts.push(text);
  };

  function* flush(): Generator<EbookBlock> {
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    const single = parts.length === 1;
    parts = [];
    const was = kind;
    kind = 'p';
    if (!text) return;
    if (!markdown && was === 'p' && single && looksLikeHeading(text)) {
      yield { kind: 'h', text, offset: paraOffset, ...(CHAPTER_WORD.test(text) ? { chapterStart: true } : {}) };
      return;
    }
    yield* splitLong(text, was, paraOffset);
  }

  for await (const line of withoutGutenbergFrame(mode === 'aligned' ? fromParagraph(lines) : lines, mode === 'start')) {
    const raw = line.text;
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
        if (text) yield { kind: 'h', text, offset: line.offset, ...(heading[1].length <= 2 ? { chapterStart: true } : {}) };
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
        add(stripMarkdown(quote[1]), line.offset);
        continue;
      }
    }

    const item = LIST_MARKER.exec(raw);
    // A marker only starts a list item at the start of a block (or markdown, where a list may follow text),
    // so a wrapped line that starts with "1914. " is not taken for one
    if (item && (parts.length === 0 || kind === 'li' || markdown)) {
      yield* flush();
      kind = 'li';
      add(markdown ? stripMarkdown(item[3]) : decodeEntities(item[3]), line.offset);
      continue;
    }
    if (kind === 'li' && !/^\s/.test(raw)) yield* flush();
    if (kind === 'quote') yield* flush();
    add(markdown ? stripMarkdown(trimmed) : decodeEntities(trimmed), line.offset);
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
    out.push(...splitLong(text, kind, 0));
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
  let at = 0;
  for (const block of out) {
    block.offset = at;
    at += block.text.length + 1;
  }
  return out;
}

// ---- Entry points ----

/** The formats read in this module (EPUB has its own reader, `ebook-epub.ts`). */
export type EbookTextFormat = 'text' | 'markdown' | 'html';
/** Every format a book can be in. */
export type EbookFormat = EbookTextFormat | 'epub';

/** Which format a file name or MIME type is, or null if it is not one of them. */
export function ebookFormat(name: string, mime = ''): EbookFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (ext === 'epub' || mime === 'application/epub+zip') return 'epub';
  if (['md', 'markdown'].includes(ext) || mime === 'text/markdown') return 'markdown';
  if (['html', 'htm', 'xhtml'].includes(ext) || mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (['txt', 'text', ''].includes(ext) || mime === 'text/plain') return 'text';
  return null;
}

/**
 * A book that can be read from any offset: what the service opens to start, jump or start over. The
 * offsets are those of `EbookBlock.offset`.
 */
export interface EbookOpener {
  /** The size of the book in offset units: the file size (a guess for text), the exact text length for a web page once read */
  total(): number;
  /** True when `total` is exact (a web page), false when it is estimated from the file size */
  exact(): boolean;
  /**
   * Blocks from the first paragraph at or after `startOffset`. With `exact` the offset is known to be
   * the start of a paragraph (a remembered position), so reading begins right there instead of at the
   * next paragraph.
   */
  open(startOffset: number, exact?: boolean): EbookBlockSource;
}

/** Blocks of `source` that start at or after `startOffset`. */
async function* blocksFrom(source: EbookBlockSource, startOffset: number): AsyncGenerator<EbookBlock> {
  for await (const block of source) if ((block.offset ?? 0) >= startOffset) yield block;
}

/**
 * Open a text, Markdown or HTML book. Text and Markdown are read piece by piece and a jump goes straight
 * to the byte (a file is cut with `Blob.slice`, a web server is asked for a range), so the rest of a big
 * book is never read; where that is not possible (UTF-16, a server that ignores ranges) the reading
 * starts at the beginning and skips. HTML needs the whole page (refused above `EBOOK_MAX_WHOLE_FILE_BYTES`).
 */
export function ebookOpener(source: ByteSource, format: EbookTextFormat): EbookOpener {
  if (format === 'html') {
    let parsed: Promise<EbookBlock[]> | null = null;
    let size: number | null = null;
    const parse = (): Promise<EbookBlock[]> => {
      parsed ??= (async () => {
        const known = source.size();
        if (known !== null && known > EBOOK_MAX_WHOLE_FILE_BYTES) throw new Error('This page is too large to load.');
        let html = '';
        const { stream } = await source.read(0);
        for await (const chunk of decodeStream(stream, { label: source.charset })) {
          html += chunk;
          if (html.length > EBOOK_MAX_WHOLE_FILE_BYTES) throw new Error('This page is too large to load.');
        }
        const blocks = htmlToBlocks(html);
        const last = blocks[blocks.length - 1];
        size = last ? (last.offset ?? 0) + last.text.length : 0;
        return blocks;
      })();
      return parsed;
    };
    return {
      total: () => size ?? source.size() ?? 0,
      exact: () => size !== null,
      open: startOffset => (async function* () {
        yield* blocksFrom((async function* () { yield* await parse(); })(), startOffset);
      })(),
    };
  }

  let label: string | undefined = source.charset;
  let headRead: Promise<void> | null = null;
  const encoding = async (): Promise<string | undefined> => {
    headRead ??= (async () => {
      if (label || !source.head) return;
      const head = await source.head();
      if (head) label = sniffEncoding(head);
    })();
    await headRead;
    return label;
  };
  const markdown = format === 'markdown';
  const open = (startOffset: number, exact = false): EbookBlockSource => (async function* () {
    const enc = await encoding();
    if (startOffset > 0 && enc?.startsWith('utf-16')) {
      yield* blocksFrom(open(0), startOffset);
      return;
    }
    const { stream, from } = await source.read(startOffset);
    // Bytes are counted by the encoding found so far (known after the first piece when the source did not say)
    const lines = decodeLines(
      decodeStream(stream, {
        label: enc,
        skipContinuation: from > 0 && !exact && (enc ?? 'utf-8') === 'utf-8',
        onLabel: found => { label = found; },
      }),
      from,
      s => byteLengthFor(label ?? 'utf-8')(s),
    );
    if (from === startOffset) {
      yield* textBlocks(lines, markdown, startOffset === 0 ? 'start' : exact ? 'exact' : 'aligned');
    } else {
      yield* blocksFrom(textBlocks(lines, markdown, 'start'), startOffset);
    }
  })();
  return { total: () => source.size() ?? 0, exact: () => false, open };
}
