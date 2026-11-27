/**
 * Morse Code Studio
 */

import { Injectable, computed, effect, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ConfirmService } from './confirm.service';
import { CwInputService } from './cw-input.service';
import { EbookService } from './ebook.service';
import { erasingProsigns, joinPhrases } from './prosign-erase';
import { SettingsService } from './settings.service';
import { cwDecoderOn } from './cw-decoder-state';
import { ViewportService } from './viewport.service';

/** An audio format a person may know by name, and how to ask the browser whether it can play it */
export interface AudioFormat {
  label: string;
  extensions: string[];
  /** MIME types for the file dialog's filter */
  types: string[];
  /** Types asked of `canPlayType()`; any answer other than "no" counts as supported */
  probes: string[];
}

const AUDIO_FORMATS: AudioFormat[] = [
  { label: 'MP3', extensions: ['.mp3'], types: ['audio/mpeg'], probes: ['audio/mpeg', 'audio/mp3'] },
  {
    label: 'M4A / AAC', extensions: ['.m4a', '.aac', '.mp4'], types: ['audio/mp4', 'audio/x-m4a', 'audio/aac'],
    probes: ['audio/mp4; codecs="mp4a.40.2"', 'audio/x-m4a', 'audio/aac'],
  },
  {
    label: 'Ogg Vorbis / Opus', extensions: ['.ogg', '.oga', '.opus'], types: ['audio/ogg', 'audio/opus'],
    probes: ['audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"', 'audio/opus'],
  },
  {
    label: 'WebM audio', extensions: ['.weba', '.webm'], types: ['audio/webm'],
    probes: ['audio/webm; codecs="opus"', 'audio/webm; codecs="vorbis"'],
  },
  { label: 'WAV', extensions: ['.wav'], types: ['audio/wav', 'audio/x-wav'], probes: ['audio/wav', 'audio/wave', 'audio/x-wav'] },
  { label: 'FLAC', extensions: ['.flac'], types: ['audio/flac', 'audio/x-flac'], probes: ['audio/flac', 'audio/x-flac'] },
  { label: 'AIFF', extensions: ['.aif', '.aiff'], types: ['audio/aiff', 'audio/x-aiff'], probes: ['audio/aiff', 'audio/x-aiff'] },
];

/** How long to wait for a file's details before going on (some phones read nothing until Play) */
const METADATA_WAIT_MS = 4000;

/**
 * Plays a recorded audio file through the CW tone detector, as if it came from
 * the microphone. The browser does the work: an `<audio>` element on a blob URL
 * streams the file from disk (so a big file is fine), decodes it in any format
 * the browser supports and seeks. `CwInputService.startFile()` routes the
 * element's sound to the speakers (the system default output only) and to the
 * unchanged detector. Nothing is cached or saved, and the microphone is off
 * while a file is loaded.
 *
 * Decoded text from a file stays on this device unless the CW detector's
 * "Decoder output" is set to the full pipeline.
 */
@Injectable({ providedIn: 'root' })
export class AudioFileService {
  /** A file is loaded (the player shows) */
  readonly loaded = signal(false);
  /** A file is being opened */
  readonly loading = signal(false);
  readonly fileName = signal('');
  readonly playing = signal(false);
  /** Seconds played */
  readonly position = signal(0);
  /** Seconds in the file, 0 while unknown (some recordings never say) */
  readonly duration = signal(0);
  /** Name of the last file loaded, kept while its text is on screen so Save can use it */
  readonly lastName = signal('');
  /** The slider can seek */
  readonly seekable = computed(() => this.duration() > 0);
  /** Fires after a file is unloaded, so the microphone can come back */
  readonly unloaded$ = new Subject<void>();
  /** Asks the app to open Settings on a card (the id is a landing of the Setup Wizard's goal list) */
  readonly settingsRequested$ = new Subject<string>();

  /** Not in Copy practice, Send practice or the e-book: they own the output and the keys */
  readonly allowed = computed(() => {
    const mode = this.settings.settings().encoderMode;
    return mode !== 'practice' && mode !== 'send-practice' && !this.ebook.active();
  });

  /** The Load button is offered: allowed here, and the CW Tone Decoder is chosen in the Mode list */
  readonly canLoad = computed(() => this.allowed() && cwDecoderOn(this.settings.settings()));

  private element: HTMLAudioElement | null = null;
  private url = '';
  private listeners: AbortController | null = null;
  private supported: AudioFormat[] | null = null;
  /** The erasing-prosigns warning was accepted for the loaded file */
  private prosignWarned = false;

