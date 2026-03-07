/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AppSettings } from '../../services/settings.service';
import { DisplayLine } from '../../services/display-buffer.service';
import { PUNCTUATION_TO_PROSIGN } from '../../morse-table';

/**
 * Escape HTML special characters for safe innerHTML rendering.
 *
 * Uses a temporary DOM element for reliable escaping of &lt;, &gt;, &amp;, etc.
 *
 * @param text Raw text to escape
 * @returns HTML-safe string
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Internal text formatting logic: handles emoji replacement, prosign patterns,
 * and punctuation conversion.
 *
 * Emoji replacement runs first — enabled emoji mappings are checked at each
 * position (longest match first) and matching text is replaced with an emoji
 * span. Remaining text passes through prosign / punctuation formatting.
 *
 * @param text The text to format
 * @param settings Current application settings (for prosign/emoji config)
 * @param skipEmojis When true, skip emoji replacements (used for unsent buffer chars)
 * @returns HTML string with styled prosigns and emoji replacements
 */
export function formatTextInternal(text: string, settings: AppSettings, skipEmojis = false): string {
  // Build sorted emoji matchers (longest match first) for the current pass
  const emojiMatchers = !skipEmojis && settings.emojisEnabled
    ? settings.emojiMappings
        .filter(m => m.enabled && m.match && m.emoji)
        .sort((a, b) => b.match.length - a.match.length)
    : [];

  let result = '';
  let i = 0;

  while (i < text.length) {
    // ---- Emoji replacement (checked first) ----
    // Only match when the position is at a word boundary on the left
    // (start of text, after a space, or after a newline).
    const atWordStart = i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n';
    if (emojiMatchers.length > 0 && atWordStart) {
      let emojiFound = false;
      for (const mapping of emojiMatchers) {
        const match = mapping.match;
        // Prosign match: <XX> in text or punctuation equivalent
        if (match.startsWith('<') && match.endsWith('>')) {
          // Direct prosign in text
          if (text.startsWith(match, i)) {
            result += `<span class="emoji-display">${escapeHtml(mapping.emoji)}</span>`;
            i += match.length;
            emojiFound = true;
            break;
          }
          // Punctuation equivalent (e.g. '+' for '<AR>')
          const char = text[i];
          if (char.length === 1) {
            const prosign = PUNCTUATION_TO_PROSIGN[char];
            if (prosign === match) {
              const afterPunct = i + 1;
              const atWordEndP = afterPunct >= text.length || text[afterPunct] === ' ' || text[afterPunct] === '\n' || text[afterPunct] === '<';
              if (atWordEndP) {
                result += `<span class="emoji-display">${escapeHtml(mapping.emoji)}</span>`;
                i++;
                emojiFound = true;
                break;
              }
            }
          }
        } else {
          // Plain text sequence match (case-insensitive, full word only)
          const slice = text.substring(i, i + match.length);
          const afterMatch = i + match.length;
          const atWordEnd = afterMatch >= text.length || text[afterMatch] === ' ' || text[afterMatch] === '\n' || text[afterMatch] === '<';
          if (slice.toUpperCase() === match.toUpperCase() && atWordEnd) {
            result += `<span class="emoji-display">${escapeHtml(mapping.emoji)}</span>`;
            i += match.length;
            emojiFound = true;
            break;
          }
        }
      }
      if (emojiFound) continue;
    }

    // ---- Prosign pattern: <LETTERS> ----
    if (text[i] === '<') {
      const endIndex = text.indexOf('>', i);
      if (endIndex !== -1 && endIndex > i + 1) {
        const prosignPattern = text.substring(i, endIndex + 1);
        if (/^<[A-Z]+>$/.test(prosignPattern)) {
          result += `<span class="prosign-display">${escapeHtml(prosignPattern)}</span>`;
          i = endIndex + 1;
          continue;
        }
      }
    }

    // ---- Punctuation to prosign conversion ----
    const char = text[i];
    if (settings.showProsigns) {
      const prosign = PUNCTUATION_TO_PROSIGN[char];
      if (prosign) {
        result += `<span class="prosign-display">${escapeHtml(prosign)}</span>`;
        i++;
        continue;
      }
    }

    // Regular character
    result += escapeHtml(char);
    i++;
  }

  return result;
}

/**
 * Format text for display, handling prosign patterns and optional punctuation conversion.
 *
 * Prosign patterns (e.g., '&lt;SK&gt;', '&lt;HH&gt;') are always wrapped in styled
 * spans for visual distinction. When showProsigns is enabled, punctuation marks
 * sharing morse patterns with prosigns are also replaced with their prosign names.
 *
 * @param text The raw text to display
 * @param settings Current application settings
 * @param sanitizer Angular DOM sanitizer for safe HTML binding
 * @returns Formatted SafeHtml with prosigns and emojis styled
 */
export function formatText(text: string, settings: AppSettings, sanitizer: DomSanitizer): SafeHtml {
  return sanitizer.bypassSecurityTrustHtml(formatTextInternal(text, settings));
}

/**
 * Format text without emoji replacement.
 *
 * Used for encoder pending (unsent) characters — emojis should only
 * appear once text has been transmitted.
 *
 * @param text The raw text to display
 * @param settings Current application settings
 * @param sanitizer Angular DOM sanitizer for safe HTML binding
 * @returns Formatted SafeHtml without emoji replacements
 */
export function formatTextNoEmoji(text: string, settings: AppSettings, sanitizer: DomSanitizer): SafeHtml {
  return sanitizer.bypassSecurityTrustHtml(formatTextInternal(text, settings, true));
}

/**
 * Format a complete display line including optional username prefix and text.
 *
 * Username prefixes appear as muted labels before the line content, used for
 * Firebase RTDB relay to identify remote stations.
 *
 * @param line The display line to format
 * @param settings Current application settings
 * @param sanitizer Angular DOM sanitizer for safe HTML binding
 * @returns Formatted SafeHtml with optional username prefix and prosign-styled text
 */
export function formatLine(line: DisplayLine, settings: AppSettings, sanitizer: DomSanitizer): SafeHtml {
  let result = '';
  if (line.userName) {
    result += `<span class="rtdb-user-prefix">[${escapeHtml(line.userName)}] </span>`;
  }
  result += formatTextInternal(line.text, settings);
  return sanitizer.bypassSecurityTrustHtml(result);
}
