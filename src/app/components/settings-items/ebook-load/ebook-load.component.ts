/**
 * Morse Code Studio
 */

import { Component, inject } from '@angular/core';
import { EbookService } from '../../../services/ebook.service';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * The "load a book" controls shared by the Copy Practice and Send Practice cards: choose a file,
 * or remove it. There is one book for both modes. Loading reads a file on this device
 * and is only offered in Settings (a wizard draft has no running app to load into).
 */
@Component({
  selector: 'app-ebook-load',
  standalone: true,
  template: `
    @if (scope.isLive) {
      <div class="cw-hint">
        Read a book, article or your own notes. Text (.txt), Markdown (.md) and web page (.html) files work, in English.
        The file stays on this device and is read as you go.
      </div>
      <input #fileInput type="file" hidden accept=".txt,.text,.md,.markdown,.html,.htm,.xhtml,text/plain,text/markdown,text/html"
             (change)="onFileChosen($event)">
      @if (ebook.info(); as info) {
        <div class="cw-hint" role="status"><strong>Loaded:</strong> {{ info.name }} ({{ info.format }})</div>
      }
      @if (ebook.loading()) {
        <div class="cw-hint" role="status">Opening the file...</div>
      }
      @if (ebook.error()) {
        <div class="md-error" role="alert">{{ ebook.error() }}</div>
      }
      <button type="button" class="pill-btn pill-block" [disabled]="ebook.loading()" (click)="fileInput.click()">
        {{ ebook.loaded() ? 'Choose another file' : 'Choose file' }}
      </button>
      @if (ebook.loaded()) {
        <button type="button" class="pill-btn pill-block pill-danger" [disabled]="ebook.loading()" (click)="ebook.remove()">Remove book</button>
      }
    } @else {
      <div class="cw-hint">
        Choose the book in Settings, under Copy Practice or Send Practice, after the guide is applied.
      </div>
    }
  `,
  styles: [':host { display: contents; }'],
})
export class EbookLoadComponent {
  readonly scope = inject(SETTINGS_SCOPE);
  readonly ebook = inject(EbookService);

  /** Open the chosen file; the field is emptied so the same file can be chosen again. */
  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.ebook.loadFile(file);
  }
}
