/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { ProsignAction } from '../components/settings-items/prosign-actions/prosign-actions-item.model';
import { PUNCTUATION_TO_PROSIGN } from '../morse-table';

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
 * Most characters a buffer keeps in total (the saved transcript): 48 hours at
 * 25 WPM, counting 6 characters per word (5 letters and the word gap). That is
 * about 0.43 MB of text, well under 10 MB. Past it the oldest text is dropped.
 */
export const TRANSCRIPT_MAX_CHARS = 25 * 6 * 60 * 48;

/** Share of the transcript cap at which the user is warned */
const TRANSCRIPT_WARN_SHARE = 0.9;

/** A stretch of text from one source: the same type, name and colour */
interface TextRun {
  type: 'rx' | 'tx';
  text: string;
  name?: string;
  color?: string;
}

/** Cut `count` UTF-16 units off the start of `s`, never leaving half of a surrogate pair */
function cutStart(s: string, count: number): string {
  const code = s.charCodeAt(count);
  return s.slice(code >= 0xdc00 && code <= 0xdfff ? count + 1 : count);
}

/**
 * An independent FIFO display buffer.
 *
 * Keeps all text as runs (contiguous text of the same type, name and
 * colour), so appending is cheap and nothing is lost until the transcript cap.
 * The screen only needs the newest `capacity` characters: `lines` and `text`
 * are built from those, while `transcript()` returns everything for saving.
 */
export class DisplayBuffer {
  /** All text, oldest first (source of truth) */
  private runs: TextRun[] = [];
  /** Characters (UTF-16 units) in all runs */
  private total = 0;
  /** Collapsed conversation lines of the newest `capacity` characters (rebuilt on mutation) */
  readonly lines = signal<DisplayLine[]>([]);
  /** Flat text of the newest `capacity` characters for simple display (e.g. main output panel) */
  readonly text = signal('');
  /** True from 90 % of the transcript cap until the buffer is cleared: text will soon be lost */
  readonly nearCap = signal(false);

  /** True when there is any visible text on screen. */
  hasText(): boolean {
    return this.text().trim().length > 0;
  }
  /** Number of newest characters shown on screen */
  private capacity: number;
  /**
   * When true, a newline is inserted in the flat text whenever the
   * source type (RX/TX) changes — producing a conversation-style
   * layout in the main output panel.
   */
  private conversationNewlines: boolean;
  /** Most characters kept in total */
  private maxChars: number;

  constructor(capacity = DEFAULT_CAPACITY, conversationNewlines = false, maxChars = TRANSCRIPT_MAX_CHARS) {
    this.capacity = capacity;
    this.conversationNewlines = conversationNewlines;
    this.maxChars = maxChars;
  }

  /** Append one or more characters. */
  push(type: 'rx' | 'tx', text: string, name?: string, color?: string): void {
    this.append(type, text, name, color);
    this.trim();
    this.rebuild();
  }

  /** Clear all content. */
  clear(): void {
    this.runs = [];
    this.total = 0;
    this.nearCap.set(false);
    this.rebuild();
  }

  /**
   * The whole text for saving, in the layout of the main output: a new line
   * whenever the source or the name changes, and `[Name] ` at the start of a
   * named line (as the full-screen view shows it). Colours are not part of it.
   */
  transcript(): string {
    let out = '';
    let prev: TextRun | null = null;
    for (const run of this.runs) {
      let text = run.text;
      if (!prev || run.type !== prev.type || run.name !== prev.name) {
        const leading = /^\n*/.exec(text)![0];
        if (out && !out.endsWith('\n') && !leading) out += '\n';
        out += leading;
        if (run.name) out += `[${run.name}] `;
        text = text.slice(leading.length);
      }
      out += text;
      prev = run;
    }
    return out && !out.endsWith('\n') ? out + '\n' : out;
  }

  /** Add text to the end, joining the last run when it has the same source. */
  private append(type: 'rx' | 'tx', text: string, name?: string, color?: string): void {
    if (!text) return;
    const last = this.runs.at(-1);
    if (last && last.type === type && last.name === name && last.color === color) {
      last.text += text;
    } else {
      this.runs.push({ type, text, name, color });
    }
    this.total += text.length;
  }

