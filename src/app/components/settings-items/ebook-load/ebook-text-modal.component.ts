/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, computed, signal } from '@angular/core';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../../modal-accessibility';
import { BackdropClickDirective } from '../../backdrop-click.directive';
import { BackCloseDirective } from '../../back-close.directive';
import { CUSTOM_TEXT_MAX_CHARS } from '../../../services/ebook.service';

/**
 * The Custom text editor of E-book practice: a Settings-scale popup (like Presets) with one large box to
 * type or paste the text to practise with. It only collects the text; the card loads it and keeps this
 * popup open, showing the reason, when the text cannot be used. The class names `settings-transfer-*`
 * are those of the Presets dialog, so the shared iOS rules in `viewport.css` apply to it as well.
 */
@Component({
  selector: 'app-ebook-text-modal',
  standalone: true,
  imports: [BackdropClickDirective, BackCloseDirective],
  template: `
    <div class="settings-transfer-overlay" (appBackdropClick)="cancelled.emit()" [appBackClose]="backClose">
      <section #dialog class="settings-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="ebook-text-title"
               tabindex="-1" (click)="$event.stopPropagation()" (keydown)="onKeydown($event)">
        <header class="settings-transfer-header">
          <h2 id="ebook-text-title">Custom text</h2>
          <button type="button" class="settings-close-btn" (click)="cancelled.emit()" aria-label="Close custom text" title="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="settings-transfer-content ebt-content">
          <p class="ebt-hint">Type or paste the text to practise with. A blank line starts a new paragraph. The text stays on this device.</p>
          <textarea class="ebt-text" aria-label="Text to practise with" spellcheck="false" autocomplete="off"
                    placeholder="Type or paste your text here..." [value]="text()"
                    (input)="text.set($any($event.target).value)"></textarea>
          <div class="ebt-meta">
            <span [class.ebt-over]="tooLong()" role="status">{{ count() }} / {{ max }} characters</span>
          </div>
          @if (error) {
            <p class="ebt-error" role="alert">{{ error }}</p>
          }
        </div>
        <footer class="settings-transfer-footer ebt-footer">
          <button type="button" class="pill-btn" (click)="cancelled.emit()">Cancel</button>
          <button type="button" class="pill-btn pill-primary" [disabled]="busy || !canUse()" (click)="saved.emit(text())">Use text</button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .settings-transfer-overlay {
      position: fixed; inset: 0;
      z-index: 8900; /* above Settings and the wizard, below the confirm dialog (9000) that can follow */
      display: flex; align-items: center; justify-content: center;
      padding: 1rem; background: rgba(0, 0, 0, .72);
    }
    .settings-transfer-dialog {
      width: 100%; max-width: 640px; height: 92vh;
      display: flex; flex-direction: column; overflow: hidden;
      color: #dde; background: #1a1a2a; border: 1px solid #556; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .65);
    }
    .settings-transfer-header, .settings-transfer-footer {
      display: flex; align-items: center; justify-content: space-between; gap: .75rem;
      padding: .75rem 1rem; flex-shrink: 0;
    }
    .settings-transfer-header { border-bottom: 1px solid #38404a; }
    .settings-transfer-header h2 { margin: 0; color: #8cf; font-size: 1.1rem; }
    .settings-transfer-footer { border-top: 1px solid #38404a; justify-content: center; flex-wrap: wrap; }
    .settings-close-btn {
      width: 40px; height: 40px; min-width: 40px; padding: 0; flex-shrink: 0; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #8cf; background: #282c34; border: 1px solid #556; cursor: pointer;
      transition: background .15s;
    }
    .settings-close-btn svg { display: block; flex: none; width: 18px; height: 18px; }
    .settings-close-btn:hover { background: #3a4050; }
    .settings-close-btn:active { background: #5577aa; color: #fff; transform: scale(.92); }
    .settings-transfer-dialog button:focus-visible,
    .settings-transfer-dialog textarea:focus-visible { outline: 2px solid #9cf; outline-offset: 2px; }
    .ebt-content { flex: 1 1 auto; display: flex; flex-direction: column; gap: .5rem; min-height: 0; overflow-y: auto; padding: .75rem 1rem; }
    .ebt-hint { margin: 0; font-size: .85rem; line-height: 1.45; color: #aab; }
    .ebt-text {
      flex: 1 1 auto; min-height: 8rem; width: 100%; box-sizing: border-box; resize: none;
      padding: .6rem .75rem; font: inherit; font-size: 1rem; line-height: 1.5;
      color: #eef; background: #12121e; border: 1px solid #556; border-radius: 8px;
    }
    .ebt-meta { display: flex; justify-content: flex-end; font-size: .78rem; color: #889; }
    .ebt-over { color: #f66; }
    .ebt-error { margin: 0; font-size: .85rem; color: #f66; }
    @media (max-width: 480px) {
      .settings-transfer-overlay { padding: .75rem; }
      .settings-transfer-dialog { height: 92dvh; }
      .ebt-content { padding: .75rem; }
      .settings-transfer-footer { padding: .65rem .75rem; gap: .45rem; }
      .ebt-footer .pill-btn { flex: 1 1 6.5rem; min-width: 0; }
    }
  `],
})
export class EbookTextModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  /** The text to start from: the current custom text, or empty */
  @Input() initialText = '';

  /** Why the last attempt to use the text failed ('' when it did not) */
  @Input() error = '';

  /** True while the text is being opened */
  @Input() busy = false;

  /** Use text pressed */
  @Output() saved = new EventEmitter<string>();

  /** Cancel, the close button, a click outside or the browser Back button */
  @Output() cancelled = new EventEmitter<void>();

  readonly max = CUSTOM_TEXT_MAX_CHARS.toLocaleString('en-US');
  readonly text = signal('');
  readonly count = computed(() => this.text().length.toLocaleString('en-US'));
  readonly tooLong = computed(() => this.text().length > CUSTOM_TEXT_MAX_CHARS);
  readonly canUse = computed(() => !!this.text().trim() && !this.tooLong());

  readonly backClose = (): void => { this.cancelled.emit(); };

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngOnInit(): void {
    this.text.set(this.initialText);
  }

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, 'textarea');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /** Keep keyboard focus inside the dialog. */
  onKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }
}
