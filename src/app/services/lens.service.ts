/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';
import { DisplayBufferService } from './display-buffer.service';

/** Who a Lens character belongs to, so it can be coloured and named like the conversation. */
export interface LensMeta {
  source: 'rx' | 'tx';
  /** Raw input name; the same fallback as the conversation lines is applied here. */
  name?: string;
  /** Optional colour override from the input. */
  color?: string;
}

/**
 * The single character Lens shows: its source, the symbols revealed so far
 * and, once known, the character itself.
 */
export interface LensFrame {
  /** Changes whenever a new character starts, so the view can restart its animation. */
  id: number;
  /** The input that produced the character (for example `decoder:mic`, `encoder`, `rtdb`). */
  owner: string;
  source: 'rx' | 'tx';
  name?: string;
  color?: string;
  /** Dots and dashes revealed so far. */
  pattern: string;
  /** The complete pattern when it is known in advance (sent text), used to centre the symbols. */
  planned: string;
  /** The character, or null while a keyed character has not been decoded yet. */
  char: string | null;
}

/**
 * Lens Service — holds the one character shown by the fullscreen Lens mode.
 *
 * Producers (the decoder for keyed and detected input, the encoder for typed
 * text and the RTDB playback for received text) report each element and the
 * decoded character. The latest active input owns the frame. Nothing is
 * recorded while Lens is off, and spaces never reach this service, so the
 * last character stays on screen until the next one starts.
 */
@Injectable({ providedIn: 'root' })
export class LensService {
  /** True while the fullscreen modal has Lens switched on. */
  readonly enabled = signal(false);

  /** The character on show, or null before anything was keyed or typed. */
  readonly frame = signal<LensFrame | null>(null);

  private nextId = 1;

  constructor(private displayBuffers: DisplayBufferService) {}

  /** Switch recording on or off; the previous character is dropped either way. */
  setEnabled(on: boolean): void {
    if (this.enabled() === on) return;
    this.enabled.set(on);
    this.frame.set(null);
  }

  /**
   * Show the symbols revealed so far for a character.
   * @param pattern  dots and dashes revealed so far
   * @param char     the character if already known, otherwise null
   * @param planned  the full pattern when known in advance
   */
  show(owner: string, meta: LensMeta, pattern: string, char: string | null, planned: string = pattern): void {
    if (!this.enabled()) return;
    const prev = this.frame();
    const isNew = !prev
      || prev.owner !== owner
      || pattern.length <= prev.pattern.length
      || (prev.char !== null && char !== prev.char);
    this.frame.set({
      id: isNew ? this.nextId++ : prev!.id,
      owner,
      source: meta.source,
      name: this.displayBuffers.displayNameFor(meta.source, meta.name),
      color: meta.color || undefined,
      pattern,
      planned,
      char,
    });
  }

  /**
   * Reveal the decoded character of the frame that this owner is showing.
   * Ignored when another input has taken over the screen in the meantime.
   */
  complete(owner: string, char: string): void {
    if (!this.enabled()) return;
    const prev = this.frame();
    if (!prev || prev.owner !== owner || prev.char !== null) return;
    this.frame.set({ ...prev, char });
  }

  /** Forget the current character (Clear, or Lens turned off). */
  reset(): void {
    if (this.frame() !== null) this.frame.set(null);
  }
}