  /** Remove `count` characters from the end. */
  private removeTail(count: number): void {
    while (count > 0 && this.runs.length) {
      const last = this.runs[this.runs.length - 1];
      if (last.text.length <= count) {
        this.runs.pop();
        count -= last.text.length;
        this.total -= last.text.length;
      } else {
        last.text = last.text.slice(0, last.text.length - count);
        this.total -= count;
        count = 0;
      }
    }
  }

  /** The characters from the end backwards, for the prosign actions that erase text. */
  private *tailChars(): Generator<string> {
    for (let r = this.runs.length - 1; r >= 0; r--) {
      const text = this.runs[r].text;
      for (let c = text.length - 1; c >= 0; c--) yield text[c];
    }
  }

  /**
   * Execute a prosign action on this buffer.
   *
   * When a prosign label is provided, it is rendered into the buffer so
   * the user can see which prosign triggered the action:
   *  - newLine / newParagraph: label appears at end of the current line
   *  - clearLastWord / clearLine / clearScreen: label is not shown
   *
   * Actions modify the text before rebuilding:
   *  - newLine:        appends a newline character
   *  - newParagraph:   appends two newline characters
   *  - clearLastWord:  removes text back to the last space/newline boundary
   *  - clearLine:      removes text back to the last newline (or start)
   *  - clearScreen:    clears everything
   */
  applyProsignAction(action: ProsignAction, type: 'rx' | 'tx', name?: string, prosignLabel?: string, color?: string): void {
    switch (action) {
      case 'newLine':
        this.append(type, (prosignLabel ?? '') + '\n', name, color);
        break;
      case 'newParagraph':
        this.append(type, (prosignLabel ?? '') + '\n\n', name, color);
        break;
      case 'clearLastWord': {
        // Remove text back to the most recent space or newline (including trailing space)
        let count = 0;
        let inWord = false;
        for (const ch of this.tailChars()) {
          if (!inWord) {
            if (ch === ' ') { count++; continue; }
            inWord = true;
          }
          if (ch === ' ' || ch === '\n') break;
          count++;
        }
        this.removeTail(count);
        break;
      }
      case 'clearLine': {
        // Remove text back to the most recent newline (or start of buffer), keeping the newline
        let count = 0;
        for (const ch of this.tailChars()) {
          if (ch === '\n') break;
          count++;
        }
        this.removeTail(count);
        break;
      }
      case 'clearScreen':
        this.runs = [];
        this.total = 0;
        break;
    }
    this.trim();
    this.rebuild();
  }

  /** Get the current character count (for watermark tracking). */
  get length(): number {
    return this.total;
  }

  /**
   * The text of the most recent line, for replaying it as sound: the last run
   * of RX or TX text, cut after its last newline (a prosign action may have
   * started a new visual line inside it). Null when there is no text.
   */
  lastLine(): { type: 'rx' | 'tx'; text: string } | null {
    const last = this.lines().at(-1);
    if (!last) return null;
    const text = last.text.split('\n').filter(part => part.trim()).at(-1);
    return text ? { type: last.type, text } : null;
  }

  /** Drop the oldest text past the transcript cap and flag when it is close. */
  private trim(): void {
    let excess = this.total - this.maxChars;
    while (excess > 0 && this.runs.length) {
      const first = this.runs[0];
      if (first.text.length <= excess) {
        this.runs.shift();
        excess -= first.text.length;
        this.total -= first.text.length;
      } else {
        const before = first.text.length;
        first.text = cutStart(first.text, excess);
        this.total -= before - first.text.length;
        excess = 0;
      }
    }
    this.nearCap.set(this.total >= this.maxChars * TRANSCRIPT_WARN_SHARE);
  }

