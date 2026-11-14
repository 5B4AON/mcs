/**
 * Morse Code Studio
 */

/** Where reading stopped in a book. The book itself is never stored, only this. */
export interface EbookResumeEntry {
  /** Block offset of the paragraph being read (see `EbookBlock.offset`) */
  offset: number;
  /** True when `offset` is the start of a paragraph, so reading can begin exactly there */
  exact: boolean;
  /** When it was saved (ms since 1970), to drop the oldest first */
  at: number;
}

/** The localStorage key: its own, outside the settings, profiles and presets. */
export const EBOOK_RESUME_KEY = 'mcsEbookPositions';
const MAX_ENTRIES = 40;

type Store = Record<string, EbookResumeEntry>;

/** A file is told apart by name and size, a web address by the address. */
export const resumeIdForFile = (name: string, size: number): string => `file:${name}:${size}`;
export const resumeIdForUrl = (href: string): string => `url:${href}`;

/** Typed or pasted text is told apart by its content (FNV-1a hash and length), as it has no file name or address. */
export function resumeIdForText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `text:${hash.toString(16)}:${text.length}`;
}

function read(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EBOOK_RESUME_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const store: Store = {};
    for (const [id, e] of Object.entries(parsed as Record<string, Partial<EbookResumeEntry>>)) {
      if (e && typeof e.offset === 'number' && Number.isFinite(e.offset) && e.offset >= 0) {
        store[id] = { offset: e.offset, exact: e.exact === true, at: typeof e.at === 'number' ? e.at : 0 };
      }
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    const newest = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
    localStorage.setItem(EBOOK_RESUME_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Storage may be full or blocked: the position is then simply not remembered
  }
}

/** The remembered position of a book, or null. */
export function loadResume(id: string): EbookResumeEntry | null {
  return read()[id] ?? null;
}

export function saveResume(id: string, offset: number, exact: boolean): void {
  const store = read();
  store[id] = { offset: Math.max(0, Math.round(offset)), exact, at: Date.now() };
  write(store);
}

export function forgetResume(id: string): void {
  const store = read();
  if (id in store) {
    delete store[id];
    write(store);
  }
}
