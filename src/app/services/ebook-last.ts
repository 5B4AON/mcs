/**
 * Morse Code Studio
 */

/** Which book was loaded last, so it can open again by itself when the app is started. */
export type LastBook =
  | { kind: 'url'; href: string }
  | { kind: 'file'; name: string; type: string; size: number };

/** Its own localStorage key and IndexedDB database: outside the settings, profiles and presets. */
export const EBOOK_LAST_KEY = 'mcsEbookLast';
const DB_NAME = 'mcsEbook';
const STORE = 'books';
const FILE_KEY = 'last';
/** A larger file is not kept: the learner chooses it again */
export const MAX_KEPT_FILE_BYTES = 100 * 1024 * 1024;

/** The remembered book, or null. */
export function loadLastBook(): LastBook | null {
  try {
    const v = JSON.parse(localStorage.getItem(EBOOK_LAST_KEY) ?? 'null') as Partial<LastBook> | null;
    if (v?.kind === 'url' && typeof v.href === 'string' && v.href) return { kind: 'url', href: v.href };
    if (v?.kind === 'file' && typeof v.name === 'string' && typeof v.size === 'number') {
      return { kind: 'file', name: v.name, type: typeof v.type === 'string' ? v.type : '', size: v.size };
    }
  } catch {
    // Unreadable: nothing is remembered
  }
  return null;
}

function setLast(book: LastBook | null): void {
  try {
    if (book) localStorage.setItem(EBOOK_LAST_KEY, JSON.stringify(book));
    else localStorage.removeItem(EBOOK_LAST_KEY);
  } catch {
    // Storage may be full or blocked: the book is then simply not reopened
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Remember a web address as the book to reopen (a file kept before is dropped). */
export function rememberUrl(href: string): void {
  setLast({ kind: 'url', href });
  void withStore('readwrite', s => s.delete(FILE_KEY)).catch(() => undefined);
}

/** Keep a copy of a chosen file on this device, as the book to reopen. Silently does nothing when it cannot. */
export async function rememberFile(file: File): Promise<void> {
  if (file.size > MAX_KEPT_FILE_BYTES) {
    forgetLastBook();
    return;
  }
  try {
    await withStore('readwrite', s => s.put(file, FILE_KEY));
    setLast({ kind: 'file', name: file.name, type: file.type, size: file.size });
  } catch {
    forgetLastBook();
  }
}

/** The kept file of the remembered book, or null when it is gone. */
export async function loadLastFile(book: Extract<LastBook, { kind: 'file' }>): Promise<File | null> {
  try {
    const blob = await withStore<unknown>('readonly', s => s.get(FILE_KEY));
    return blob instanceof Blob ? new File([blob], book.name, { type: book.type }) : null;
  } catch {
    return null;
  }
}

/** Nothing is reopened at start-up any more, and a kept file is deleted. */
export function forgetLastBook(): void {
  setLast(null);
  void withStore('readwrite', s => s.delete(FILE_KEY)).catch(() => undefined);
}
