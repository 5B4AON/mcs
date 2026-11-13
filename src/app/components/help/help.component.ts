/**
 * Morse Code Studio
 */

/**
 * Help / Documentation component.
 *
 * Displays a fullscreen modal with structured, scrollable documentation
 * covering all features, settings, wiring options and configuration of
 * Morse Code Studio.  The document layout uses:
 *
 *  - A clickable Table of Contents at the top
 *  - Numbered chapters and sections with anchor IDs
 *  - A floating "↑ Help Home" button for quick navigation back to the top
 *
 * Content is written for amateur radio operators who may not be software
 * developers.
 */
import {
  Component,
  EventEmitter,
  Output,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { HelpChIntroComponent } from './help-ch-intro.component';
import { HelpChDecoderComponent } from './help-ch-decoder.component';
import { HelpChEncoderComponent } from './help-ch-encoder.component';
import { HelpChKeyersComponent } from './help-ch-keyers.component';
import { HelpChCalibrationComponent } from './help-ch-calibration.component';
import { HelpChInputsComponent } from './help-ch-inputs.component';
import { HelpChOutputsComponent } from './help-ch-outputs.component';
import { HelpChConfigComponent } from './help-ch-config.component';
import { HelpChReferenceComponent } from './help-ch-reference.component';
import { HelpChPwaComponent } from './help-ch-pwa.component';
import { HelpChFirebaseComponent } from './help-ch-firebase.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    HelpChIntroComponent,
    HelpChDecoderComponent,
    HelpChEncoderComponent,
    HelpChKeyersComponent,
    HelpChCalibrationComponent,
    HelpChInputsComponent,
    HelpChOutputsComponent,
    HelpChConfigComponent,
    HelpChReferenceComponent,
    HelpChPwaComponent,
    HelpChFirebaseComponent,
  ],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.css'],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Morse Code Studio Help',
    tabindex: '-1',
    '(keydown)': 'onDialogKeydown($event)',
  },
})
export class HelpComponent implements AfterViewInit, OnDestroy {
  /** Optional chapter to open when Help is launched from a contextual link. */
  @Input() initialSection: string | null = null;

  /** Visible trigger to focus if Help was opened from a menu that is now hidden. */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the user closes the Help modal. */
  @Output() closed = new EventEmitter<void>();

  /** Reference to the scrollable overlay container. */
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  /** Whether the floating "Help Home" button is visible. */
  showBackToTop = false;

  /** Whether the floating search bar is open. */
  searchOpen = false;

  /** The text being searched for. */
  searchQuery = '';

  /** Number of hits for the current query (capped at `MAX_HITS`). */
  hitCount = 0;

  /** Zero-based index of the hit that is selected, or -1 when there are none. */
  hitIndex = -1;

  /** True when the hit list was cut at `MAX_HITS`. */
  hitsCapped = false;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('searchButton') searchButton?: ElementRef<HTMLButtonElement>;

