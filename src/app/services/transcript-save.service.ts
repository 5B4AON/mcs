/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { ConfirmService } from './confirm.service';
import { DisplayBufferService, TRANSCRIPT_MAX_CHARS } from './display-buffer.service';
import { EbookService } from './ebook.service';
import { SettingsService } from './settings.service';

/** The save dialog of the File System Access API (not in the TypeScript DOM typings) */
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;

/**
 * Saves the on-screen text to a file on disk. The text comes from the main
 * output buffer's transcript, which keeps everything (not just the newest
 * 5000 characters the screen shows), up to a cap. Nothing is stored by the app.
 *
 * Save is for plain typing and decoding only: practice modes, the e-book and
 * hidden (blurred) text are exercises, so saving the text would give the
 * answers away. Lens, which exists only in full screen, is excluded by the view.
 */
@Injectable({ providedIn: 'root' })
export class TranscriptSaveService {
  /** True briefly after a save, for the button's "saved" look */
  readonly justSaved = signal(false);

  /** True while no practice mode, e-book or text blur is in use */
  readonly allowed = computed(() => {
    const s = this.settings.settings();
    return s.encoderMode !== 'practice' && s.encoderMode !== 'send-practice'
      && !this.ebook.active() && !s.textBlurEnabled;
  });

  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  /** The near-cap warning was shown for the current fill (re-armed by Clear) */
  private warned = false;

  constructor(
    private settings: SettingsService,
    private displayBuffers: DisplayBufferService,
    private ebook: EbookService,
    private confirm: ConfirmService,
  ) {
    effect(() => {
      const near = this.displayBuffers.mainOutput.nearCap();
      untracked(() => {
        if (!near) { this.warned = false; return; }
        if (this.warned) return;
        this.warned = true;
        void this.warnNearCap();
      });
    });
  }

  /**
   * Save the whole transcript as a UTF-8 text file. Where the browser offers a
   * save dialog (File System Access API: Chrome, Edge and Opera on desktop) the
   * user picks the name and folder; elsewhere the file goes to the downloads
   * folder. The text is taken at the click, so what is saved is what was on screen.
   */
  async save(): Promise<void> {
    const text = this.displayBuffers.mainOutput.transcript();
    if (!text) return;
    const name = this.fileName(new Date());
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker.call(window, {
          suggestedName: name,
          types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        await writable.close();
        this.markSaved();
        return;
      } catch (error) {
        // Closing the dialog is a decision, not a failure
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
        // Any other refusal (a blocked frame, no permission): use the download instead
      }
    }

    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    this.markSaved();
  }

  private markSaved(): void {
    this.justSaved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.justSaved.set(false), 1800);
  }

  /** `morse-YYYY-MM-DD-HHMMSS.txt` in local time */
  private fileName(now: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `morse-${date}-${time}.txt`;
  }

  /** The kept text is 90 % full: tell the user the oldest text will soon be lost. */
  private async warnNearCap(): Promise<void> {
    const canSave = this.allowed();
    const message = `The text kept for saving (${TRANSCRIPT_MAX_CHARS.toLocaleString()} characters, about 48 hours at 25 WPM) is 90 % full. `
      + 'Once it is full, the oldest text is lost. '
      + (canSave
        ? 'Save the text and clear the screen to keep everything.'
        : 'Clear the screen to start again.');
    const save = await this.confirm.ask({
      title: 'Text buffer almost full',
      message,
      confirmLabel: canSave ? 'Save now' : 'OK',
      cancelLabel: 'Later',
      singleAction: !canSave,
    });
    if (save && canSave) void this.save();
  }
}
