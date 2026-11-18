/**
 * Morse Code Studio
 */

/**
 * Symbols Reference component.
 *
 * Displays a fullscreen modal with comprehensive reference tables for
 * International Morse Code characters, common CW abbreviations, prosigns,
 * Q-codes and 92 codes. Follows the same layout pattern as the Help modal
 * with a clickable Table of Contents and floating back-to-top navigation.
 */
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { DocumentSearch } from '../document-search';

@Component({
  selector: 'app-symbols-ref',
  standalone: true,
  imports: [],
  templateUrl: './symbols-ref.component.html',
  styleUrls: ['./symbols-ref.component.css'],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'symbols-ref-title',
    tabindex: '-1',
    '(keydown)': 'onDialogKeydown($event)',
  },
})
export class SymbolsRefComponent implements AfterViewInit, OnDestroy {
  /** Visible trigger to focus if the original control is hidden when the dialog closes. */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the user closes the modal. */
  @Output() closed = new EventEmitter<void>();

  /** Reference to the scrollable overlay container. */
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  /** Whether the floating back-to-top button is visible. */
  showBackToTop = false;

  /** Whether the floating search bar is open. */
  searchOpen = false;

  /** Search state: query, hits and highlights (shared with Help). */
  readonly search = new DocumentSearch(
    () => this.scrollContainer.nativeElement,
    () => this.searchBar?.nativeElement,
  );

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('searchBar') searchBar?: ElementRef<HTMLElement>;
  @ViewChild('searchButton') searchButton?: ElementRef<HTMLButtonElement>;

  private scrollListener: (() => void) | null = null;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    focusDialog(this.host.nativeElement, '.ref-close-btn');
    const el = this.scrollContainer.nativeElement;
    this.scrollListener = () => {
      this.showBackToTop = el.scrollTop > 300;
    };
    el.addEventListener('scroll', this.scrollListener, { passive: true });
  }

  ngOnDestroy(): void {
    this.search.clearHighlights();
    if (this.scrollListener && this.scrollContainer) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.scrollListener);
    }
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.kebab-btn'),
    );
  }

  /**
   * Keep keyboard focus inside the Symbols Reference dialog. Escape closes the search bar first
   * (before the app-level handler sees it) and Ctrl/Cmd+F opens it instead of the browser's find bar.
   */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.searchOpen) {
      event.preventDefault();
      this.closeSearch();
      return;
    }
    if (this.handleFindKey(event)) return;
    trapDialogTabKey(event, this.host.nativeElement);
  }

  /**
   * Find shortcuts: Ctrl/Cmd+F opens the search bar (instead of the browser's find bar); F3 or Ctrl/Cmd+G
   * opens it when closed, otherwise goes to the next hit, and with Shift to the previous one.
   * Also called by the app for these keys when focus is outside the dialog. Returns true when handled.
   */
  handleFindKey(event: KeyboardEvent): boolean {
    if (event.altKey) return false;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'f') {
      event.preventDefault();
      this.openSearch();
      return true;
    }
    if (event.key === 'F3' || (mod && key === 'g')) {
      event.preventDefault();
      if (this.searchOpen) this.search.step(event.shiftKey ? -1 : 1);
      else this.openSearch();
      return true;
    }
    return false;
  }

  /** Show the search bar (or focus it when already open) with the old query selected. */
  openSearch(): void {
    this.searchOpen = true;
    setTimeout(() => {
      const input = this.searchInput?.nativeElement;
      input?.focus({ preventScroll: true });
      input?.select();
    });
    if (this.search.query) this.search.run();
  }

  /** Hide the search bar, remove the highlights and give focus back to the search button. */
  closeSearch(): void {
    this.searchOpen = false;
    this.search.reset();
    setTimeout(() => this.searchButton?.nativeElement.focus());
  }

  /** Search field edited: look again. */
  onSearchInput(value: string): void {
    this.search.query = value;
    this.search.run();
  }

  /** Enter goes to the next hit, Shift+Enter to the previous one. */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.search.step(event.shiftKey ? -1 : 1);
  }

  /** Scroll to a given anchor ID within the document. */
  scrollTo(id: string): void {
    const target = this.scrollContainer.nativeElement.querySelector('#' + id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Scroll back to the top of the document. */
  scrollToTop(): void {
    this.scrollContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
