/**
 * Morse Code Studio
 */

import { EBOOK_MAX_WHOLE_FILE_BYTES } from './ebook-limits';

/** A load failed for a reason the learner can act on; the message is shown as it is. */
export class EbookLoadError extends Error {}

/** The bytes of a book, from a file on this device or from a web address. */
export interface ByteSource {
  /** The size in bytes when the source says (a web server may not), else null */
  size(): number | null;
  /** The character encoding the source names (a web server's `charset`), if it does */
  charset?: string;
  /** The first bytes, to work out the encoding; null when the source cannot give them without reading on */
  head?(): Promise<Uint8Array | null>;
  /**
   * A stream of the bytes from `start`. `from` is where it really starts: `start` when the source could go
   * straight there, else 0 (the caller reads on and skips what comes before).
   */
  read(start: number): Promise<{ stream: ReadableStream<Uint8Array>; from: number }>;
}

/** How much of the start of a file is looked at to find its encoding */
const SNIFF_BYTES = 64 * 1024;

/** A file on this device: any part of it can be read straight away. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: () => blob.size,
    head: async () => new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer()),
    read: async start => ({ stream: blob.slice(start).stream(), from: start }),
  };
}

/** What `openUrlSource` hands back: the source and what the server said about it. */
export interface UrlBook {
  source: ByteSource;
  /** The address without a fragment, to remember the position by */
  href: string;
  /** Last part of the path, or the host: what the book is called on screen */
  name: string;
  host: string;
  contentType: string;
  /** Let go of the first response when the book is not going to be read after all */
  discard(): void;
}

const CORS_MESSAGE = 'This address could not be loaded from the browser. The site may not allow it, the address may be wrong, '
  + 'or you may be offline. Download the file and choose it from your device instead.';

/**
 * Fetch a text file or page from a web address, straight from the browser: nothing goes through any
 * other server. Most sites do not allow this (CORS), and then the message says to download the file.
 * The first response is kept for the start of the book; a jump asks the server for a range of bytes
 * and, when the server ignores that, reads on and skips.
 */
export async function openUrlSource(raw: string): Promise<UrlBook> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new EbookLoadError('That is not a web address. It should look like https://example.com/book.txt');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EbookLoadError('The address must start with https:// (or http://).');
  }
  url.hash = '';
  const init: RequestInit = { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' };

  const get = async (headers?: Record<string, string>): Promise<Response> => {
    try {
      return await fetch(url, { ...init, headers });
    } catch {
      throw new EbookLoadError(CORS_MESSAGE);
    }
  };

  const first = await get();
  if (!first.ok || !first.body) {
    throw new EbookLoadError(first.ok
      ? 'The server sent nothing to read.'
      : `The server answered "${first.status}${first.statusText ? ' ' + first.statusText : ''}".`);
  }
  const contentType = first.headers.get('content-type') ?? '';
  const length = Number(first.headers.get('content-length'));
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1];
  // A web page cannot be read in pieces, so a big one is refused before it is downloaded
  if (/html/i.test(contentType) && Number.isFinite(length) && length > EBOOK_MAX_WHOLE_FILE_BYTES) {
    await first.body.cancel().catch(() => undefined);
    throw new EbookLoadError('This page is too large to load.');
  }

  // What has been read so far, for a size when the server does not say how big the file is
  let readUpTo = 0;
  const counted = (stream: ReadableStream<Uint8Array>, base: number): ReadableStream<Uint8Array> => {
    let n = base;
    return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        n += chunk.length;
        readUpTo = Math.max(readUpTo, n);
        controller.enqueue(chunk);
      },
    }));
  };

  let firstUsed = false;
  const source: ByteSource = {
    size: () => (Number.isFinite(length) && length > 0 ? Math.max(length, readUpTo) : readUpTo || null),
    charset: charset && isKnownCharset(charset) ? charset : undefined,
    read: async start => {
      if (start === 0 && !firstUsed) {
        firstUsed = true;
        return { stream: counted(first.body as ReadableStream<Uint8Array>, 0), from: 0 };
      }
      if (start > 0) {
        const part = await get({ Range: `bytes=${start}-` });
        if (part.status === 206 && part.body) return { stream: counted(part.body, start), from: start };
        if (part.status === 416) return { stream: new ReadableStream<Uint8Array>({ start: c => c.close() }), from: start };
        // The server ignored the range and sent everything: read on from the start
        if (part.ok && part.body) return { stream: counted(part.body, 0), from: 0 };
      }
      const whole = await get();
      if (!whole.ok || !whole.body) throw new EbookLoadError('The server stopped answering.');
      return { stream: counted(whole.body, 0), from: 0 };
    },
  };

  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return {
    source,
    href: url.href,
    name: last || url.hostname,
    host: url.hostname,
    contentType,
    discard: () => { if (!firstUsed) void first.body?.cancel().catch(() => undefined); },
  };
}

function isKnownCharset(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}

/** Which format a web address is, from what the server says it is (the file name decides only when the server is vague); null when it is neither text, a page nor an EPUB. */
export function urlFormat(path: string, contentType: string): 'text' | 'markdown' | 'html' | 'epub' | null {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  if (type === 'application/epub+zip') return 'epub';
  if (ext === 'epub' && (type === '' || type === 'application/octet-stream' || type === 'application/zip')) return 'epub';
  if (['md', 'markdown'].includes(ext) || type === 'text/markdown') return 'markdown';
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type.startsWith('text/')) return 'text';
  if (type === '' || type === 'application/octet-stream') {
    if (['html', 'htm', 'xhtml'].includes(ext)) return 'html';
    if (['txt', 'text'].includes(ext)) return 'text';
  }
  return null;
}

/** The most an EPUB downloaded from a web address may be: it is held in memory while it is read. */
export const EBOOK_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

/** Download a whole book (an EPUB needs random access to its zip) into a Blob. */
export async function urlToBlob(book: UrlBook, maxBytes = EBOOK_MAX_DOWNLOAD_BYTES): Promise<Blob> {
  const tooBig = new EbookLoadError('This EPUB is too large to load from an address. Download it and choose the file instead.');
  const known = book.source.size();
  if (known !== null && known > maxBytes) {
    book.discard();
    throw tooBig;
  }
  const { stream } = await book.source.read(0);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw tooBig;
      parts.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e instanceof EbookLoadError ? e : new EbookLoadError('The download was interrupted.');
  }
  return new Blob(parts as BlobPart[]);
}
