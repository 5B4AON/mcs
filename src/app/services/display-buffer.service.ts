/**
 * Morse Code Studio
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
  name?: string;
  color?: string;
}

/**
 * A conversation line — contiguous run of the same type.
 */
export interface DisplayLine {
  type: 'rx' | 'tx';
  text: string;
  name?: string;
  color?: string;
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
  /** Flat text for simple display (e.g. main output panel) */
  readonly text = signal('');
  /** Maximum number of character entries to keep */
  private capacity: number;
  /**
   * When true, a newline is inserted in the flat text whenever the
   * source type (RX/TX) changes — producing a conversation-style
   * layout in the main output panel.
   */
  private conversationNewlines: boolean;

  constructor(capacity = DEFAULT_CAPACITY, conversationNewlines = false) {
    this.capacity = capacity;
    this.conversationNewlines = conversationNewlines;
  }

  /** Append one or more characters. */
  push(type: 'rx' | 'tx', text: string, name?: string, color?: string): void {
    for (const char of text) {
      this.entries.push({ type, char, name, color });
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
   * When a prosign label is provided, it is rendered into the buffer so
   * the user can see which prosign triggered the action:
   *  - newLine / newParagraph: label appears at end of the current line
   *  - clearLastWord / clearLine / clearScreen: label is not shown
   *
   * Actions modify existing entries before rebuilding:
   *  - newLine:        appends a newline character
   *  - newParagraph:   appends two newline characters
   *  - clearLastWord:  removes entries back to the last space/newline boundary
   *  - clearLine:      removes entries back to the last newline (or start)
   *  - clearScreen:    clears all entries
   */
  applyProsignAction(action: ProsignAction, type: 'rx' | 'tx', name?: string, prosignLabel?: string, color?: string): void {
    switch (action) {
      case 'newLine':
        if (prosignLabel) {
          for (const ch of prosignLabel) {
            this.entries.push({ type, char: ch, name, color });
          }
        }
        this.entries.push({ type, char: '\n', name, color });
        break;
      case 'newParagraph':
        if (prosignLabel) {
          for (const ch of prosignLabel) {
            this.entries.push({ type, char: ch, name, color });
          }
        }
        this.entries.push({ type, char: '\n', name, color });
        this.entries.push({ type, char: '\n', name, color });
        break;
      case 'clearLastWord': {
        // Remove entries back to the most recent space or newline (including trailing space)
        let i = this.entries.length - 1;
        // Skip trailing spaces
        while (i >= 0 && this.entries[i].char === ' ') {
          i--;
        }
        // Skip word characters back to space/newline boundary
        while (i >= 0 && this.entries[i].char !== ' ' && this.entries[i].char !== '\n') {
          i--;
        }
        // Keep the boundary character (space/newline) if found, remove everything after
        this.entries.splice(i + 1);
        break;
      }
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
    let lastType: 'rx' | 'tx' | null = null;
    let lastName: string | undefined = undefined;

    for (const entry of this.entries) {
      // Insert newline when source type or name changes (conversation-style)
      if (this.conversationNewlines && lastType !== null
          && (entry.type !== lastType || entry.name !== lastName)
          && entry.char !== '\n' && !flat.endsWith('\n')) {
        flat += '\n';
      }
      lastType = entry.type;
      lastName = entry.name;
      flat += entry.char;
      const last = lines.length > 0 ? lines[lines.length - 1] : null;
      if (last && last.type === entry.type && last.name === entry.name && last.color === entry.color) {
        last.text += entry.char;
      } else {
        lines.push({ type: entry.type, text: entry.char, name: entry.name, color: entry.color });
      }
    }

    this.lines.set(lines);
    this.text.set(flat);
  }
}

/**
 * Display Buffer Service — three independent FIFO display buffers.
 *
 * Each buffer receives characters from the same data sources but can
 * be cleared independently. Buffers survive component destruction
 * (e.g. fullscreen modal close/reopen) because they live in a
 * root-provided service.
 *
 * Buffers:
 *  - mainOutput:        Main screen output panel (flat text with conversation newlines)
 *  - fullscreenDecoder: Fullscreen decoder conversation log
 *  - fullscreenEncoder: Fullscreen encoder conversation log
 */
@Injectable({ providedIn: 'root' })
export class DisplayBufferService {
  readonly mainOutput = new DisplayBuffer(DEFAULT_CAPACITY, true);
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
   * Both fullscreen modes and main panel show decoded text.
   * If the character is a prosign with an enabled action, the action
   * is applied to all buffers instead of the raw text.
   */
  pushDecoded(type: 'rx' | 'tx', char: string, name?: string, color?: string): void {
    // Suppress the word-gap space that follows a prosign action
    if (this.suppressNextSpace && char === ' ') {
      this.suppressNextSpace = false;
      return;
    }

    // Check for prosign action
    const resolved = this.resolveProsignAction(char);
    if (resolved) {
      const label = resolved.prosignKey;
      this.mainOutput.applyProsignAction(resolved.action, type, name, label, color);
      this.fullscreenDecoder.applyProsignAction(resolved.action, type, name, label, color);
      this.fullscreenEncoder.applyProsignAction(resolved.action, type, name, label, color);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.mainOutput.push(type, char, name, color);
      this.fullscreenDecoder.push(type, char, name, color);
      this.fullscreenEncoder.push(type, char, name, color);
    }
  }

  /**
   * Push a sent (encoder) character to all relevant buffers.
   * Both fullscreen modes and main panel show sent text.
   * If the character is a prosign with an enabled action, the action
   * is applied to all buffers instead of the raw text.
   */
  pushSent(char: string, name?: string): void {
    // Suppress the word-gap space that follows a prosign action
    if (this.suppressNextSpace && char === ' ') {
      this.suppressNextSpace = false;
      return;
    }

    // Check for prosign action
    const resolved = this.resolveProsignAction(char);
    if (resolved) {
      const label = resolved.prosignKey;
      this.mainOutput.applyProsignAction(resolved.action, 'tx', name, label);
      this.fullscreenDecoder.applyProsignAction(resolved.action, 'tx', name, label);
      this.fullscreenEncoder.applyProsignAction(resolved.action, 'tx', name, label);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.mainOutput.push('tx', char, name);
      this.fullscreenDecoder.push('tx', char, name);
      this.fullscreenEncoder.push('tx', char, name);
    }
  }

  /**
   * Resolve whether a character (or prosign string) should trigger a prosign action.
   *
   * Checks both direct prosign names (e.g. '<BK>') and punctuation equivalents
   * (e.g. '+' → '<AR>') against the user's prosign action configuration.
   *
   * @returns The action and its prosign key, or null if no action applies
   */
  private resolveProsignAction(char: string): { action: ProsignAction; prosignKey: string } | null {
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
      return { action: entry.action, prosignKey };
    }
    return null;
  }

  /** Clear all three display buffers at once. */
  clearAll(): void {
    this.mainOutput.clear();
    this.fullscreenDecoder.clear();
    this.fullscreenEncoder.clear();
  }
}
