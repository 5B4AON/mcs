/**
 * Morse Code Studio
 */

import { AppSettings } from './settings.service';

/**
 * How much of the latest text the replay button plays again. `partial` exists only while a
 * sequence is paused in the middle of a word or group: just the unfinished one. Then `word` is
 * the full one before it and the unfinished one together.
 */
export type ReplayUnit = 'character' | 'partial' | 'word' | 'line';

/**
 * The end of a text for replaying part of it: its last character (a whole
 * `<AR>`-style prosign counts as one), its last space-separated word or group,
 * or all of it. When the text stops in the middle of a word or group
 * (`midWord`, a paused sequence), `partial` is the unfinished one alone and
 * `word` is the full one before it plus the unfinished one. Null when there is
 * nothing to replay.
 */
export function lastReplayPart(text: string, unit: ReplayUnit, midWord = false): string | null {
  const clean = text.trimEnd();
  if (!clean.trim()) return null;
  const words = clean.split(/\s+/);
  switch (unit) {
    case 'line':
      return clean;
    case 'word':
      return words.slice(midWord ? -2 : -1).join(' ');
    case 'partial':
      return midWord ? words[words.length - 1] : null;
    default:
      return clean.match(/<[^<>\s]+>$/)?.[0] ?? Array.from(clean).at(-1) ?? null;
  }
}

/**
 * The choices worth offering for a text, shortest first: character, the unfinished word or group
 * (only when paused in the middle of one), the word or group (with the one before it when paused
 * in the middle of one) and the line. A choice that would play the same as a shorter one is left
 * out; a single choice means the replay button can just play it without asking.
 */
export function replayChoices(text: string, midWord = false): ReplayUnit[] {
  const choices: ReplayUnit[] = [];
  let previous: string | null = null;
  for (const unit of ['character', 'partial', 'word', 'line'] as const) {
    const part = lastReplayPart(text, unit, midWord);
    if (part === null || part === previous) continue;
    choices.push(unit);
    previous = part;
  }
  return choices;
}

/**
 * What a word or group is called: Copy practice plays groups of characters (random or Koch)
 * or callsigns, where "word" would mean nothing; everything else is words.
 */
export function replayWordLabel(settings: AppSettings): string {
  if (settings.encoderMode !== 'practice') return 'Word';
  switch (settings.practiceContentMode) {
    case 'characters':
    case 'koch':
      return 'Group';
    case 'callsigns':
      return 'Callsign';
    default:
      return 'Word';
  }
}

/** The text of a choice in the replay question; paused in the middle of a word the choices are "Group so far" and "Last 2 groups". */
export function replayChoiceLabel(unit: ReplayUnit, settings: AppSettings, midWord: boolean): string {
  const name = replayWordLabel(settings);
  switch (unit) {
    case 'character':
      return 'Character';
    case 'partial':
      return `${name} so far`;
    case 'word':
      return midWord ? `Last 2 ${name.toLowerCase()}s` : name;
    case 'line':
      return 'Line';
  }
}

/** Whether the sidetone is on and plays what the encoder sends (practice is played through it), not only the other direction. */
export function sidetonePlaysEncoder(s: Pick<AppSettings, 'sidetoneEnabled' | 'sidetoneForward' | 'encoderSource'>): boolean {
  return s.sidetoneEnabled && (s.sidetoneForward === 'both' || s.sidetoneForward === s.encoderSource);
}

/**
 * Whether a replay would be heard, felt or sent anywhere: the sidetone, optocoupler or vibration that plays the
 * encoder's source, or, unless the replay stays on this device (Copy practice on "This device only", Hear it
 * first), a switched-on serial, MIDI, WinKeyer or relay output that does. With none, the replay would run in silence.
 */
export function replayHasOutput(s: AppSettings, localOnly = false): boolean {
  const source = s.encoderSource;
  const plays = (forward: string) => forward === 'both' || forward === source;
  if (s.sidetoneEnabled && plays(s.sidetoneForward)) return true;
  if (s.optoEnabled && plays(s.optoForward)) return true;
  if (s.vibrateEnabled && plays(s.vibrateForward)) return true;
  if (localOnly || (s.encoderMode === 'practice' && s.practicePipeline === 'local')) return false;
  if (s.serialEnabled && s.serialOutputMappings.some(m => m.enabled && m.portIndex >= 0 && plays(m.forward))) return true;
  if (s.midiOutputEnabled && s.midiOutputMappings.some(m => m.enabled && plays(m.forward))) return true;
  if (s.winkeyerEnabled && s.winkeyerPortIndex >= 0 && plays(s.winkeyerForward)) return true;
  return s.rtdbOutputEnabled && plays(s.rtdbOutputForward);
}