  /** Rebuild the lines and text signals from the newest `capacity` characters. */
  private rebuild(): void {
    // Find the first run that holds screen text; the oldest of them may be cut
    let first = this.runs.length;
    let remaining = this.capacity;
    while (first > 0 && remaining > 0) {
      first--;
      remaining -= this.runs[first].text.length;
    }

    const lines: DisplayLine[] = [];
    let flat = '';
    let prev: TextRun | null = null;
    for (let i = first; i < this.runs.length; i++) {
      const run = this.runs[i];
      const text = i === first && remaining < 0 ? cutStart(run.text, -remaining) : run.text;
      if (!text) continue;
      // Insert newline when source type or name changes (conversation-style)
      if (this.conversationNewlines && prev !== null
          && (run.type !== prev.type || run.name !== prev.name)
          && text[0] !== '\n' && !flat.endsWith('\n')) {
        flat += '\n';
      }
      prev = run;
      flat += text;
      lines.push({ type: run.type, text, name: run.name, color: run.color });
    }

    this.lines.set(lines);
    this.text.set(flat);
  }
}

/**
 * Display Buffer Service — two independent FIFO display buffers.
 *
 * Each buffer receives characters from the same data sources but can
 * be cleared independently. Buffers survive component destruction
 * (e.g. fullscreen modal close/reopen) because they live in a
 * root-provided service.
 *
 * Buffers:
 *  - mainOutput:        Main screen output panel (flat text with conversation newlines)
 *  - fullscreenConversation: Fullscreen receive/send conversation log
 */
@Injectable({ providedIn: 'root' })
export class DisplayBufferService {
  readonly mainOutput = new DisplayBuffer(DEFAULT_CAPACITY, true);
  readonly fullscreenConversation = new DisplayBuffer();

  constructor(private settings: SettingsService) {}

  /**
   * When true, the next whitespace character pushed to the fullscreen buffer
   * is suppressed. Set after a prosign action so the decoder's word-gap
   * space doesn't appear at the start of a new line.
   */
  private suppressNextSpace = false;

  /**
   * Push a decoded character to all relevant buffers.
   * The fullscreen conversation and main panel show decoded text.
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
      this.fullscreenConversation.applyProsignAction(resolved.action, type, name, label, color);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.mainOutput.push(type, char, name, color);
      this.fullscreenConversation.push(type, char, name, color);
    }
  }

  /**
   * Push a sent (encoder) character to all relevant buffers.
   * The fullscreen conversation and main panel show sent text.
   * If the character is a prosign with an enabled action, the action
   * is applied to all buffers instead of the raw text. `literal` skips the
   * prosign action check (Copy Practice shows `=` as `=`, never as <BT>).
   */
  pushSent(type: 'rx' | 'tx', char: string, name?: string, color?: string, literal = false): void {
    // Suppress the word-gap space that follows a prosign action
    if (this.suppressNextSpace && char === ' ') {
      this.suppressNextSpace = false;
      return;
    }

    // Check for prosign action
    const resolved = literal ? null : this.resolveProsignAction(char);
    if (resolved) {
      const label = resolved.prosignKey;
      this.mainOutput.applyProsignAction(resolved.action, type, name, label, color);
      this.fullscreenConversation.applyProsignAction(resolved.action, type, name, label, color);
      this.suppressNextSpace = true;
    } else {
      this.suppressNextSpace = false;
      this.mainOutput.push(type, char, name, color);
      this.fullscreenConversation.push(type, char, name, color);
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

  /**
   * Name shown with sent text: the given name, else the RTDB output name when
   * that route forwards this source. Lines are split by name, so everything
   * that pushes or predicts sent lines must use the same value.
   */
  displayNameFor(type: 'rx' | 'tx', entryName?: string): string | undefined {
    if (entryName) return entryName;
    const s = this.settings.settings();
    if (s.rtdbOutputEnabled && s.rtdbOutputName.trim()) {
      const fwd = s.rtdbOutputForward;
      if (fwd === 'both' || fwd === type) {
        return s.rtdbOutputName.trim();
      }
    }
    return undefined;
  }

  /** Clear both display buffers at once. */
  clearAll(): void {
    this.mainOutput.clear();
    this.fullscreenConversation.clear();
  }
}
