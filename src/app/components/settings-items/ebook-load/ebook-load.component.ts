/**
 * Morse Code Studio
 */

import { Component, Input, inject, signal } from '@angular/core';
import { EbookService } from '../../../services/ebook.service';
import { SETTINGS_SCOPE } from '../settings-scope';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';

/**
 * The "load a book" controls shared by the Copy Practice and Send Practice cards: choose a file,
 * or remove it. There is one book for both modes. Loading reads a file on this device
 * and is only offered in Settings (a wizard draft has no running app to load into).
 */
@Component({
  selector: 'app-ebook-load',
  standalone: true,
  imports: [HelpLinkButtonComponent],
  template: `
    @if (scope.isLive) {
      <div class="cw-hint">
        Read a book, article or your own notes. Text (.txt), Markdown (.md), web page (.html) and EPUB (.epub) files work, in English.
        <app-help-link-button section="s3-7" label="Help: E-book practice" />
        A file stays on this device and is read as you go, and the last book opens again by itself where you stopped; a web address is fetched by your browser straight from that site, and many sites do not allow that.
      </div>
      <input #fileInput type="file" hidden accept=".txt,.text,.md,.markdown,.html,.htm,.xhtml,.epub,text/plain,text/markdown,text/html,application/epub+zip"
             (change)="onFileChosen($event)">
      @if (ebook.info(); as info) {
        <div class="cw-hint" role="status">
          <strong>Loaded:</strong> {{ info.name }} ({{ info.format }}{{ info.origin ? ', ' + info.origin : '' }})
        </div>
      }
      @if (ebook.loading()) {
        <div class="cw-hint" role="status">Opening the book...</div>
      }
      @if (ebook.error()) {
        <div class="md-error" role="alert">{{ ebook.error() }}</div>
      }
      <div class="eb-load-row">
        <button type="button" class="pill-btn" [disabled]="ebook.loading()" (click)="fileInput.click()">Choose file</button>
        @if (ebook.loaded()) {
          <button type="button" class="pill-btn pill-danger" [disabled]="ebook.loading()" aria-label="Remove book" title="Remove book"
                  (click)="ebook.remove()">Remove</button>
        }
      </div>
      <div class="eb-load-row eb-url-row">
        <input type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Or a web address: https://..." aria-label="Web address of a text file or page"
               [value]="address()" [disabled]="ebook.loading()"
               (input)="address.set($any($event.target).value)" (keydown.enter)="onLoadUrl()">
        <button type="button" class="pill-btn" [disabled]="ebook.loading() || !address().trim()" (click)="onLoadUrl()">Load</button>
      </div>
    } @else {
      <div class="cw-hint">
        Choose the book in Settings, under Copy Practice or Send Practice, after the guide is applied.
      </div>
    }
  `,
  // The two pills share one row, even on a 320 px screen
  styles: [`
    :host { display: contents; }
    .eb-load-row { display: flex; justify-content: center; gap: .5rem; margin-top: .6rem; }
    .eb-load-row .pill-btn { flex: 0 1 auto; min-width: 0; padding-inline: .9rem; white-space: nowrap; }
    .eb-url-row { align-items: center; margin-bottom: .2rem; }
    .eb-url-row input {
      flex: 1 1 0; min-width: 0; box-sizing: border-box; padding: .35rem .5rem; font-size: .85rem;
      background: #222; color: #ddd; border: 1px solid #555; border-radius: 4px;
    }
    .eb-url-row .pill-btn { min-width: 0; }
  `],
})
export class EbookLoadComponent {
  /** Which practice card the controls are in: Resume then takes the learner back to that practice */
  @Input({ required: true }) kind!: 'copy' | 'send';

  readonly scope = inject(SETTINGS_SCOPE);
  readonly ebook = inject(EbookService);

  /** The web address typed so far */
  readonly address = signal('');

  /** Load the web address (only ever from this click or Enter). */
  async onLoadUrl(): Promise<void> {
    const text = this.address().trim();
    if (!text) return;
    const result = await this.ebook.loadUrl(text);
    if (result !== 'failed') this.address.set('');
    if (result === 'resumed') this.ebook.resumed$.next(this.kind);
  }

  /** Open the chosen file; the field is emptied so the same file can be chosen again. */
  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file && await this.ebook.loadFile(file) === 'resumed') this.ebook.resumed$.next(this.kind);
  }
}
