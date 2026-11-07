/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';

/*
 * Sent / received (TX / RX) consistency checks for the guides.
 *
 * Several settings only act on one direction of Morse: the sidetone ("Active on"),
 * Farnsworth ("Applies to"), and the direction each input or the typed text counts
 * as. A guide that plays or shows Morse of one direction must not be left with a
 * setting that ignores that direction, or the user hears nothing or gets no longer
 * pauses without knowing why. These helpers return plain-language problems for a
 * step's `validate`.
 */

export type Direction = 'rx' | 'tx';

const NAME: Record<Direction, string> = { tx: 'sent (TX)', rx: 'received (RX)' };

const unique = (directions: Direction[]): Direction[] => [...new Set(directions)];

/** Problems when the beep would stay silent for Morse of the given directions. */
export function sidetoneProblems(settings: AppSettings, directions: Direction[], what: string): string[] {
  if (!settings.sidetoneEnabled || settings.sidetoneForward === 'both') return [];
  const silent = unique(directions).filter(d => d !== settings.sidetoneForward);
  if (!silent.length) return [];
  return [`The beep is set to play only ${NAME[settings.sidetoneForward]} Morse, but ${what} counts as ${NAME[silent[0]]}, so you would not hear it. Set the beep to "Both RX and TX".`];
}

/** Problems when the longer pauses would not apply to Morse of the given directions. */
export function farnsworthProblems(settings: AppSettings, directions: Direction[], what: string): string[] {
  if (!settings.farnsworthEnabled || settings.farnsworthAppliesTo === 'both') return [];
  const unaffected = unique(directions).filter(d => d !== settings.farnsworthAppliesTo);
  if (!unaffected.length) return [];
  return [`The longer pauses are set for ${NAME[settings.farnsworthAppliesTo]} Morse only, but ${what} counts as ${NAME[unaffected[0]]}, so they would change nothing. Set "Applies to" to "Both RX and TX".`];
}

/** The directions of the local keys of the given kinds (`keyboard`, `mouse`, `touch`, `midi`, `serial`). */
export function keySources(settings: AppSettings, kinds: readonly string[]): Direction[] {
  const sources: Direction[] = [];
  if (kinds.includes('keyboard')) sources.push(...settings.keyboardInputMappings.filter(m => m.enabled).map(m => m.source));
  if (kinds.includes('mouse')) sources.push(settings.mouseKeyerSource);
  if (kinds.includes('touch')) sources.push(settings.touchKeyerSource);
  if (kinds.includes('midi')) sources.push(...settings.midiInputMappings.filter(m => m.enabled).map(m => m.source));
  if (kinds.includes('serial')) sources.push(...settings.serialInputMappings.filter(m => m.enabled).map(m => m.source));
  return sources;
}

/** The directions of the keys Send Practice counts (see `send-practice-inputs.ts` for the ids). */
export function sendPracticeSources(settings: AppSettings): Direction[] {
  const sources: Direction[] = [];
  for (const id of settings.sendPracticeInputs) {
    const mapped = /^(keyboard|midi|serial):(\d+)$/.exec(id);
    if (id === 'keyboard-straight') {
      sources.push(...settings.keyboardInputMappings.filter(m => m.enabled && m.mode === 'straightKey').map(m => m.source));
    } else if (mapped) {
      const list = ({ keyboard: settings.keyboardInputMappings, midi: settings.midiInputMappings, serial: settings.serialInputMappings })[mapped[1] as 'keyboard' | 'midi' | 'serial'];
      const mapping = list[Number(mapped[2])];
      if (mapping?.enabled) sources.push(mapping.source);
    } else if (id === 'mouse') sources.push(settings.mouseKeyerSource);
    else if (id === 'touch') sources.push(settings.touchKeyerSource);
  }
  return sources;
}
