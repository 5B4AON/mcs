/**
 * Morse Code Studio
 */

/**
 * International Morse Code lookup tables and timing calculations.
 *
 * This module provides:
 *  - MORSE_TABLE:   character → morse pattern (e.g. 'A' → '.-')
 *  - MORSE_REVERSE: morse pattern → character (e.g. '.-' → 'A')
 *  - timingsFromWpm(): converts WPM speed into millisecond durations
 *
 * Notation:
 *  '.' = dit (short element)
 *  '-' = dah (long element, 3× dit duration)
 *
 * Prosigns (special procedural signals) are keyed as multi-char shortcuts
 * like <AR>, <SK>, etc. They are included in the table for encoding but
 * excluded from MORSE_REVERSE to avoid collisions with single characters.
 */
export const MORSE_TABLE: Record<string, string> = {
  // Letters
  'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
  'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
  'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
  'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
  'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
  'Y': '-.--',  'Z': '--..',

  // Numbers
  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.',

  // Punctuation & prosigns
  '.': '.-.-.-',   ',': '--..--',   '?': '..--..',
  '\'': '.----.', '!': '-.-.--',   '/': '-..-.',
  '(': '-.--.',    ')': '-.--.-',   '&': '.-...',
  ':': '---...',   ';': '-.-.-.',   '=': '-...-',
  '+': '.-.-.',    '-': '-....-',   '_': '..--.-',
  '"': '.-..-.',   '$': '...-..-',  '@': '.--.-.',

  // Prosigns (represented as special chars)
  '<AR>': '.-.-.',   // End of message
  '<AS>': '.-...',   // Wait
  '<BT>': '-...-',   // Break / new paragraph
  '<BK>': '-...-.-',   // Break / new paragraph (alternate) / Back-to you
  '<SK>': '...-.-',  // End of contact
  '<KA>': '-.-.-',   // Message begins / Start of work / New message
  '<KN>': '-.--.',   // Go ahead (specific station)
  '<SOS>': '...---...', // Distress
  '<HH>': '........', // Preceding text was in error
};

/** Reverse lookup: morse pattern → character */
export const MORSE_REVERSE: Record<string, string> = {};
for (const [char, code] of Object.entries(MORSE_TABLE)) {
  if (!char.startsWith('<')) {
    MORSE_REVERSE[code] = char;
  }
}

// Add non-clashing prosigns to the reverse lookup
// (Prosigns that share patterns with punctuation are handled via PUNCTUATION_TO_PROSIGN)
const NON_CLASHING_PROSIGNS = ['<BK>', '<SK>', '<KA>', '<SOS>', '<HH>'];
for (const prosign of NON_CLASHING_PROSIGNS) {
  const code = MORSE_TABLE[prosign];
  if (code && !MORSE_REVERSE[code]) {
    MORSE_REVERSE[code] = prosign;
  }
}

/**
 * Mapping from punctuation characters to their prosign representations.
 *
 * In International Morse, some prosigns share the same morse pattern as
 * punctuation marks. This mapping allows displaying the procedural signal
 * name instead of the raw punctuation for improved clarity.
 */
export const PUNCTUATION_TO_PROSIGN: Record<string, string> = {
  '+': '<AR>',  // End of message (.-.-.)
  '&': '<AS>',  // Wait (.-...)
  '=': '<BT>',  // Break / new paragraph (-...-)
  '(': '<KN>',  // Go ahead, specific station (-.--.)
};

/**
 * Reverse mapping: prosign to punctuation character.
 * Used for converting prosigns to their punctuation equivalents
 * when forwarding to systems that only support ASCII characters.
 */
export const PROSIGN_TO_PUNCTUATION: Record<string, string> = {};
for (const [punct, prosign] of Object.entries(PUNCTUATION_TO_PROSIGN)) {
  PROSIGN_TO_PUNCTUATION[prosign] = punct;
}

/**
 * Converts text to prosign display format by replacing punctuation marks
 * with their corresponding prosign names (e.g., '+' → '<AR>').
 *
 * This is for display purposes only — the application continues to send
 * and receive punctuation characters for efficiency. The translation is
 * applied at render time to improve readability in the conversation logs.
 *
 * @param text Input text containing punctuation
 * @returns Text with prosigns substituted for matching punctuation
 */
export function toProsignDisplay(text: string): string {
  let result = '';
  for (const char of text) {
    result += PUNCTUATION_TO_PROSIGN[char] || char;
  }
  return result;
}

/**
 * Calculate standard morse element and gap durations from a WPM speed.
 *
 * Uses the "PARIS" standard: the word PARIS contains exactly 50 dit-units,
 * so at W WPM the dit duration = 1200 / W milliseconds.
 *
 * Returned timings:
 *  - dit:       1 unit  — shortest element
 *  - dah:       3 units — long element
 *  - intraChar: 1 unit  — gap between dits/dahs within one character
 *  - interChar: 3 units — gap between characters
 *  - interWord: 7 units — gap between words
 *
 * @param wpm Words per minute (5–50 typical range)
 * @returns Object with timing durations in milliseconds
 */
export function timingsFromWpm(wpm: number) {
  const ditMs = 1200 / wpm;
  return {
    dit: ditMs,
    dah: ditMs * 3,
    intraChar: ditMs,       // space between dits/dahs within a character
    interChar: ditMs * 3,   // space between characters
    interWord: ditMs * 7,   // space between words
  };
}
