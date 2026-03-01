/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
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
  '<SK>': '...-.-',  // End of contact
  '<KN>': '-.--.',   // Go ahead (specific station)
  '<SOS>': '...---...', // Distress
};

/** Reverse lookup: morse pattern → character */
export const MORSE_REVERSE: Record<string, string> = {};
for (const [char, code] of Object.entries(MORSE_TABLE)) {
  if (!char.startsWith('<')) {
    MORSE_REVERSE[code] = char;
  }
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
