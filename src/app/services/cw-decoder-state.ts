/**
 * Morse Code Studio
 */

import type { AppSettings } from './settings.service';

/**
 * Whether the CW tone decoder is listening: it is set up (`cwInputEnabled`, Settings) and chosen in the
 * main screen's Mode list (`cwDecoderActive`). Everything that starts, stops or shows the decoder asks this.
 */
export function cwDecoderOn(s: Pick<AppSettings, 'cwInputEnabled' | 'cwDecoderActive'>): boolean {
  return s.cwInputEnabled && s.cwDecoderActive;
}
