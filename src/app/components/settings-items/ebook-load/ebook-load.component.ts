/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject, signal } from '@angular/core';
import { EbookInfo, EbookLoadResult, EbookService } from '../../../services/ebook.service';
import { SETTINGS_SCOPE } from '../settings-scope';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { EbookTextModalComponent } from './ebook-text-modal.component';

/**
 * The "load a book" controls shared by the Copy Practice and Send Practice cards: choose a file, type or
 * paste a custom text, or remove it, with the loaded book shown above them. There is one book for both modes. Loading reads a file on this device
 * and is only offered in Settings (a wizard draft has no running app to load into).
 */
@Component({
  selector: 'app-ebook-load',
  standalone: true,
  imports: [HelpLinkButtonComponent, EbookTextModalComponent],
  template: `
    @if (scope.isLive || anywhere) {
      <div class="cw-hint">
        Read a book, article or your own notes, in English: a text (.txt), Markdown (.md), web page (.html) or EPUB (.epub) file, your own text with Custom text, or a web address (many sites do not allow this).
        Files stay on this device, and the last book reopens where you stopped.
        @if (scope.isLive) {
          <app-help-link-button section="s3-7" label="Help: E-book practice" />
        }
      </div>
      <input #fileInput type="file" hidden accept=".txt,.text,.md,.markdown,.html,.htm,.xhtml,.epub,text/plain,text/markdown,text/html,application/epub+zip"
             (change)="onFileChosen($event)">
      <div class="eb-loaded-label"><strong>Loaded:</strong></div>
      <div class="eb-loaded-row" role="status">
        @if (ebook.info(); as info) {
          <span class="eb-loaded-text" [title]="loadedText(info)">{{ loadedText(info) }}</span>
        } @else {
          <span class="eb-loaded-text eb-none">Nothing loaded</span>
        }
        <button type="button" class="pill-btn pill-danger eb-remove" [style.visibility]="ebook.loaded() ? 'visible' : 'hidden'"
                [disabled]="ebook.loading()" aria-label="Remove book" title="Remove book" (click)="ebook.remove()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      @if (ebook.loading()) {
        <div class="cw-hint" role="status">Opening the book...</div>
      }
      @if (ebook.error()) {
        <div class="md-error" role="alert">{{ ebook.error() }}</div>
      }
      <div class="eb-load-row">
        <button type="button" class="pill-btn" [disabled]="ebook.loading()" (click)="fileInput.click()">Choose file</button>
        <button type="button" class="pill-btn" [disabled]="ebook.loading()" (click)="openText()">Custom text</button>
      </div>
      <div class="eb-load-row eb-url-row">
        <input type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Or a web address: https://..." aria-label="Web address of a text file or page"
               [class.eb-url-loaded]="addressIsLoaded()"
               [value]="addressShown()" [disabled]="ebook.loading()"
               (input)="typed.set($any($event.target).value)" (keydown.enter)="onLoadUrl()">
        <button type="button" class="pill-btn" [disabled]="ebook.loading() || !addressShown().trim() || addressIsLoaded()" (click)="onLoadUrl()">Load</button>
      </div>
      @if (textOpen()) {
        <app-ebook-text-modal [initialText]="ebook.customText() ?? ''" [error]="textError()" [busy]="ebook.loading()"
                              (saved)="onTextSaved($event)" (cancelled)="closeText()" />
      }
    } @else {
      <div class="cw-hint">
        Choose the book in Settings, under Copy Practice or Send Practice, after the guide is applied.
      </div>
    }
  `,
  // The pills share one row, even on a 320 px screen
  styles: [`
    :host { display: contents; }
    .eb-loaded-label { margin-top: .6rem; font-size: .85rem; }
    .eb-loaded-row { display: flex; align-items: center; gap: .5rem; min-height: 40px; }
    .eb-loaded-text { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; color: #ddd; }
    .eb-loaded-text.eb-none { color: #888; }
    .eb-loaded-row .eb-remove.pill-btn {
      flex: 0 0 40px; width: 40px; height: 40px; min-width: 0; padding: 0; border-radius: 50%;
    }
    .eb-url-row input.eb-url-loaded:not(:focus) { color: #889; }
    .eb-load-row { display: flex; justify-content: center; gap: .5rem; margin-top: .6rem; }
    .eb-load-row .pill-btn { flex: 0 1 auto; min-width: 0; padding-inline: .9rem; white-space: nowrap; }
    .eb-url-row { align-items: center; margin-bottom: .2rem; }
    .eb-url-row input {
      flex: 1 1 0; min-width: 0;
    }
    .eb-url-row .pill-btn { min-width: 0; }
  `],
})
export class EbookLoadComponent {
  /** Which practice card the controls are in: Resume then takes the learner back to that practice */
  @Input({ required: true }) kind!: 'copy' | 'send';

  /**
   * A wizard step may load the book too. The book is not a setting, so it is loaded at once (like Settings does)
   * and is not part of the guide's Apply or Revert; the Resume question then only keeps the place, because
   * the guide's own Apply decides what the main screen does.
   */
  @Input() anywhere = false;

  readonly scope = inject(SETTINGS_SCOPE);
  readonly ebook = inject(EbookService);

  /** The Custom text editor is open, and why its last attempt failed */
  readonly textOpen = signal(false);
  readonly textError = signal('');

  /** The web address typed so far, null while the box just shows the loaded address */
  readonly typed = signal<string | null>(null);

  /** What the address box holds: the typed text, otherwise the address of the loaded book (kept across reloads by the service) */
  readonly addressShown = computed(() => this.typed() ?? this.ebook.info()?.href ?? '');

  /** The box shows the loaded address unchanged (dimmed until it has focus) */
  readonly addressIsLoaded = computed(() => this.typed() === null && !!this.ebook.info()?.href);

  /** The status text: name, format and the host of a web address */
  loadedText(info: EbookInfo): string {
    return `${info.name} (${info.format}${info.origin ? ', ' + info.origin : ''})`;
  }

  /** Load the web address (only ever from this click or Enter). */
  async onLoadUrl(): Promise<void> {
    const text = this.addressShown().trim();
    if (!text || this.addressIsLoaded()) return;
    const result = await this.ebook.loadUrl(text);
    if (result !== 'failed') this.typed.set(null);
    this.announceResumed(result);
  }

  /** Open the Custom text editor (it shows the current custom text when that is the loaded book). */
  openText(): void {
    this.textError.set('');
    this.textOpen.set(true);
  }

  /** Close the editor without using the text; a failed attempt's message goes with it. */
  closeText(): void {
    if (this.textError()) this.ebook.error.set('');
    this.textOpen.set(false);
  }

  /** Use the typed or pasted text as the book. The editor stays open, with the reason, when it cannot be used. */
  async onTextSaved(text: string): Promise<void> {
    if (text === this.ebook.customText()) {
      this.textOpen.set(false);
      return;
    }
    const result = await this.ebook.loadText(text);
    if (result === 'failed') {
      this.textError.set(this.ebook.error());
      return;
    }
    this.textOpen.set(false);
    this.announceResumed(result);
  }

  /** Open the chosen file; the field is emptied so the same file can be chosen again. */
  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.announceResumed(await this.ebook.loadFile(file));
  }

  /** After Resume in live Settings the app goes back to the practice; a wizard step leaves that to the guide's Apply. */
  private announceResumed(result: EbookLoadResult): void {
    if (result === 'resumed' && this.scope.isLive) this.ebook.resumed$.next(this.kind);
  }
}
