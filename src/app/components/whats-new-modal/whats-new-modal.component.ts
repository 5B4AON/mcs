/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import { APP_VERSION, VERSION_HISTORY } from '../../version';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { BackdropClickDirective } from '../backdrop-click.directive';
import { BackCloseDirective } from '../back-close.directive';

/**
 * The "What's new" list opened by the button in Settings → Other → Application Updates: a
 * Settings-scale popup (like Presets) with the notes of the last versions that changed something
 * a user can notice, newest first (`VERSION_HISTORY` in `version.ts`). The class names
 * `settings-transfer-*` are those of the Presets dialog, so the shared iOS rules in `viewport.css`
 * apply to it as well.
 */
@Component({
  selector: 'app-whats-new-modal',
  standalone: true,
  imports: [BackdropClickDirective, BackCloseDirective],
  template: `
    <div class="settings-transfer-overlay" (appBackdropClick)="closed.emit()" [appBackClose]="backClose">
      <section #dialog class="settings-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="whats-new-title"
               tabindex="-1" (click)="$event.stopPropagation()" (keydown)="onKeydown($event)">
        <header class="settings-transfer-header">
          <h2 id="whats-new-title">What's new</h2>
          <button type="button" class="settings-close-btn" (click)="closed.emit()" aria-label="Close what's new" title="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <ul class="wn-list">
          @for (note of notes; track note.version) {
            <li class="wn-item">
              <h3 class="wn-version">
                v{{ note.version }}
                <time class="wn-date" [attr.datetime]="note.date">{{ note.date }}</time>
                @if (note.version === installed) {
                  <span class="wn-installed">Installed</span>
                }
              </h3>
              <p class="wn-text">{{ note.text }}</p>
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .settings-transfer-overlay {
      position: fixed; inset: 0;
      z-index: 8900; /* above Settings, below the confirm dialog (9000) */
      display: flex; align-items: center; justify-content: center;
      padding: 1rem; background: rgba(0, 0, 0, .72);
    }
    .settings-transfer-dialog {
      width: 100%; max-width: 640px; height: 92vh;
      display: flex; flex-direction: column; overflow: hidden;
      color: #dde; background: #1a1a2a; border: 1px solid #556; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .65);
    }
    .settings-transfer-header {
      display: flex; align-items: center; justify-content: space-between; gap: .75rem;
      padding: .75rem 1rem; flex-shrink: 0; border-bottom: 1px solid #38404a;
    }
    .settings-transfer-header h2 { margin: 0; color: #8cf; font-size: 1.1rem; }
    .settings-close-btn {
      width: 40px; height: 40px; min-width: 40px; padding: 0; flex-shrink: 0; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #8cf; background: #282c34; border: 1px solid #556; cursor: pointer;
      transition: background .15s;
    }
    .settings-close-btn svg { display: block; flex: none; width: 18px; height: 18px; }
    .settings-close-btn:hover { background: #3a4050; }
    .settings-close-btn:active { background: #5577aa; color: #fff; transform: scale(.92); }
    .settings-transfer-dialog button:focus-visible { outline: 2px solid #9cf; outline-offset: 2px; }
    .wn-list {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0; padding: .75rem 1rem;
      list-style: none; display: flex; flex-direction: column; gap: .6rem;
    }
    .wn-item { padding: .65rem .8rem; background: #20202f; border: 1px solid #38404a; border-radius: 10px; }
    .wn-version {
      display: flex; align-items: center; gap: .5rem; margin: 0 0 .25rem;
      font-size: .95rem; color: #8cf; font-variant-numeric: tabular-nums;
    }
    .wn-date { font-size: .78rem; font-weight: 400; color: #889; }
    .wn-installed {
      padding: .05rem .5rem; font-size: .7rem; font-weight: 600; color: #cfe;
      background: #2c5a44; border-radius: 10px;
    }
    .wn-text { margin: 0; font-size: .9rem; line-height: 1.5; color: #ccd; }
    @media (max-width: 480px) {
      .settings-transfer-overlay { padding: .75rem; }
      .settings-transfer-dialog { height: 92dvh; }
      .wn-list { padding: .75rem; }
    }
  `],
})
export class WhatsNewModalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  /** The close button, a click outside, Escape or the browser Back button */
  @Output() closed = new EventEmitter<void>();

  readonly notes = VERSION_HISTORY;
  readonly installed = APP_VERSION;

  readonly backClose = (): void => { this.closed.emit(); };

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.settings-close-btn');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /** Keep keyboard focus inside the dialog. */
  onKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }
}
