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
    if (this.scrollListener && this.scrollContainer) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.scrollListener);
    }
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.kebab-btn'),
    );
  }

  /** Keep keyboard focus inside the Symbols Reference dialog. */
  onDialogKeydown(event: KeyboardEvent): void {
    trapDialogTabKey(event, this.host.nativeElement);
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
