/**
 * Morse Code Studio
 */

import { EbookLoadError } from './ebook-sources';

/** One file inside a zip. */
export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate */
  method: number;
  compressedSize: number;
  size: number;
  /** Where its local header starts */
  offset: number;
  encrypted: boolean;
}

/** Random access to the bytes of a zip file (a file on this device, or a download held as a Blob). */
export interface ZipBytes {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

/** A Blob as zip bytes: only the parts asked for are read. */
export function zipBytesOf(blob: Blob): ZipBytes {
  return { size: blob.size, read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()) };
}

const EOCD_SIGNATURE = 0x06054B50;
const CENTRAL_SIGNATURE = 0x02014B50;
const LOCAL_SIGNATURE = 0x04034B50;
const NOT_A_ZIP = 'This file is not a valid EPUB (it is not a zip file).';

/**
 * Read the list of files of a zip from its central directory at the end of the file; nothing else is
 * read. Zip64 (archives over 4 GB) is not supported.
 */
export async function readZipDirectory(zip: ZipBytes): Promise<Map<string, ZipEntry>> {
  const tailLength = Math.min(zip.size, 22 + 0xFFFF);
  const tail = await zip.read(zip.size - tailLength, zip.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let at = tail.length - 22;
  while (at >= 0 && view.getUint32(at, true) !== EOCD_SIGNATURE) at--;
  if (at < 0) throw new EbookLoadError(NOT_A_ZIP);
  const count = view.getUint16(at + 10, true);
  const directorySize = view.getUint32(at + 12, true);
  const directoryOffset = view.getUint32(at + 16, true);
  if (directoryOffset === 0xFFFFFFFF || directorySize === 0xFFFFFFFF) {
    throw new EbookLoadError('This EPUB is too large to open here.');
  }

  const dir = await zip.read(directoryOffset, directoryOffset + directorySize);
  const d = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const names = new TextDecoder('utf-8');
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.length; i++) {
    if (d.getUint32(p, true) !== CENTRAL_SIGNATURE) throw new EbookLoadError(NOT_A_ZIP);
    const flags = d.getUint16(p + 8, true);
    const nameLength = d.getUint16(p + 28, true);
    const extraLength = d.getUint16(p + 30, true);
    const commentLength = d.getUint16(p + 32, true);
    const name = names.decode(dir.subarray(p + 46, p + 46 + nameLength));
    entries.set(name, {
      name,
      method: d.getUint16(p + 10, true),
      compressedSize: d.getUint32(p + 20, true),
      size: d.getUint32(p + 24, true),
      offset: d.getUint32(p + 42, true),
      encrypted: (flags & 1) !== 0,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The bytes of one file of the zip, unpacked. */
export async function readZipEntry(zip: ZipBytes, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.encrypted) throw new EbookLoadError('This EPUB is protected and cannot be read here.');
  const header = await zip.read(entry.offset, entry.offset + 30);
  const h = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || h.getUint32(0, true) !== LOCAL_SIGNATURE) throw new EbookLoadError(NOT_A_ZIP);
  const start = entry.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const packed = await zip.read(start, start + entry.compressedSize);
  if (entry.method === 0) return packed;
  if (entry.method !== 8) throw new EbookLoadError('This EPUB uses a kind of compression that is not supported.');
  if (typeof DecompressionStream === 'undefined') {
    throw new EbookLoadError('This browser cannot open EPUB files: it has no built-in unzip. Use a newer browser.');
  }
  const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
