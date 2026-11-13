/**
 * Morse Code Studio
 */

import { EbookBlock, EbookBlockSource } from './ebook-model';
import { EbookOpener, htmlToBlocks } from './ebook-parsers';
import { EbookLoadError } from './ebook-sources';
import { ZipBytes, ZipEntry, readZipDirectory, readZipEntry } from './ebook-zip';

/** A chapter of the book: its title from the table of contents, and where it starts (a block offset). */
export interface EbookChapter {
  title: string;
  offset: number;
}

/** An EPUB opener also knows the chapters. */
export interface EpubOpener extends EbookOpener {
  chapters(): Promise<EbookChapter[]>;
}

/**
 * How much reading text an XHTML file of a given size holds, as a fraction (the rest is markup). The size of a
 * chapter is only known from the zip's list of files, so chapters are laid out by this estimate; that keeps
 * every offset (and so every page number and remembered place) the same each time the book is opened.
 */
const TEXT_SHARE = 0.5;

interface SpineItem {
  path: string;
  /** Offset where the chapter starts, and how much of the offset range it covers */
  base: number;
  span: number;
}

interface Layout {
  zip: ZipBytes;
  entries: Map<string, ZipEntry>;
  spine: SpineItem[];
  chapters: EbookChapter[];
  total: number;
}

const xml = (text: string): Document => new DOMParser().parseFromString(text, 'application/xml');
const all = (root: Document | Element, name: string): Element[] => Array.from(root.getElementsByTagNameNS('*', name));
const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1);

/** `href` relative to the file at `from`, as a path inside the zip. */
function resolve(from: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  const parts = (clean.startsWith('/') ? clean.slice(1) : dirOf(from) + clean).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

async function text(zip: ZipBytes, entries: Map<string, ZipEntry>, path: string): Promise<string | null> {
  const entry = entries.get(path);
  return entry ? new TextDecoder('utf-8').decode(await readZipEntry(zip, entry)) : null;
}

/** Titles of the table of contents by the zip path of the file they point to (EPUB 3 navigation document or EPUB 2 NCX). */
async function tableOfContents(
  zip: ZipBytes, entries: Map<string, ZipEntry>, opf: Document, opfPath: string,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const add = (from: string, href: string | null, title: string | null | undefined): void => {
    const label = title?.replace(/\s+/g, ' ').trim();
    if (!href || !label) return;
    const path = resolve(from, href);
    if (!titles.has(path)) titles.set(path, label);
  };

  const items = all(opf, 'item');
  const nav = items.find(i => (i.getAttribute('properties') ?? '').split(/\s+/).includes('nav'));
  if (nav) {
    const path = resolve(opfPath, nav.getAttribute('href') ?? '');
    const html = await text(zip, entries, path);
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const navs = Array.from(doc.querySelectorAll('nav'));
      const toc = navs.find(n => (n.getAttribute('epub:type') ?? '').includes('toc')) ?? navs[0];
      toc?.querySelectorAll('a[href]').forEach(a => add(path, a.getAttribute('href'), a.textContent));
    }
  }
  if (titles.size === 0) {
    const ncxId = all(opf, 'spine')[0]?.getAttribute('toc');
    const ncx = items.find(i => i.getAttribute('id') === ncxId)
      ?? items.find(i => i.getAttribute('media-type') === 'application/x-dtbncx+xml');
    const path = ncx ? resolve(opfPath, ncx.getAttribute('href') ?? '') : '';
    const body = path ? await text(zip, entries, path) : null;
    if (body) {
      for (const point of all(xml(body), 'navPoint')) {
        const label = all(point, 'text')[0]?.textContent;
        add(path, all(point, 'content')[0]?.getAttribute('src') ?? null, label);
      }
    }
  }
  return titles;
}

/** Work out the book's reading order, chapter titles and where each chapter starts, from the zip's file list. */
async function layOut(zip: ZipBytes): Promise<Layout> {
  const entries = await readZipDirectory(zip);
  const container = await text(zip, entries, 'META-INF/container.xml');
  const opfPath = container && all(xml(container), 'rootfile')[0]?.getAttribute('full-path');
  const opfText = opfPath ? await text(zip, entries, opfPath) : null;
  if (!opfPath || !opfText) throw new EbookLoadError('This file is not a valid EPUB (its package file is missing).');
  const opf = xml(opfText);

  const manifest = new Map<string, Element>();
  for (const item of all(opf, 'item')) manifest.set(item.getAttribute('id') ?? '', item);
  const paths: string[] = [];
  for (const ref of all(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    const type = item?.getAttribute('media-type') ?? '';
    const href = item?.getAttribute('href');
    if (href && /html/.test(type)) {
      const path = resolve(opfPath, href);
      if (entries.has(path)) paths.push(path);
    }
  }
  if (paths.length === 0) throw new EbookLoadError('This EPUB has no text to read.');

  // Adobe and similar protection encrypts the chapters themselves (fonts alone are harmless)
  const encryption = await text(zip, entries, 'META-INF/encryption.xml');
  if (encryption && paths.some(p => encryption.includes(p) || encryption.includes(encodeURI(p)))) {
    throw new EbookLoadError('This EPUB is protected and cannot be read here.');
  }

  const spine: SpineItem[] = [];
  let base = 0;
  for (const path of paths) {
    const span = Math.max(1, Math.round((entries.get(path)?.size ?? 0) * TEXT_SHARE));
    spine.push({ path, base, span });
    base += span;
  }
  const titles = await tableOfContents(zip, entries, opf, opfPath);
  const chapters = spine
    .map((s): EbookChapter | null => (titles.has(s.path) ? { title: titles.get(s.path) as string, offset: s.base } : null))
    .filter((c): c is EbookChapter => c !== null);
  return { zip, entries, spine, chapters, total: base };
}

/**
 * Open an EPUB. Only its list of files is read to start; a chapter is unpacked and parsed when the reading
 * gets to it, so a big book costs no more than a small one. A jump goes straight to the chapter that holds
 * the offset. Offsets follow `TEXT_SHARE` per chapter (so pages are approximate), and inside a chapter the
 * text is spread over its share, which keeps them in order from one chapter to the next.
 */
export function epubOpener(zip: ZipBytes): EpubOpener {
  let layout: Promise<Layout> | null = null;
  const get = (): Promise<Layout> => (layout ??= layOut(zip));
  let total = 0;

  return {
    total: () => total,
    exact: () => false,
    chapters: async () => (await get()).chapters,
    open: (startOffset): EbookBlockSource => (async function* (): AsyncGenerator<EbookBlock> {
      const book = await get();
      total = book.total;
      let k = book.spine.findIndex((s, i) => startOffset < s.base + s.span || i === book.spine.length - 1);
      for (; k < book.spine.length; k++) {
        const item = book.spine[k];
        const entry = book.entries.get(item.path) as ZipEntry;
        const html = new TextDecoder('utf-8').decode(await readZipEntry(book.zip, entry));
        const blocks = htmlToBlocks(html, true);
        const last = blocks[blocks.length - 1];
        const length = last ? (last.offset ?? 0) + last.text.length : 0;
        for (const block of blocks) {
          const offset = item.base + Math.floor(((block.offset ?? 0) * item.span) / Math.max(1, length));
          if (offset >= startOffset) yield { ...block, offset };
        }
      }
    })(),
  };
}