  private scrollListener: (() => void) | null = null;
  private hits: Range[] = [];
  private index: { text: string; nodes: Text[]; nodeAt: Int32Array; offsetAt: Int32Array } | null = null;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    focusDialog(this.host.nativeElement, '.help-close-btn');
    const el = this.scrollContainer.nativeElement;
    this.scrollListener = () => {
      this.showBackToTop = el.scrollTop > 300;
    };
    el.addEventListener('scroll', this.scrollListener, { passive: true });
    if (this.initialSection) {
      const section = this.initialSection;
      requestAnimationFrame(() => this.scrollTo(section, 'auto'));
    }
  }

  ngOnDestroy(): void {
    this.clearHighlights();
    if (this.scrollListener && this.scrollContainer) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.scrollListener);
    }
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.kebab-btn'),
    );
  }

  /**
   * Keep keyboard focus within Help while preserving existing close behavior.
   * Escape closes the search bar first (before the app-level handler sees it) and
   * Ctrl/Cmd+F opens it instead of the browser's own find bar.
   */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.searchOpen) {
      event.preventDefault();
      this.closeSearch();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    trapDialogTabKey(event, this.host.nativeElement);
  }

  /** Show the search bar (or focus it when already open) with the old query selected. */
  openSearch(): void {
    this.searchOpen = true;
    setTimeout(() => {
      const input = this.searchInput?.nativeElement;
      input?.focus();
      input?.select();
    });
    if (this.searchQuery) this.runSearch();
  }

  /** Hide the search bar, remove the highlights and give focus back to the search button. */
  closeSearch(): void {
    this.searchOpen = false;
    this.clearHighlights();
    this.hits = [];
    this.hitCount = 0;
    this.hitIndex = -1;
    setTimeout(() => this.searchButton?.nativeElement.focus());
  }

  /** Search field edited: look again, staying near the current hit while the word is still being typed. */
  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.runSearch();
  }

  /** Enter goes to the next hit, Shift+Enter to the previous one. */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.step(event.shiftKey ? -1 : 1);
  }

  /** Select the next (1) or previous (-1) hit, wrapping around at either end. */
  step(direction: 1 | -1): void {
    if (this.hits.length === 0) return;
    this.select((this.hitIndex + direction + this.hits.length) % this.hits.length);
  }

  /** Text shown beside the arrows, e.g. "3/48". */
  get hitLabel(): string {
    if (!this.searchQuery.trim()) return '';
    if (this.hitCount === 0) return '0/0';
    return `${this.hitIndex + 1}/${this.hitCount}${this.hitsCapped ? '+' : ''}`;
  }

  private static readonly MAX_HITS = 3000;
  private static readonly BLOCKS = 'p,li,td,th,h1,h2,h3,h4,pre,div,figcaption,summary,dt,dd,tr';

  /**
   * Text of the whole document collapsed to single spaces, with the text node and offset of every
   * character, so a hit may span inline markup such as "Keyer <strong>WPM</strong>". The contents
   * list is left out and a break is inserted between blocks so a hit never crosses two paragraphs.
   */
  private buildIndex() {
    const root = this.scrollContainer.nativeElement;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('.toc, script, style, svg')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    const nodeAt: number[] = [];
    const offsetAt: number[] = [];
    let text = '';
    let previousBlock: Element | null = null;
    let lastWasSpace = true;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const block = node.parentElement?.closest(HelpComponent.BLOCKS) ?? null;
      if (block !== previousBlock && !lastWasSpace) {
        text += '\n';
        nodeAt.push(nodes.length);
        offsetAt.push(0);
        lastWasSpace = true;
      }
      previousBlock = block;
      const index = nodes.length;
      nodes.push(node);
      const data = node.data;
      for (let i = 0; i < data.length; i++) {
        const isSpace = /\s/.test(data[i]);
        if (isSpace && lastWasSpace) continue;
        const lower = isSpace ? ' ' : data[i].toLowerCase();
        text += lower.length === 1 ? lower : data[i];
        nodeAt.push(index);
        offsetAt.push(i);
        lastWasSpace = isSpace;
      }
    }
    return { text, nodes, nodeAt: Int32Array.from(nodeAt), offsetAt: Int32Array.from(offsetAt) };
  }

  private runSearch(): void {
    const previous = this.hitIndex >= 0 ? this.hits[this.hitIndex] : undefined;
    this.clearHighlights();
    this.hits = [];
    this.hitsCapped = false;

    const query = this.searchQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    if (query) {
      this.index ??= this.buildIndex();
      const { text, nodes, nodeAt, offsetAt } = this.index;
      let from = text.indexOf(query);
      while (from !== -1) {
        if (this.hits.length >= HelpComponent.MAX_HITS) {
          this.hitsCapped = true;
          break;
        }
        const last = from + query.length - 1;
        const range = document.createRange();
        range.setStart(nodes[nodeAt[from]], offsetAt[from]);
        range.setEnd(nodes[nodeAt[last]], offsetAt[last] + 1);
        this.hits.push(range);
        from = text.indexOf(query, from + query.length);
      }
    }

    this.hitCount = this.hits.length;
    if (this.hits.length === 0) {
      this.hitIndex = -1;
      return;
    }
    this.select(this.firstHitFrom(previous));
  }

  /** First hit at or after the previous one; with no previous hit, the first one on screen or below. */
  private firstHitFrom(previous: Range | undefined): number {
    const found = this.hits.findIndex(hit => previous
      ? hit.compareBoundaryPoints(Range.START_TO_START, previous) >= 0
      : hit.getBoundingClientRect().top >= 60);
    return found === -1 ? 0 : found;
  }

  private select(index: number, scroll = true): void {
    this.hitIndex = index;
    this.paintHighlights();
    if (scroll) {
      this.hits[index].startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }

  private paintHighlights(): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    CSS.highlights.set('help-search', new Highlight(...this.hits));
    CSS.highlights.set('help-search-current', new Highlight(this.hits[this.hitIndex]));
  }

  private clearHighlights(): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    CSS.highlights.delete('help-search');
    CSS.highlights.delete('help-search-current');
  }

  /** Scroll to a given anchor ID within the document. */
  scrollTo(id: string, behavior: ScrollBehavior = 'smooth'): void {
    const target = this.scrollContainer.nativeElement.querySelector('#' + id);
    if (target) {
      target.scrollIntoView({ behavior, block: 'start' });
    }
  }

  /** Scroll back to the top of the document. */
  scrollToTop(): void {
    this.scrollContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
