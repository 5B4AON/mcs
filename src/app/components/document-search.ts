/**
 * Morse Code Studio
 */

/**
 * In-page text search shared by the Help and Symbols Reference dialogs.
 *
 * Builds a whitespace-collapsed text index of a scrollable document (a hit may span inline
 * markup such as "Keyer <strong>WPM</strong>" but never two blocks), makes one `Range` per hit
 * and paints them with the CSS Custom Highlight API (`::highlight(help-search)` and
 * `help-search-current` in `src/styles.css`), so the document's DOM is never changed. Only the
 * dialog's own scroller moves when a hit is revealed.
 */
export class DocumentSearch {
  /** The text being searched for. */
  query = '';

  /** Number of hits for the current query (capped at `MAX_HITS`). */
  hitCount = 0;

  /** Zero-based index of the selected hit, or -1 when there are none. */
  hitIndex = -1;

  /** True when the hit list was cut at `MAX_HITS`. */
  hitsCapped = false;

  private hits: Range[] = [];
  private index: { text: string; nodes: Text[]; nodeAt: Int32Array; offsetAt: Int32Array } | null = null;

  private static readonly MAX_HITS = 3000;
  /** Fallback space from the top of the screen taken by the floating buttons and search bar */
  private static readonly BAR_CLEARANCE = 130;
  private static readonly BLOCKS = 'p,li,td,th,h1,h2,h3,h4,pre,div,figcaption,summary,dt,dd,tr';

  /**
   * @param scroller the scrollable element that holds the document text
   * @param bar the floating search bar, used to keep a revealed hit clear of it
   */
  constructor(
    private scroller: () => HTMLElement,
    private bar: () => HTMLElement | undefined,
  ) {}

  /** Text shown beside the arrows, e.g. "3/48". */
  get label(): string {
    if (!this.query.trim()) return '';
    if (this.hitCount === 0) return '0/0';
    return `${this.hitIndex + 1}/${this.hitCount}${this.hitsCapped ? '+' : ''}`;
  }

  /** Look for the current query again, staying near the selected hit while the word is still being typed. */
  run(): void {
    const previous = this.hitIndex >= 0 ? this.hits[this.hitIndex] : undefined;
    this.clearHighlights();
    this.hits = [];
    this.hitsCapped = false;

    const query = this.query.trim().replace(/\s+/g, ' ').toLowerCase();
    if (query) {
      this.index ??= this.buildIndex();
      const { text, nodes, nodeAt, offsetAt } = this.index;
      let from = text.indexOf(query);
      while (from !== -1) {
        if (this.hits.length >= DocumentSearch.MAX_HITS) {
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

  /** Select the next (1) or previous (-1) hit, wrapping around at either end. */
  step(direction: 1 | -1): void {
    if (this.hits.length === 0) return;
    this.select((this.hitIndex + direction + this.hits.length) % this.hits.length);
  }

  /** Remove the highlights and forget the hits (the query text is kept). */
  reset(): void {
    this.clearHighlights();
    this.hits = [];
    this.hitCount = 0;
    this.hitIndex = -1;
  }

  /** Remove the highlights from the page. */
  clearHighlights(): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    CSS.highlights.delete('help-search');
    CSS.highlights.delete('help-search-current');
  }

  /**
   * Text of the whole document collapsed to single spaces, with the text node and offset of every
   * character. The contents list is left out and a break is inserted between blocks.
   */
  private buildIndex() {
    const root = this.scroller();
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
      const block = node.parentElement?.closest(DocumentSearch.BLOCKS) ?? null;
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

  /** First hit at or after the previous one; with no previous hit, the first one on screen or below. */
  private firstHitFrom(previous: Range | undefined): number {
    const found = this.hits.findIndex(hit => previous
      ? hit.compareBoundaryPoints(Range.START_TO_START, previous) >= 0
      : hit.getBoundingClientRect().top >= 60);
    return found === -1 ? 0 : found;
  }

  private select(index: number): void {
    this.hitIndex = index;
    this.paintHighlights();
    this.revealHit(this.hits[index]);
  }

  /**
   * Scroll the text so the hit sits in the visible band below the search bar. Only the dialog's
   * scroller moves: `scrollIntoView` would also pan the page's visual viewport while the on-screen
   * keyboard is open, which pushes the floating search bar out of sight.
   */
  private revealHit(hit: Range): void {
    const scroller = this.scroller();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewBottom = viewTop + (vv?.height ?? window.innerHeight);
    // Below the bar as it is now (one row wide, two rows on a narrow screen), plus a margin
    const barBottom = this.bar()?.getBoundingClientRect().bottom ?? viewTop + DocumentSearch.BAR_CLEARANCE;
    const bandTop = Math.max(barBottom, viewTop) + 16;
    const bandBottom = viewBottom - 24;
    const rect = hit.getBoundingClientRect();
    if (rect.top >= bandTop && rect.bottom <= bandBottom) return;
    const wanted = bandTop + Math.max(0, bandBottom - bandTop) / 2;
    scroller.scrollTop += rect.top + rect.height / 2 - wanted;
  }

  private paintHighlights(): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    CSS.highlights.set('help-search', new Highlight(...this.hits));
    CSS.highlights.set('help-search-current', new Highlight(this.hits[this.hitIndex]));
  }
}
