/**
 * Morse Code Studio
 */

import {
  Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation, effect, inject, signal, untracked,
} from '@angular/core';
import { EbookBlock } from '../../services/ebook-model';
import { MORSE_TABLE } from '../../morse-table';
import { EbookService } from '../../services/ebook.service';
import { PracticeService } from '../../services/practice.service';
import { TypedCell } from '../../services/ebook-typed';
import { SettingsService } from '../../services/settings.service';

/** One word of a block: its box, and how much of it has been played (played characters are their own boxes). */
interface WordView {
  el: HTMLElement;
  text: string;
  /** Offset of the word in the block text */
  start: number;
  /** The word's characters (code points) and their offsets inside the word, one more than there are characters */
  chars: string[];
  offs: number[];
  /** One box per played character, in order; the unplayed rest stays plain text */
  spans: HTMLElement[];
  /** The unplayed rest of the word: a text node inside its own `.eb-r` span, so the main screen can give it its own font */
  rest: Text;
  tail: HTMLElement;
  /** Index of the span marked as the current character, or -1 */
  cur: number;
  /** The prosign key (such as `<AR>`) when the word is a prosign */
  sign?: string;
}

/** One block drawn in the page. */
interface BlockView {
  el: HTMLElement;
  words: WordView[];
  /** Words below `lo` are fully played, words above `hi` are untouched */
  lo: number;
  hi: number;
  state: 'none' | 'partial' | 'all';
}

/** A word that is a prosign (optionally with punctuation after it) */
const SIGN_WORD = /^<[A-Za-z]{2,3}>[.,;:!?]*$/;

/** Longer words may break anywhere (a URL), the rest never break inside. */
const LONG_WORD = 30;

/**
 * E-book Reader — the book's text, filling the box it sits in (the main screen's output area,
 * later the full-screen view), for Copy practice and Send practice alike.
 *
 * The text keeps its letter case and its paragraphs, headings and list items. Characters before the
 * position are drawn in another colour and slightly larger, the character at the position (the one
 * sounding, or the one to key) in a third style. The size change is a transform on a box of its own, so
 * the text never reflows as it is played; words are kept together so a line only breaks between words.
 * Unplayed text is plain text; only played characters become boxes. The view scrolls smoothly so the
 * position stays near the middle. While nothing is playing, a click or tap on the text moves the reading there (not in Type-along, where jumping ahead would defeat the exercise).
 *
 * In Copy practice the book can be blurred (Blurred and Type-along: only the CSS classes of the box it sits
 * in decide, and holding the eye button shows what has played, never the rest). In Type-along what is typed is
 * drawn under the character it belongs to (`PracticeService.ebookCellsSince`), and every line is twice as high
 * so there is room for it; the typed text is positioned, so nothing reflows as it is typed.
 */