  constructor(
    private settings: SettingsService,
    private cwInput: CwInputService,
    private confirm: ConfirmService,
    private viewport: ViewportService,
    private ebook: EbookService,
  ) {
    // Starting a practice mode or a book, or leaving the CW Decoder mode, ends the file
    effect(() => {
      if (this.loaded() && (!this.allowed() || !cwDecoderOn(this.settings.settings()))) void this.unload();
    });
  }

  /** The formats this browser says it can play */
  supportedFormats(): AudioFormat[] {
    if (!this.supported) {
      const probe = document.createElement('audio');
      this.supported = AUDIO_FORMATS.filter(f => f.probes.some(p => probe.canPlayType(p) !== ''));
    }
    return this.supported;
  }

  /** Extensions and types for the file dialog's filter; only a hint, users can still pick any file */
  acceptList(): string {
    const items = this.supportedFormats().flatMap(f => [...f.extensions, ...f.types]);
    return items.length ? [...new Set(items)].join(',') : 'audio/*';
  }

  /** The supported formats by name, for messages */
  supportedText(): string {
    const names = this.supportedFormats().map(f => f.label);
    return names.length ? names.join(', ') : 'none that it reports';
  }

  /** Open the browser's file dialog; the chosen file is loaded paused. */
  pick(): void {
    if (this.loading()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.acceptList();
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void this.open(file);
    });
    input.addEventListener('cancel', () => input.remove());
    document.body.appendChild(input);
    input.click();
  }

  /** Load a file and show the player, paused. Nothing plays until the user presses Play. */
  async open(file: File): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      if (!(await this.confirmFullPipeline())) return;
      if (this.loaded()) await this.unload();

      const element = new Audio();
      element.preload = 'metadata';
      const url = URL.createObjectURL(file);
      element.src = url;
      try {
        await this.whenReady(element);
      } catch {
        URL.revokeObjectURL(url);
        await this.notUnplayable(file.name);
        return;
      }

      try {
        await this.cwInput.startFile(element);
      } catch {
        URL.revokeObjectURL(url);
        this.unloaded$.next();
        await this.confirm.ask({
          title: 'Audio could not be started',
          message: `"${file.name}" could not be opened for decoding. The browser refused to start audio for it.`,
          confirmLabel: 'OK',
          singleAction: true,
        });
        return;
      }

      this.element = element;
      this.url = url;
      this.listen(element, file.name);
      this.fileName.set(file.name);
      this.lastName.set(file.name);
      this.prosignWarned = false;
      this.position.set(0);
      this.duration.set(Number.isFinite(element.duration) ? element.duration : 0);
      this.playing.set(false);
      this.loaded.set(true);
      this.setIosSession('playback');
    } finally {
      this.loading.set(false);
    }
  }

  /** Start or continue playing; the text is decoded as it plays. */
  async play(): Promise<void> {
    const element = this.element;
    if (!element) return;
    if (!(await this.confirmErasingProsigns())) return;
    if (this.element !== element) return;
    await this.cwInput.resumeFile();
    if (element.ended) {
      element.currentTime = 0;
      this.cwInput.resetFileDetector();
    }
    try {
      await element.play();
    } catch (error) {
      // A pause or a seek that interrupts the start is not a failure
      if ((error as { name?: string } | null)?.name === 'AbortError') return;
      await this.confirm.ask({
        title: 'The file did not start',
        message: 'The browser would not play this file. Press Play again, or stop and load it again.',
        confirmLabel: 'OK',
        singleAction: true,
      });
    }
  }

  pause(): void {
    this.element?.pause();
  }

  /** Jump to a time in the file. The detector starts over there. */
  seek(seconds: number): void {
    const element = this.element;
    if (!element) return;
    const limit = this.duration() > 0 ? this.duration() : seconds;
    element.currentTime = Math.max(0, Math.min(seconds, limit));
    this.position.set(element.currentTime);
    this.cwInput.resetFileDetector();
  }

  /** Unload the file and go back to the microphone; the decoded text stays on screen. */
  async stop(): Promise<void> {
    await this.unload();
  }

  /** Forget the file name once its text is gone and no file is loaded. */
  forgetName(): void {
    if (!this.loaded()) this.lastName.set('');
  }

  private async unload(): Promise<void> {
    const element = this.element;
    if (!element) return;
    this.element = null;
    this.listeners?.abort();
    this.listeners = null;
    element.pause();
    element.removeAttribute('src');
    element.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
    this.loaded.set(false);
    this.playing.set(false);
    this.position.set(0);
    this.duration.set(0);
    this.fileName.set('');
    await this.cwInput.stopFile();
    this.setIosSession('auto');
    this.unloaded$.next();
  }

  /**
   * A prosign that erases text (Clear Last Word, Clear Line, Clear Screen) in
   * a recording would remove decoded text, from the screen and from what Save
   * keeps. Before the first Play of a file, say so and offer Settings. Returns
   * false when the user chose to change the settings first (Back counts too).
   */
  private async confirmErasingProsigns(): Promise<boolean> {
    if (this.prosignWarned) return true;
    const erasing = erasingProsigns(this.settings.settings());
    if (!erasing.length) return true;
    const play = await this.confirm.ask({
      title: 'Prosigns can erase decoded text',
      message: `Your prosign actions are set so that ${joinPhrases(erasing)}. If the recording contains them, decoded text will be erased `
        + 'from the screen and from the text Save keeps. You can change this in Settings → Other → Prosign Actions.',
      confirmLabel: 'Play anyway',
      cancelLabel: 'Change in Settings',
      danger: true,
    });
    if (!play) {
      this.settingsRequested$.next('prosign-actions');
      return false;
    }
    this.prosignWarned = true;
    return true;
  }

  /** With the full pipeline chosen, loading a file can send its text to the outputs: ask first. */
  private async confirmFullPipeline(): Promise<boolean> {
    const s = this.settings.settings();
    if (s.cwOutputPipeline !== 'full') return true;
    const outputs: string[] = [];
    if (s.winkeyerEnabled) outputs.push('WinKeyer');
    if (s.midiOutputEnabled) outputs.push('MIDI output');
    if (s.rtdbOutputEnabled) outputs.push('Firebase RTDB');
    if (!outputs.length) return true;
    return this.confirm.ask({
      title: 'Send the text of this file to your outputs?',
      message: `Decoder output is set to Full pipeline. Text decoded from the file will be sent to: ${outputs.join(', ')}. `
        + 'Choose Cancel to keep it off them, then set Decoder output to "This device only" in Settings → Inputs → CW Tone Decoder.',
      confirmLabel: 'Load the file',
      cancelLabel: 'Cancel',
      danger: true,
    });
  }

  /** Resolves when the browser has read the file's details; rejects when it cannot play it. */
  private whenReady(element: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (fn: () => void) => {
        clearTimeout(timer);
        element.removeEventListener('loadedmetadata', onReady);
        element.removeEventListener('error', onError);
        fn();
      };
      const onReady = () => done(resolve);
      const onError = () => done(() => reject(new Error('unplayable')));
      // Some phones read nothing before Play; a file that fails then is caught by the error listener
      const timer = setTimeout(() => done(resolve), METADATA_WAIT_MS);
      element.addEventListener('loadedmetadata', onReady);
      element.addEventListener('error', onError);
      if (element.readyState >= 1) onReady();
    });
  }

  private listen(element: HTMLAudioElement, name: string): void {
    const ac = new AbortController();
    this.listeners = ac;
    const opts = { signal: ac.signal };
    element.addEventListener('timeupdate', () => this.position.set(element.currentTime), opts);
    element.addEventListener('durationchange', () => {
      this.duration.set(Number.isFinite(element.duration) ? element.duration : 0);
    }, opts);
    element.addEventListener('play', () => this.playing.set(true), opts);
    element.addEventListener('pause', () => this.playing.set(false), opts);
    element.addEventListener('ended', () => {
      this.playing.set(false);
      this.position.set(element.duration || element.currentTime);
    }, opts);
    element.addEventListener('error', () => {
      void this.unload().then(() => this.notUnplayable(name));
    }, opts);
  }

  private notUnplayable(name: string): Promise<boolean> {
    return this.confirm.ask({
      title: 'This file cannot be played',
      message: `"${name}" cannot be played by this browser. Formats this browser can play: ${this.supportedText()}.`,
      confirmLabel: 'OK',
      singleAction: true,
    });
  }

  /** iOS plays media regardless of the ring/silent switch only in a playback session */
  private setIosSession(type: 'playback' | 'auto'): void {
    if (!this.viewport.iosLayout) return;
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (!session) return;
    try { session.type = type; } catch { /* not settable here */ }
  }
}
