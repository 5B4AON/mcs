/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { EBOOK_PAGE_CHARS, EbookPosition } from './ebook-model';
import { EbookFormat, EbookOpener, ebookFormat, ebookOpener } from './ebook-parsers';
import { EbookChapter, epubOpener } from './ebook-epub';
import { zipBytesOf } from './ebook-zip';
import { EbookLoadError, UrlBook, blobSource, openUrlSource, urlFormat, urlToBlob } from './ebook-sources';
import { forgetResume, loadResume, resumeIdForFile, resumeIdForUrl, saveResume } from './ebook-resume';
import { LastBook, forgetLastBook, loadLastBook, loadLastFile, rememberFile, rememberUrl } from './ebook-last';
import { ConfirmService } from './confirm.service';
import { playableChars, playableIndexAt } from './ebook-playable';
import { EbookWindow } from './ebook-window';
import { SettingsService } from './settings.service';

/** What is known about the loaded book (never its text: that stays in the window). */
export interface EbookInfo {
  /** File name, or the last part of the web address */
  name: string;
  /** Format label for the status line */
  format: string;
  /** Size in bytes when known (0 when a web server did not say) */
  bytes: number;
  /** The host of a web address, '' for a file */
  origin: string;
}

/** What loading a book came to: it failed, it loaded from the start, or it loaded and the learner chose to resume where they stopped. */
export type EbookLoadResult = 'failed' | 'loaded' | 'resumed';

const FORMAT_LABEL: Record<EbookFormat, string> = { text: 'Text', markdown: 'Markdown', html: 'Web page', epub: 'EPUB' };
const UNSUPPORTED = 'This kind of file cannot be loaded. Use a text (.txt), Markdown (.md), web page (.html) or EPUB (.epub) file.';

/** The place in the book is written at least this often while the reading moves (and at once when the page is left) */
const SAVE_EVERY_MS = 2000;

/**
 * E-book Service — the one book Copy Practice and Send Practice read from.
 *
 * Holds the loaded file's name, the reading position and the sliding window of parsed text
 * (`EbookWindow`). The book is read from the file piece by piece and is never part of the settings, the
 * profiles, the presets or an export. The last book (its web address, or a copy of the chosen file kept in
 * IndexedDB) and the place in it are remembered on this device, and the book reopens at that place by itself
 * when E-book practice is on. Loading a different book is always a user action.
 */
