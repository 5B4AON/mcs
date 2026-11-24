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
import { DocumentSearch } from '../document-search';

/** The app's canonical web address (the Android app is bound to it). */
const APP_URL = 'https://morse-code-studio.web.app';

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
    '(click)': 'onContentClick($event)',
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

  /** Search state: query, hits and highlights (shared with the Symbols Reference). */
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

  /** Search field edited: look again, staying near the current hit while the word is still being typed. */
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

  /**
   * Handle the links inside the chapters: a `help-link` (`data-section`) scrolls to that section,
   * and the app's own web address (`help-app-url`) opens in the browser rather than inside the
   * installed Android app, which would otherwise claim it (the app is the verified handler of
   * that address). The intent asks Chrome for it and falls back to the plain address.
   */
  onContentClick(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest?.('a');
    if (!link) return;
    if (link.classList.contains('help-link')) {
      event.preventDefault();
      const section = link.getAttribute('data-section');
      if (section) this.scrollTo(section);
    } else if (link.classList.contains('help-app-url') && this.runsInInstalledAndroidApp()) {
      event.preventDefault();
      const url = link.getAttribute('href') ?? APP_URL;
      const host = url.replace(/^https?:\/\//, '');
      window.location.href = 'intent://' + host + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='
        + encodeURIComponent(url) + ';end';
    }
  }

  private runsInInstalledAndroidApp(): boolean {
    return /Android/i.test(navigator.userAgent) && window.matchMedia('(display-mode: standalone)').matches;
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
