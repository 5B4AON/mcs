/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService, ProsignAction } from './settings.service';
import { PUNCTUATION_TO_PROSIGN } from '../morse-table';

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

  /**
   * Execute a prosign action on this buffer.
   *
   * Actions modify existing entries before rebuilding:
   *  - newLine:       appends a newline character
   *  - newParagraph:  appends two newline characters
   *  - clearLine:     removes entries back to the last newline (or start)
   *  - clearScreen:   clears all entries
   */
  applyProsignAction(action: ProsignAction, type: 'rx' | 'tx', userName?: string): void {
    switch (action) {
      case 'newLine':
        this.entries.push({ type, char: '\n', userName });
        break;
      case 'newParagraph':
        this.entries.push({ type, char: '\n', userName });
        this.entries.push({ type, char: '\n', userName });
        break;
      case 'clearLine': {
        // Remove entries back to the most recent newline (or start of buffer)
        let i = this.entries.length - 1;
        while (i >= 0 && this.entries[i].char !== '\n') {
          i--;
        }
        // Keep the newline itself (if found), remove everything after it
        this.entries.splice(i + 1);
        break;
      }
      case 'clearScreen':
        this.entries = [];
        break;
    }
    this.trim();
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

  constructor(private settings: SettingsService) {}

  /**
   * When true, the next whitespace character pushed to fullscreen buffers
   * is suppressed. Set after a prosign action so the decoder's word-gap
   * space doesn't appear at the start of a new line.
   */
  private suppressNextSpace = false;

  /**
   * Push a decoded character to all relevant buffers.
   * Both fullscreen modes show decoded text in their conversation view.
   * If the character is a prosign with an enabled action, the action
   * is applied to the fullscreen buffers instead of the raw text.
   */
  pushDecoded(type: 'rx' | 'tx', char: string, userName?: string): void {
    // Always push to main panel buffer (no action handling there)
    this.mainDecoder.push(type, char, userName);

    // Suppress the word-gap space that follows a prosign action
    if (this.suppressNextSpace && char === ' ') {
      this.suppressNextSpace = false;
      return;
    }

    // Check for prosign action on the fullscreen buffers
    const action = this.resolveProsignAction(char);
    if (action) {
      this.fullscreenDecoder.applyProsignAction(action, type, userName);
      this.fullscreenEncoder.applyProsignAction(action, type, userName);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.fullscreenDecoder.push(type, char, userName);
      this.fullscreenEncoder.push(type, char, userName);
    }
  }

  /**
   * Push a sent (encoder) character to all relevant buffers.
   * Both fullscreen modes show sent text in their conversation view.
   * If the character is a prosign with an enabled action, the action
   * is applied to the fullscreen buffers instead of the raw text.
   */
  pushSent(char: string, userName?: string): void {
    // Always push to main panel buffer (no action handling there)
    this.mainEncoder.push('tx', char, userName);

    // Suppress the word-gap space that follows a prosign action
    if (this.suppressNextSpace && char === ' ') {
      this.suppressNextSpace = false;
      return;
    }

    // Check for prosign action on the fullscreen buffers
    const action = this.resolveProsignAction(char);
    if (action) {
      this.fullscreenDecoder.applyProsignAction(action, 'tx', userName);
      this.fullscreenEncoder.applyProsignAction(action, 'tx', userName);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.fullscreenDecoder.push('tx', char, userName);
      this.fullscreenEncoder.push('tx', char, userName);
    }
  }

  /**
   * Resolve whether a character (or prosign string) should trigger a prosign action.
   *
   * Checks both direct prosign names (e.g. '<BK>') and punctuation equivalents
   * (e.g. '+' → '<AR>') against the user's prosign action configuration.
   *
   * @returns The action to perform, or null if no action applies
   */
  private resolveProsignAction(char: string): ProsignAction | null {
    const s = this.settings.settings();
    if (!s.prosignActionsEnabled) return null;

    // Direct prosign match (e.g. '<BK>', '<SK>', '<HH>')
    let prosignKey = char.startsWith('<') && char.endsWith('>') ? char : null;

    // Punctuation → prosign mapping (e.g. '+' → '<AR>', '=' → '<BT>')
    if (!prosignKey && char.length === 1) {
      prosignKey = PUNCTUATION_TO_PROSIGN[char] ?? null;
    }

    if (!prosignKey) return null;

    const entry = s.prosignActions[prosignKey];
    if (entry && entry.enabled) {
      return entry.action;
    }
    return null;
  }

  /** Clear all four display buffers at once. */
  clearAll(): void {
    this.mainDecoder.clear();
    this.mainEncoder.clear();
    this.fullscreenDecoder.clear();
    this.fullscreenEncoder.clear();
  }
}