@Injectable({ providedIn: 'root' })
export class EbookService {
  /** The loaded book, or null */
  readonly info = signal<EbookInfo | null>(null);
  /** True while a file is being opened */
  readonly loading = signal(false);
  /** Plain-language reason the last load failed ('' when it did not) */
  readonly error = signal('');
  /**
   * Where the reading stands: the next character to play (Copy: the one sounding; Send: the one to key),
   * as an absolute block and a text offset in it. Always on a playable character (see `snap`).
   */
  readonly position = signal<EbookPosition>({ block: 0, at: 0 });
  /** Counts every change of the window's content, so the reader knows when to draw new blocks */
  readonly revision = signal(0);
  /** True while Copy practice plays the book: the position moves by itself */
  readonly playing = signal(false);
  /** True while a click on the text cannot move the reading (Send practice with the mouse as a key: the click would key) */
  readonly jumpLocked = signal(false);
  /** Counts the times the reader is asked to bring the reading position back to the middle (a key pressed in Send practice) */
  readonly recenter = signal(0);
  /** The reader ignores clicks while this is true */
  readonly busy = computed(() => this.playing() || this.jumpLocked());
  readonly loaded = computed(() => this.info() !== null);
  /** True while the practice mode that is on has the e-book as its content: the reader takes the output area (main and full screen) */
  readonly active = computed(() => {
    const s = this.settings.settings();
    return (s.encoderMode === 'practice' && s.practiceContentMode === 'ebook')
      || (s.encoderMode === 'send-practice' && s.sendPracticeContentMode === 'ebook');
  });
  /** The size of the book in the unit of block offsets (estimated from the file size until it is known exactly) */
  readonly totalChars = signal(0);
  /** True when `totalChars` is exact, false when it is estimated */
  readonly totalExact = signal(false);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalChars() / EBOOK_PAGE_CHARS)));
  /** The page the reading is on (a page is about 1,500 characters, whatever the screen) */
  readonly page = computed(() => {
    this.revision();
    const pos = this.position();
    const block = this.text?.block(pos.block);
    if (!block) return this.atEnd ? this.totalPages() : 1;
    return Math.min(this.totalPages(), Math.floor(((block.offset ?? 0) + pos.at) / EBOOK_PAGE_CHARS) + 1);
  });

  /** Emitted when the learner has chosen Resume for a book loaded from a card: which practice card it was ('copy' or 'send') */
  /** The chapters of the loaded book from its table of contents (an EPUB's), empty when it has none */
  readonly chapters = signal<EbookChapter[]>([]);
  readonly resumed$ = new Subject<'copy' | 'send'>();

  /** Where the reading is in the unit of block offsets (the start of its paragraph) */
  readonly readingOffset = computed(() => {
    this.revision();
    return this.text?.block(this.position().block)?.offset ?? 0;
  });

  private window: EbookWindow | null = null;
  private opener: EbookOpener | null = null;
  private loadId = 0;
  /** What the remembered position of the loaded book is kept under */
  private resumeId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Off while the Resume question is open, so the start of the book does not overwrite the place it offers */
  private saveEnabled = false;
  /** Where a fresh start stands: not remembered until the reading moves from it */
  private baseline: EbookPosition | null = null;
  /** True once the last book has been reopened (or tried) in this stretch of E-book practice */
  private restoreTried = false;

  constructor(private settings: SettingsService, private confirm: ConfirmService) {
    // Starting the app (or switching to E-book practice) with no book loaded reopens the last one where it stopped
    effect(() => {
      if (!this.active()) {
        this.restoreTried = false;
        return;
      }
      untracked(() => {
        if (this.restoreTried || this.loaded() || this.loading()) return;
        this.restoreTried = true;
        void this.restoreLast();
      });
    });
    // The place in the book is written every couple of seconds while it moves, and when the page is left;
    // it lives under its own key, so no Save button is involved
    effect(() => {
      this.position();
      this.revision();
      untracked(() => this.scheduleSave());
    });
    globalThis.addEventListener?.('pagehide', () => this.flushSave());
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushSave();
    });
  }

  /** The window of parsed text, for the reader and the drivers. */
  get text(): EbookWindow | null {
    return this.window;
  }

  /**
   * Open a file as the book. The previous book stays until the new one has been read successfully,
   * so a failed choice changes nothing. Returns whether the book was loaded.
   */
  async loadFile(file: File): Promise<EbookLoadResult> {
    const format = ebookFormat(file.name, file.type);
    if (!format) {
      this.error.set(UNSUPPORTED);
      return 'failed';
    }
    return this.install(
      format === 'epub' ? epubOpener(zipBytesOf(file)) : ebookOpener(blobSource(file), format),
      { name: file.name, format: FORMAT_LABEL[format], bytes: file.size, origin: '' },
      resumeIdForFile(file.name, file.size),
      () => void rememberFile(file),
    );
  }

  /**
   * Open a text file or page from a web address, fetched straight from the browser (many sites do not
   * allow that: the message then says to download the file). Only ever started by a click.
   */
  async loadUrl(address: string, auto = false): Promise<EbookLoadResult> {
    this.loading.set(true);
    this.error.set('');
    let book: UrlBook;
    try {
      book = await openUrlSource(address);
    } catch (e) {
      this.loading.set(false);
      this.error.set(e instanceof EbookLoadError ? e.message : 'The address could not be loaded.');
      return 'failed';
    }
    const format = urlFormat(new URL(book.href).pathname, book.contentType);
    if (!format) {
      book.discard();
      this.loading.set(false);
      this.error.set('That address is not a text file, a web page or an EPUB. Use a text (.txt), Markdown (.md), web page (.html) or EPUB (.epub) address.');
      return 'failed';
    }
    let opener: EbookOpener;
    try {
      // An EPUB is a zip that has to be read at random, so it is downloaded whole first
      opener = format === 'epub' ? epubOpener(zipBytesOf(await urlToBlob(book))) : ebookOpener(book.source, format);
    } catch (e) {
      this.loading.set(false);
      this.error.set(e instanceof EbookLoadError ? e.message : 'The address could not be loaded.');
      return 'failed';
    }
    return this.install(
      opener,
      { name: book.name, format: FORMAT_LABEL[format], bytes: book.source.size() ?? 0, origin: book.host },
      resumeIdForUrl(book.href),
      () => rememberUrl(book.href),
      auto,
    );
  }

  /** Reopen the book that was loaded last, at the place where it stopped, without asking. Does nothing when there is none. */
  async restoreLast(): Promise<EbookLoadResult> {
    const last: LastBook | null = loadLastBook();
    if (!last) return 'failed';
    if (last.kind === 'url') return this.loadUrl(last.href, true);
    const file = await loadLastFile(last);
    if (!file) {
      forgetLastBook();
      return 'failed';
    }
    const format = ebookFormat(file.name, file.type);
    if (!format) return 'failed';
    return this.install(
      format === 'epub' ? epubOpener(zipBytesOf(file)) : ebookOpener(blobSource(file), format),
      { name: file.name, format: FORMAT_LABEL[format], bytes: file.size, origin: '' },
      resumeIdForFile(file.name, file.size),
      null,
      true,
    );
  }

  /**
   * Make a book that has been opened the current one, and offer to go on where the learner stopped
   * (an `auto` reopening at start-up goes on there without asking). `remember` keeps the book as the last one.
   */
  private async install(opener: EbookOpener, info: EbookInfo, resumeId: string, remember: (() => void) | null, auto = false): Promise<EbookLoadResult> {
    const window = await this.read(opener, 0);
    if (!window) return 'failed';
    remember?.();
    this.flushSave();
    this.window?.dispose();
    this.opener = opener;
    this.window = window;
    this.resumeId = resumeId;
    this.saveEnabled = false;
    this.totalChars.set(opener.total());
    this.totalExact.set(opener.exact());
    this.position.set(this.snap({ block: 0, at: 0 }));
    this.baseline = this.position();
    this.revision.update(n => n + 1);
    this.info.set(info);
    this.chapters.set('chapters' in opener ? await (opener as { chapters(): Promise<EbookChapter[]> }).chapters().catch(() => []) : []);
    const resumed = auto ? await this.resumeSilently(resumeId) : await this.offerResume(resumeId, info.name);
    this.saveEnabled = true;
    return resumed ? 'resumed' : 'loaded';
  }

  /** Go on from the remembered place without asking. */
  private async resumeSilently(id: string): Promise<boolean> {
    const saved = loadResume(id);
    const start = this.window?.held()[0]?.offset ?? 0;
    if (!saved || saved.offset <= start) return false;
    await this.restartAt(saved.offset, saved.exact);
    // A place that cannot be read any more leaves the book at its start
    if (this.error()) this.error.set('');
    return true;
  }

  /** The book was read before: ask whether to go on from the page where it stopped. */
  private async offerResume(id: string, name: string): Promise<boolean> {
    const saved = loadResume(id);
    const start = this.window?.held()[0]?.offset ?? 0;
    if (!saved || saved.offset <= start) return false;
    const page = Math.floor(saved.offset / EBOOK_PAGE_CHARS) + 1;
    const resume = await this.confirm.ask({
      title: 'Resume reading?',
      message: `You stopped on page ${page} of about ${this.totalPages()} in "${name}". Continue from there, or start from the beginning?`,
      confirmLabel: 'Resume',
      cancelLabel: 'Start over',
    });
    if (!resume) {
      forgetResume(id);
      return false;
    }
    await this.restartAt(saved.offset, saved.exact);
    return !this.error();
  }

  // ---- Remembering the place ----

  private scheduleSave(): void {
    if (!this.saveEnabled || !this.resumeId) return;
    // A save that is already waiting writes the latest place when it comes: restarting the wait on every
    // move would never let it fire while the book plays
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_EVERY_MS);
  }

  /** Write the place in the book now: the start of the paragraph being read, never the text. */
  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const id = this.resumeId;
    const window = this.window;
    if (!id || !window || !this.saveEnabled) return;
    const pos = this.position();
    const base = this.baseline;
    // A finished book, or one that has not been read from its start, has no place to come back to
    if (this.atEnd || (base && base.block === pos.block && base.at === pos.at)) {
      forgetResume(id);
      return;
    }
    let index = pos.block;
    let block = window.block(index);
    if (!block) return;
    // A very long paragraph was cut into several blocks: go back to where it began
    while (block.continued && window.block(index - 1)) block = window.block(--index) as typeof block;
    saveResume(id, block.offset ?? 0, !block.continued);
  }

  /** Go back to the beginning of the book. */
  startOver(): Promise<void> {
    return this.restartAt(0);
  }

  /** Go to the start of a chapter (an offset from `chapters`). */
  jumpToChapter(chapter: EbookChapter): Promise<void> {
    return this.restartAt(chapter.offset, true);
  }

  /** Go to the start of a page (1 to `totalPages`), landing on the next paragraph. */
  jumpToPage(page: number): Promise<void> {
    const clamped = Math.min(Math.max(1, Math.round(page)), this.totalPages());
    return this.restartAt((clamped - 1) * EBOOK_PAGE_CHARS);
  }

  /**
   * Read the book from a block offset. Inside the part already held it only moves the position; otherwise
   * the window is read again from there. A failed jump (no text there) changes nothing. With `exact` the
   * offset is the start of a paragraph (a remembered place), so reading begins right there.
   */
  private async restartAt(offset: number, exact = false): Promise<void> {
    const opener = this.opener;
    if (!opener) return;
    const held = this.window?.held() ?? [];
    const first = held[0]?.offset;
    const last = held[held.length - 1]?.offset;
    if (this.window && first !== undefined && last !== undefined && first <= offset && offset <= last) {
      const i = held.findIndex(b => (b.offset ?? 0) >= offset);
      this.setPosition({ block: this.window.first + i, at: 0 });
      this.baseline = offset === 0 ? this.position() : null;
      return;
    }
    // Near the end there may be no paragraph left after the offset: step back a page at a time
    let window = await this.read(opener, offset, exact);
    for (let at = offset; !window && this.error() && at > 0 && !this.loading(); ) {
      at = Math.max(0, at - EBOOK_PAGE_CHARS);
      window = await this.read(opener, at);
    }
    if (!window) return;
    this.window?.dispose();
    this.window = window;
    this.totalChars.set(opener.total());
    this.totalExact.set(opener.exact());
    this.position.set(this.snap({ block: 0, at: 0 }));
    this.baseline = offset === 0 ? this.position() : null;
    this.revision.update(n => n + 1);
  }

  /** Open a window on the book at `offset` and read the first part; null (with `error` set) when that fails or has no text to play. */
  private async read(opener: EbookOpener, offset: number, exact = false): Promise<EbookWindow | null> {
    const id = ++this.loadId;
    this.loading.set(true);
    this.error.set('');
    const window = new EbookWindow(opener.open(offset, exact));
    try {
      await window.ensure(0);
      if (id !== this.loadId) {
        window.dispose();
        return null;
      }
      if (window.failed && window.held().length === 0) {
        this.error.set(window.failed.message || 'The file could not be read.');
        window.dispose();
        return null;
      }
      if (!window.held().some(block => playableChars(block).length > 0)) {
        this.error.set(offset > 0
          ? 'There is no text to play there.'
          : 'No text that Morse code can play was found in this file. Morse code covers English letters, digits and common punctuation.');
        window.dispose();
        return null;
      }
      return window;
    } catch (e) {
      window.dispose();
      if (id === this.loadId) this.error.set(e instanceof Error && e.message ? e.message : 'The file could not be read.');
      return null;
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }

  /** Forget the book. */
  remove(): void {
    forgetLastBook();
    this.flushSave();
    this.saveEnabled = false;
    this.resumeId = null;
    this.baseline = null;
    this.loadId++;
    this.window?.dispose();
    this.window = null;
    this.opener = null;
    this.totalChars.set(0);
    this.totalExact.set(false);
    this.info.set(null);
    this.chapters.set([]);
    this.error.set('');
    this.loading.set(false);
    this.position.set({ block: 0, at: 0 });
    this.revision.update(n => n + 1);
  }

  /** True once the position is past the last block of a book that has been read to its end. */
  get atEnd(): boolean {
    return !!this.window && this.window.done && this.position().block >= this.window.end;
  }

  /**
   * Move the reading to the playable character at or after `p` (white space, symbols and anything
   * Morse has no code for are passed over, across blocks). Past the last block it returns the end.
   */
  snap(p: EbookPosition): EbookPosition {
    const window = this.window;
    if (!window) return p;
    let block = Math.max(p.block, window.first);
    let at = p.at;
    for (;;) {
      const b = window.block(block);
      if (!b) return { block, at: 0 };
      const chars = playableChars(b);
      let i = playableIndexAt(chars, at);
      while (i < chars.length && chars[i].char === ' ') i++;
      if (i < chars.length) return { block, at: chars[i].at };
      block++;
      at = 0;
    }
  }

  /** Ask the reader to scroll the reading position back to the middle, wherever the text has been scrolled to. */
  requestRecenter(): void {
    this.recenter.update(n => n + 1);
  }

  /** Move the reading (snapped to a playable character) and read more of the book if the window runs short. */
  setPosition(p: EbookPosition): void {
    this.position.set(this.snap(p));
    void this.refill();
  }

  /**
   * Report where playing or keying has got to. Unlike `setPosition` it does not move on to a playable
   * character: the position may sit on white space, between two characters.
   */
  reportPosition(p: EbookPosition): void {
    const now = this.position();
    if (now.block === p.block && now.at === p.at) return;
    this.position.set(p);
    void this.refill();
  }

  private async refill(): Promise<void> {
    const window = this.window;
    if (!window) return;
    const [first, end] = [window.first, window.end];
    await window.ensure(this.position().block);
    if (window !== this.window) return;
    if (window.failed && !this.error()) this.error.set('The connection to the book was lost, so the rest of it could not be loaded.');
    // The page only needs to hear of blocks that came or went
    if (window.first !== first || window.end !== end) this.revision.update(n => n + 1);
  }
}
