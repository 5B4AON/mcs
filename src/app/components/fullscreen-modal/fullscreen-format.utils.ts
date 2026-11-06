/**
 * Morse Code Studio
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
 * span. A trigger only matches a whole word that is already finished: it must be
 * followed by a space, newline or prosign, so "FB" is not replaced while "FBI" is
 * still being typed. The end of the text counts as a finished word only when
 * `endIsWordEnd` is set (lines the conversation has already moved past).
 * Remaining text passes through prosign / punctuation formatting.
 *
 * @param text The text to format
 * @param settings Current application settings (for prosign/emoji config)
 * @param skipEmojis When true, skip emoji replacements (used for unsent buffer chars)
 * @param endIsWordEnd When true, a trigger at the very end of the text is replaced too
 * @returns HTML string with styled prosigns and emoji replacements
 */
export function formatTextInternal(text: string, settings: AppSettings, skipEmojis = false, endIsWordEnd = false): string {
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
              const atWordEndP = (endIsWordEnd && afterPunct >= text.length) || text[afterPunct] === ' ' || text[afterPunct] === '\n' || text[afterPunct] === '<';
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
          const atWordEnd = (endIsWordEnd && afterMatch >= text.length) || text[afterMatch] === ' ' || text[afterMatch] === '\n' || text[afterMatch] === '<';
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

/** Emoji whose replacement text starts a light show while it is the latest thing on screen */
const SHOW_EMOJI = '\u{1F386}';

/**
 * True while the newest thing on the line is an emoji replacement whose text contains the
 * show emoji, i.e. nothing has appeared after the replacement yet. A word trigger is replaced
 * by the space (or newline) that ends it, so that character is the last one; a bracketed
 * prosign trigger is replaced by its own closing bracket, and the one word-gap space the
 * decoder adds right after it does not end the show either.
 *
 * @param text The text of the line still being written
 * @param settings Current application settings
 */
export function endsWithShowEmoji(text: string, settings: AppSettings): boolean {
  if (!settings.emojisEnabled || !text) return false;
  const closed = text.endsWith(' ') || text.endsWith('\n');
  const body = closed ? text.slice(0, -1) : text;
  for (const mapping of settings.emojiMappings) {
    if (!mapping.enabled || !mapping.match || !mapping.emoji.includes(SHOW_EMOJI)) continue;
    const isProsign = mapping.match.startsWith('<') && mapping.match.endsWith('>');
    const forms: { form: string; needsEnd: boolean }[] = [{ form: mapping.match, needsEnd: !isProsign }];
    if (isProsign) {
      for (const [punct, prosign] of Object.entries(PUNCTUATION_TO_PROSIGN)) {
        if (prosign === mapping.match) forms.push({ form: punct, needsEnd: true });
      }
    }
    for (const { form, needsEnd } of forms) {
      if (needsEnd && !closed) continue;
      const start = body.length - form.length;
      if (start < 0 || body.substring(start).toUpperCase() !== form.toUpperCase()) continue;
      if (start === 0 || body[start - 1] === ' ' || body[start - 1] === '\n') return true;
    }
  }
  return false;
}

/**
 * Format a complete display line including optional name prefix and text.
 *
 * Name prefixes appear as muted labels before the line content, used for
 * Firebase RTDB relay and MIDI input mappings to identify sources.
 *
 * @param line The display line to format
 * @param settings Current application settings
 * @param sanitizer Angular DOM sanitizer for safe HTML binding
 * @param lineClosed True for a line the conversation has moved past, so a trigger at its very end is a finished word
 * @returns Formatted SafeHtml with optional name prefix and prosign-styled text
 */
export function formatLine(line: DisplayLine, settings: AppSettings, sanitizer: DomSanitizer, lineClosed = false): SafeHtml {
  let result = '';
  if (line.name) {
    result += `<span class="rtdb-user-prefix">[${escapeHtml(line.name)}] </span>`;
  }
  result += `<span class="line-text">${formatTextInternal(line.text, settings, false, lineClosed)}</span>`;
  return sanitizer.bypassSecurityTrustHtml(result);
}
