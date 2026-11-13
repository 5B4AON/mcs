/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { EbookService } from '../../services/ebook.service';
import { EbookChapter } from '../../services/ebook-epub';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { BackdropClickDirective } from '../backdrop-click.directive';
import { BackCloseDirective } from '../back-close.directive';

/**
 * Book dialog — where you are in the e-book and how to move: the page (about 1,500 characters, so the
 * number does not depend on the screen), a slider and a number box to jump to another page, and Start over.
 * The page count is an estimate for text and Markdown files ("about"), exact for a web page. A jump lands
 * on the start of a paragraph. Opened from the Book button of the e-book reader.
 */
@Component({
  selector: 'app-book-dialog',
  standalone: true,
  imports: [BackdropClickDirective, BackCloseDirective],
  templateUrl: './book-dialog.component.html',
  styleUrl: './book-dialog.component.css',
})
export class BookDialogComponent implements AfterViewInit, OnDestroy {
  readonly ebook = inject(EbookService);

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** The close button, Escape, a click outside or the browser Back button */
  @Output() closed = new EventEmitter<void>();

  /** The page chosen with the slider or the number box */
  readonly target = signal(this.ebook.page());

  /** Back closes the dialog */
  readonly backClose = (): void => { this.closed.emit(); };

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.bk-close-btn');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }

  /** A page typed in the number box; kept inside the book. */
  onNumber(event: Event): void {
    const value = Math.round(+(event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.target.set(Math.min(Math.max(1, value), this.ebook.totalPages()));
  }

  onSlider(event: Event): void {
    this.target.set(+(event.target as HTMLInputElement).value);
  }

  /** Move the reading to the chosen page and close, unless there is no text there. */
  async go(): Promise<void> {
    await this.ebook.jumpToPage(this.target());
    if (!this.ebook.error()) this.closed.emit();
  }

  /** True for the chapter the reading is in. */
  isCurrentChapter(index: number): boolean {
    const chapters = this.ebook.chapters();
    const at = this.ebook.readingOffset();
    return chapters[index].offset <= at && (index + 1 >= chapters.length || at < chapters[index + 1].offset);
  }

  /** Go to the start of a chapter and close. */
  async goChapter(chapter: EbookChapter): Promise<void> {
    await this.ebook.jumpToChapter(chapter);
    if (!this.ebook.error()) this.closed.emit();
  }

  async startOver(): Promise<void> {
    await this.ebook.startOver();
    if (!this.ebook.error()) this.closed.emit();
  }
}
