/**
 * Morse Code Studio
 */

/**
 * Curated table of real ITU amateur radio callsign prefixes.
 *
 * Each entry defines a prefix string and an allowed range of numeric
 * digits that can follow.  The practice generator picks a random prefix,
 * appends a random digit from its allowed range (if any), then appends
 * 1–3 random suffix letters to form a realistic-looking callsign.
 *
 * Only common/well-known allocations are included — the goal is
 * plausibility, not exhaustive ITU compliance.
 */
export interface CallsignPrefix {
  /** The letter prefix (e.g. 'W', 'VE', '5B') */
  prefix: string;
  /** Allowed digits that can follow the prefix (e.g. [0–9]) */
  digits: number[];
}

export const CALLSIGN_PREFIXES: readonly CallsignPrefix[] = [
  // United States
  { prefix: 'W', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  { prefix: 'K', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  { prefix: 'N', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  // Canada
  { prefix: 'VE', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // United Kingdom
  { prefix: 'G', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  // Germany
  { prefix: 'DL', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // France
  { prefix: 'F', digits: [1, 2, 3, 4, 5, 6, 8] },
  // Italy
  { prefix: 'I', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  // Spain
  { prefix: 'EA', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Portugal
  { prefix: 'CT', digits: [1, 2, 3, 4, 7] },
  // Netherlands
  { prefix: 'PA', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Belgium
  { prefix: 'ON', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Sweden
  { prefix: 'SM', digits: [0, 1, 2, 3, 4, 5, 6, 7] },
  // Norway
  { prefix: 'LA', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Finland
  { prefix: 'OH', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Denmark
  { prefix: 'OZ', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Switzerland
  { prefix: 'HB', digits: [9] },
  // Austria
  { prefix: 'OE', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Poland
  { prefix: 'SP', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Czech Republic
  { prefix: 'OK', digits: [1, 2, 3, 4, 5, 6, 7, 8] },
  // Hungary
  { prefix: 'HA', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Romania
  { prefix: 'YO', digits: [2, 3, 4, 5, 6, 7, 8, 9] },
  // Greece
  { prefix: 'SV', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Turkey
  { prefix: 'TA', digits: [1, 2, 3, 4, 5, 6, 7] },
  // Russia
  { prefix: 'UA', digits: [0, 1, 2, 3, 4, 6, 9] },
  // Japan
  { prefix: 'JA', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  // South Korea
  { prefix: 'HL', digits: [1, 2, 3, 4, 5] },
  // Australia
  { prefix: 'VK', digits: [1, 2, 3, 4, 5, 6, 7, 8] },
  // New Zealand
  { prefix: 'ZL', digits: [1, 2, 3, 4] },
  // South Africa
  { prefix: 'ZS', digits: [1, 2, 3, 4, 5, 6] },
  // Brazil
  { prefix: 'PY', digits: [1, 2, 3, 4, 5, 6, 7, 8] },
  // Argentina
  { prefix: 'LU', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Mexico
  { prefix: 'XE', digits: [1, 2, 3] },
  // India
  { prefix: 'VU', digits: [2, 3, 4, 5, 6, 7] },
  // China
  { prefix: 'BY', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  // Thailand
  { prefix: 'HS', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Israel
  { prefix: '4X', digits: [1, 4, 6] },
  // Cyprus
  { prefix: '5B', digits: [4] },
  // Kuwait
  { prefix: '9K', digits: [2] },
  // Uruguay
  { prefix: 'CX', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Chile
  { prefix: 'CE', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Colombia
  { prefix: 'HK', digits: [1, 2, 3, 4, 5, 6, 7] },
  // Venezuela
  { prefix: 'YV', digits: [1, 2, 3, 4, 5, 6, 7, 8] },
  // Indonesia
  { prefix: 'YB', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Philippines
  { prefix: 'DU', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Ireland
  { prefix: 'EI', digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Croatia
  { prefix: '9A', digits: [1, 2, 3, 4, 5] },
  // Slovenia
  { prefix: 'S5', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Ukraine
  { prefix: 'UR', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
];