@Component({
  selector: 'app-ebook-reader',
  standalone: true,
  templateUrl: './ebook-reader.component.html',
  styleUrl: './ebook-reader.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class EbookReaderComponent implements OnInit, OnDestroy {
  readonly ebook = inject(EbookService);
  private zone = inject(NgZone);
  readonly practice = inject(PracticeService);
  private settings = inject(SettingsService);

  @ViewChild('scroll', { static: true }) private scrollRef!: ElementRef<HTMLElement>;
  @ViewChild('content', { static: true }) private contentRef!: ElementRef<HTMLElement>;

  /** Said to screen readers when the reading reaches the end */
  readonly status = signal('');

  private views = new Map<number, BlockView>();
  private drawn: unknown = null;
  private resize: ResizeObserver | null = null;
  private focusEl: HTMLElement | null = null;
  /** Typed text waiting for its character to be played (its box does not exist yet) */
  private pendingTyped = new Map<string, TypedCell>();
  /** How far this reader has read the practice's log of changed cells (-1: not at all, so it draws every cell) */
  private cellsSeen = -1;
  /** The line height in pixels, measured once per size (measuring forces the page to be laid out) */
  private lineHeight = 0;
  private firstScroll = true;
  private readonly reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    effect(() => {
      this.ebook.revision();
      this.ebook.position();
      untracked(() => this.sync());
    });
    // What is typed in Type-along is drawn under the characters it belongs to, and how it compares
    effect(() => {
      this.practice.ebookTypedRevision();
      untracked(() => this.applyCells());
    });
    // Prosign actions can change in Settings while the book is drawn
    effect(() => {
      this.settings.settings().prosignActions;
      this.settings.settings().prosignActionsEnabled;
      untracked(() => {
        for (const view of this.views.values()) for (const word of view.words) this.applySign(word);
      });
    });
    // A key pressed in Send practice brings the expected letter back to the middle, even when it did not move
    effect(() => {
      this.ebook.recenter();
      untracked(() => {
        if (this.focusEl) this.follow(this.focusEl);
      });
    });
  }

  /** Copy practice in Type-along: lines have room for the typed text under them. */
  get typedMode(): boolean {
    return this.settings.settings().encoderMode === 'practice' && this.practice.feedbackMode() === 'typealong';
  }

  /** Copy practice in Blurred or Type-along, and Send practice: prosigns follow their prosign actions, so a new line or paragraph starts after them. */
  get signBreaks(): boolean {
    const s = this.settings.settings();
    if (s.encoderMode === 'send-practice') return true;
    const mode = this.practice.feedbackMode();
    return s.encoderMode === 'practice' && (mode === 'blur' || mode === 'typealong');
  }

  /** The book has been scored (Validate) and the result is on show until the book plays on. */
  get scored(): boolean {
    return this.typedMode && this.practice.feedback().length > 0;
  }

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      // The box may only get its size after the first drawing
      this.resize = new ResizeObserver(() => {
        this.lineHeight = 0;
        if (this.focusEl) this.follow(this.focusEl);
      });
      this.resize.observe(this.scrollRef.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
  }

  /** Move the reading to the clicked character, unless a driver is playing or text is being selected. */
  onClick(event: MouseEvent): void {
    if (this.ebook.busy() || this.typedMode) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed) return;
    const caret = caretAt(event.clientX, event.clientY);
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return;
    const blockEl = caret.node.parentElement?.closest<HTMLElement>('.eb-block');
    if (!blockEl) return;
    if (caret.node.parentElement?.closest('.eb-t')) return;
    // The typed text under a character is not part of the book
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('.eb-t') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    let at = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n === caret.node) {
        at += caret.offset;
        break;
      }
      at += (n as Text).data.length;
    }
    this.ebook.setPosition({ block: Number(blockEl.dataset['block']), at });
  }

  // ---- Drawing ----

  /** Bring the page in line with the window and the position, then keep the position in the middle. */
  private sync(): void {
    const window = this.ebook.text;
    const content = this.contentRef.nativeElement;
    if (window !== this.drawn) {
      this.drawn = window;
      this.views.clear();
      content.replaceChildren();
      this.focusEl = null;
      this.firstScroll = true;
    }
    if (!window) return;

    for (const [index, view] of this.views) {
      if (index < window.first) {
        view.el.remove();
        this.views.delete(index);
      }
    }
    for (let i = window.first; i < window.end; i++) {
      if (this.views.has(i)) continue;
      const view = this.build(i, window.block(i) as EbookBlock);
      content.appendChild(view.el);
      this.views.set(i, view);
    }

    const pos = this.ebook.position();
    for (const [index, view] of this.views) {
      if (index < pos.block) this.setBlock(view, 'all');
      else if (index > pos.block) this.setBlock(view, 'none');
    }
    const here = this.views.get(pos.block);
    const focus = here ? (this.setBlock(here, pos.at) ?? here.el) : undefined;
    this.status.set(this.ebook.atEnd ? 'End of the book.' : '');
    // The line only changes when the word does, so a new character in the same word costs no measuring
    const moved = focus !== this.focusEl;
    this.focusEl = focus ?? null;
    if (focus && moved) this.follow(focus);
    if (this.pendingTyped.size) this.applyCells();
  }

  /** Draw the cells that changed: the typed text under each character and how it compares; a character not drawn yet gets its cell when it is. */
  private applyCells(): void {
    const end = this.practice.ebookCellLogEnd();
    for (const [key, cell] of this.practice.ebookCellsSince(this.cellsSeen)) this.pendingTyped.set(key, cell);
    this.cellsSeen = end;
    for (const [key, cell] of this.pendingTyped) {
      // A `p` marks text typed ahead of what has played, a `g` text under the gap after a character
      const ahead = key.endsWith('p');
      const base = ahead ? key.slice(0, -1) : key;
      const gap = base.endsWith('g');
      const box = this.charBox(gap ? base.slice(0, -1) : base);
      if (!box) {
        // Nothing to clear on a character that is not drawn (unless its block has scrolled out of the window for good)
        const empty = !cell.text && !cell.result;
        if (empty || Number(key.split(':')[0]) < (this.ebook.text?.first ?? 0)) this.pendingTyped.delete(key);
        continue;
      }
      const selector = ahead ? ':scope > .eb-tp' : gap ? ':scope > .eb-tg' : ':scope > .eb-t:not(.eb-tg):not(.eb-tp)';
      let typed = box.querySelector<HTMLElement>(selector);
      if (cell.text && !typed) {
        typed = document.createElement('span');
        typed.className = ahead ? (gap ? 'eb-t eb-tp eb-tpg' : 'eb-t eb-tp') : gap ? 'eb-t eb-tg' : 'eb-t';
        typed.setAttribute('aria-hidden', 'true');
        // The text sits in a span of its own so the main screen can give it its font without changing the line
        const inner = document.createElement('span');
        inner.className = 'eb-tx';
        typed.appendChild(inner);
        box.appendChild(typed);
      }
      if (typed) {
        if (!cell.text) typed.remove();
        else (typed.firstElementChild ?? typed).textContent = ahead ? cell.text : lowerUnderLowercase(cell.text, box.firstElementChild?.textContent ?? '');
      }
      if (!gap && !ahead) {
        box.classList.toggle('eb-ok', cell.result === 'correct');
        box.classList.toggle('eb-bad', cell.result === 'incorrect');
        box.classList.toggle('eb-miss', cell.result === 'missed');
      }
      this.pendingTyped.delete(key);
    }
  }

  /** The box of a played character, from its key (block and text offset); a gap's key is the character before it. */
  private charBox(key: string): HTMLElement | undefined {
    const [block, at] = key.split(':').map(Number);
    const view = this.views.get(block);
    if (!view) return undefined;
    const words = view.words;
    let w = words.length - 1;
    while (w > 0 && words[w].start > at) w--;
    const word = words[w];
    if (!word) return undefined;
    const k = Math.min(at - word.start, word.text.length - 1);
    const index = Math.max(0, word.offs.findIndex(o => o >= k));
    return word.spans[index];
  }

  private build(index: number, block: EbookBlock): BlockView {
    const el = document.createElement(block.kind === 'h' ? 'h3' : 'p');
    el.className = `eb-block eb-${block.kind}`;
    el.dataset['block'] = String(index);
    const words: WordView[] = [];
    // A prosign such as <AR> is a word of its own, also when the text has it glued to other characters
    const re = /(\s+)|(<[A-Za-z]{2,3}>[.,;:!?]*)|((?:(?!<[A-Za-z]{2,3}>)\S)+)/g;
    for (let m = re.exec(block.text); m; m = re.exec(block.text)) {
      if (m[1]) {
        el.appendChild(document.createTextNode(m[1]));
        continue;
      }
      const text = m[2] ?? m[3];
      const box = document.createElement('span');
      box.className = text.length > LONG_WORD ? 'eb-w eb-long' : 'eb-w';
      const key = SIGN_WORD.test(text) ? text.slice(0, text.indexOf('>') + 1).toUpperCase() : '';
      const sign = MORSE_TABLE[key] ? key : undefined;
      const rest = document.createTextNode(text);
      const tail = document.createElement('span');
      tail.className = 'eb-r';
      tail.appendChild(rest);
      box.appendChild(tail);
      el.appendChild(box);
      const chars = Array.from(text);
      const offs = [0];
      for (const c of chars) offs.push(offs[offs.length - 1] + c.length);
      const word: WordView = { el: box, text, start: m.index, chars, offs, spans: [], rest, tail, cur: -1, sign };
      this.applySign(word);
      words.push(word);
    }
    return { el, words, lo: 0, hi: -1, state: 'none' };
  }

  /** Mark a prosign word with the layout break its prosign action asks for (a new line or paragraph after it). */
  private applySign(word: WordView): void {
    if (!word.sign) return;
    const s = this.settings.settings();
    const entry = s.prosignActionsEnabled ? s.prosignActions[word.sign] : undefined;
    const action = entry?.enabled ? entry.action : undefined;
    word.el.classList.toggle('eb-nl', action === 'newLine');
    word.el.classList.toggle('eb-np', action === 'newParagraph');
  }

  /**
   * Draw a block as fully played, untouched, or played up to the text offset `at` (that character is
   * the current one). Only the words that changed are touched. Returns the box of the current character,
   * or of the word the position is in, so the view can follow it.
   */
  private setBlock(view: BlockView, at: number | 'all' | 'none'): HTMLElement | undefined {
    if (at === 'all' && view.state === 'all') return undefined;
    if (at === 'none' && view.state === 'none') return undefined;
    const words = view.words;
    const n = words.length;
    let w = 0;
    let played = 0;
    let current = false;
    if (at === 'all') {
      w = n;
    } else if (at !== 'none') {
      while (w < n && words[w].start + words[w].text.length <= at) w++;
      if (w < n && at >= words[w].start) {
        const k = at - words[w].start;
        played = words[w].offs.findIndex(o => o >= k);
        current = true;
      }
    }

    if (w < view.lo) {
      for (let j = w; j <= view.hi; j++) this.setWord(words[j], 0, false);
      view.lo = w;
    } else {
      for (let j = view.lo; j < w; j++) this.setWord(words[j], words[j].chars.length, false);
      view.lo = w;
      for (let j = w + 1; j <= view.hi; j++) this.setWord(words[j], 0, false);
    }
    view.hi = Math.min(w, n - 1);
    view.state = at === 'all' ? 'all' : at === 'none' ? 'none' : 'partial';
    if (w >= n) return undefined;
    this.setWord(words[w], played, current);
    return words[w].el;
  }

  /** Draw the first `played` characters of a word as boxes, and mark the next one as current. */
  private setWord(word: WordView, played: number, current: boolean): void {
    const want = Math.min(word.chars.length, played + (current ? 1 : 0));
    if (word.spans.length === want && word.cur === (current ? played : -1)) return;
    while (word.spans.length < want) {
      const span = document.createElement('span');
      span.className = 'eb-c';
      const glyph = document.createElement('span');
      glyph.className = 'eb-ch';
      glyph.textContent = word.chars[word.spans.length];
      span.appendChild(glyph);
      word.el.insertBefore(span, word.tail);
      word.spans.push(span);
    }
    while (word.spans.length > want) word.spans.pop()?.remove();
    word.rest.data = word.text.slice(word.offs[want]);
    const cur = current && played < word.chars.length ? played : -1;
    if (word.cur !== cur) {
      word.spans[word.cur]?.classList.remove('eb-cur');
      word.spans[cur]?.classList.add('eb-cur');
      word.cur = cur;
    }
  }

  /** Scroll so the box is near the middle, a line at a time and smoothly (instantly the first time or over a long way); never above the start of the text. */
  private follow(el: HTMLElement): void {
    const scroll = this.scrollRef.nativeElement;
    if (scroll.clientHeight === 0) return;
    this.contentRef.nativeElement.style.setProperty('--eb-pad', `${scroll.clientHeight / 2}px`);
    const box = el.getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    const target = Math.max(0, box.top - view.top + scroll.scrollTop + box.height / 2 - scroll.clientHeight / 2);
    const distance = Math.abs(target - scroll.scrollTop);
    this.lineHeight ||= parseFloat(getComputedStyle(scroll).lineHeight) || 20;
    const line = this.lineHeight;
    if (distance < line * 0.6) return;
    const instant = this.reduceMotion || this.firstScroll || distance > scroll.clientHeight * 2;
    this.firstScroll = false;
    scroll.scrollTo({ top: target, behavior: instant ? 'auto' : 'smooth' });
  }
}

/** What is typed is upper case; under a lower-case letter of the book it is drawn lower case, so it matches the text. */
function lowerUnderLowercase(typed: string, glyph: string): string {
  const lower = glyph !== glyph.toUpperCase() && glyph === glyph.toLowerCase();
  return lower ? typed.toLowerCase() : typed;
}

/** The text position under a point on the page (the standard call, or the older WebKit one). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}
