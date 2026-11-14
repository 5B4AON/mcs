/**
 * Morse Code Studio
 */

import {
  Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation, effect, inject, signal, untracked,
} from '@angular/core';
import { EbookBlock } from '../../services/ebook-model';
import { EbookService } from '../../services/ebook.service';

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
  rest: Text;
  /** Index of the span marked as the current character, or -1 */
  cur: number;
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
 * position stays near the middle. While nothing is playing, a click or tap on the text moves the reading there.
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

  @ViewChild('scroll', { static: true }) private scrollRef!: ElementRef<HTMLElement>;
  @ViewChild('content', { static: true }) private contentRef!: ElementRef<HTMLElement>;

  /** Said to screen readers when the reading reaches the end */
  readonly status = signal('');

  private views = new Map<number, BlockView>();
  private drawn: unknown = null;
  private resize: ResizeObserver | null = null;
  private focusEl: HTMLElement | null = null;
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
    // A key pressed in Send practice brings the expected letter back to the middle, even when it did not move
    effect(() => {
      this.ebook.recenter();
      untracked(() => {
        if (this.focusEl) this.follow(this.focusEl);
      });
    });
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
    if (this.ebook.busy()) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed) return;
    const caret = caretAt(event.clientX, event.clientY);
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return;
    const blockEl = caret.node.parentElement?.closest<HTMLElement>('.eb-block');
    if (!blockEl) return;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
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
  }

  private build(index: number, block: EbookBlock): BlockView {
    const el = document.createElement(block.kind === 'h' ? 'h3' : 'p');
    el.className = `eb-block eb-${block.kind}`;
    el.dataset['block'] = String(index);
    const words: WordView[] = [];
    const re = /(\s+)|(\S+)/g;
    for (let m = re.exec(block.text); m; m = re.exec(block.text)) {
      if (m[1]) {
        el.appendChild(document.createTextNode(m[1]));
        continue;
      }
      const text = m[2];
      const box = document.createElement('span');
      box.className = text.length > LONG_WORD ? 'eb-w eb-long' : 'eb-w';
      const rest = document.createTextNode(text);
      box.appendChild(rest);
      el.appendChild(box);
      const chars = Array.from(text);
      const offs = [0];
      for (const c of chars) offs.push(offs[offs.length - 1] + c.length);
      words.push({ el: box, text, start: m.index, chars, offs, spans: [], rest, cur: -1 });
    }
    return { el, words, lo: 0, hi: -1, state: 'none' };
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
      span.textContent = word.chars[word.spans.length];
      word.el.insertBefore(span, word.rest);
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
