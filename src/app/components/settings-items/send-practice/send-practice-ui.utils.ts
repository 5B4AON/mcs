/**
 * Morse Code Studio
 */

import type { AppSettings } from '../../../services/settings.service';
import { kochNewChars } from '../../../data/koch-lessons';
import { practiceSessionLines } from '../practice/practice-ui.utils';

/** Copy practice reads these keys; Send practice has the same content options under its own names. */
function asCopyShape(s: AppSettings): AppSettings {
  return {
    ...s,
    practiceContentMode: s.sendPracticeContentMode,
    practiceGroupCount: s.sendPracticeGroupCount,
    practiceCharGroupSize: s.sendPracticeCharGroupSize,
    practiceRounds: s.sendPracticeRounds,
    practiceKochLesson: s.sendPracticeKochLesson,
  };
}

/** The session as separate lines: rounds and groups, then the group size. */
export function sendPracticeSessionLines(s: AppSettings): string[] {
  return practiceSessionLines(asCopyShape(s));
}

/** One-line description of what is shown, for the guide under the prompt. */
export function sendPracticeSessionDescription(s: AppSettings): string {
  return sendPracticeSessionLines(s).join(' ').replace(/,$/, '').replace(/\.$/, '');
}

/** Heading: the Koch lesson and its new characters when Koch is on, otherwise the given default. */
export function sendPracticeHeading(s: AppSettings, fallback: string): string {
  return s.sendPracticeContentMode === 'koch'
    ? `Koch lesson ${s.sendPracticeKochLesson} - ${kochNewChars(s.sendPracticeKochLesson).join(', ')}`
    : fallback;
}

/**
 * The enabled external routes that keying will also go to with the Full pipeline,
 * or null when practice stays on this device or no route is switched on.
 */
export function sendPracticeExternalRouteNotice(s: AppSettings): string | null {
  if (s.sendPracticePipeline !== 'full') return null;
  const routes: string[] = [];
  if (s.serialEnabled && s.serialOutputMappings.some(m => m.enabled && m.portIndex >= 0)) routes.push('Serial');
  if (s.midiOutputEnabled && s.midiOutputMappings.some(m => m.enabled)) routes.push('MIDI');
  if (s.winkeyerEnabled && s.winkeyerPortIndex >= 0) routes.push('WinKeyer');
  if (s.rtdbOutputEnabled && s.rtdbOutputChannelName.trim() && s.rtdbOutputChannelSecret.trim()) routes.push('RTDB');
  return routes.length ? `Full pipeline is configured to use: ${routes.join(', ')}.` : null;
}
