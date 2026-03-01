/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * A single tagged entry in a display buffer line.
 */
export interface DisplayEntry {
  type: 'rx' | 'tx';
  char: string;
  userName?: string;
}

/**
 * A conversation line — contiguous run of the same type.
 */
export interface DisplayLine {
  type: 'rx' | 'tx';
  text: string;
  userName?: string;
}

/**
 * Default FIFO capacity — approximately 2× a large screen of text.
 * At ~100 chars/line × 25 lines ≈ 2500 chars visible, ×2 = 5000.
 */
const DEFAULT_CAPACITY = 5000;

/**
 * An independent FIFO display buffer.
 *
 * Stores individual character entries and collapses them into
 * conversation lines (contiguous runs of the same type) for display.
 * When the total character count exceeds the capacity, the oldest
 * entries are dropped and the lines are recomputed.
 */
export class DisplayBuffer {
  /** Flat list of all character entries (FIFO source of truth) */
  private entries: DisplayEntry[] = [];
  /** Collapsed conversation lines (rebuilt from entries on mutation) */
  readonly lines = signal<DisplayLine[]>([]);
  /** Flat text for simple display (e.g. main decoder panel) */
  readonly text = signal('');
  /** Maximum number of character entries to keep */
  private capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  /** Append one or more characters. */
  push(type: 'rx' | 'tx', text: string, userName?: string): void {
    for (const char of text) {
      this.entries.push({ type, char, userName });
    }
    this.trim();
    this.rebuild();
  }

  /** Clear all content. */
  clear(): void {
    this.entries = [];
    this.rebuild();
  }

  /** Get the current entry count (for watermark tracking). */
  get length(): number {
    return this.entries.length;
  }

  /** Trim oldest entries if over capacity. */
  private trim(): void {
    if (this.entries.length > this.capacity) {
      this.entries = this.entries.slice(this.entries.length - this.capacity);
    }
  }

  /** Rebuild the lines and text signals from the entries array. */
  private rebuild(): void {
    const lines: DisplayLine[] = [];
    let flat = '';

    for (const entry of this.entries) {
      flat += entry.char;
      const last = lines.length > 0 ? lines[lines.length - 1] : null;
      if (last && last.type === entry.type && last.userName === entry.userName) {
        last.text += entry.char;
      } else {
        lines.push({ type: entry.type, text: entry.char, userName: entry.userName });
      }
    }

    this.lines.set(lines);
    this.text.set(flat);
  }
}

/**
 * Display Buffer Service — four independent FIFO display buffers.
 *
 * Each buffer receives characters from the same data sources but can
 * be cleared independently. Buffers survive component destruction
 * (e.g. fullscreen modal close/reopen) because they live in a
 * root-provided service.
 *
 * Buffers:
 *  - mainDecoder:       Main screen decoder panel (flat text)
 *  - mainEncoder:       Main screen encoder buffer display
 *  - fullscreenDecoder: Fullscreen decoder conversation log
 *  - fullscreenEncoder: Fullscreen encoder conversation log
 */
@Injectable({ providedIn: 'root' })
export class DisplayBufferService {
  readonly mainDecoder = new DisplayBuffer();
  readonly mainEncoder = new DisplayBuffer();
  readonly fullscreenDecoder = new DisplayBuffer();
  readonly fullscreenEncoder = new DisplayBuffer();

  /**
   * Push a decoded character to all relevant buffers.
   * Both fullscreen modes show decoded text in their conversation view.
   */
  pushDecoded(type: 'rx' | 'tx', char: string, userName?: string): void {
    this.mainDecoder.push(type, char, userName);
    this.fullscreenDecoder.push(type, char, userName);
    this.fullscreenEncoder.push(type, char, userName);
  }

  /**
   * Push a sent (encoder) character to all relevant buffers.
   * Both fullscreen modes show sent text in their conversation view.
   */
  pushSent(char: string, userName?: string): void {
    this.mainEncoder.push('tx', char, userName);
    this.fullscreenDecoder.push('tx', char, userName);
    this.fullscreenEncoder.push('tx', char, userName);
  }

  /** Clear all four display buffers at once. */
  clearAll(): void {
    this.mainDecoder.clear();
    this.mainEncoder.clear();
    this.fullscreenDecoder.clear();
    this.fullscreenEncoder.clear();
  }
}
