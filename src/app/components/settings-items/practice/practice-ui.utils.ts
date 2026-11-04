/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { OutputForward } from '../../../services/settings-common';
import { PracticeState } from '../../../services/practice.service';
import { KOCH_LESSON_COUNT, KOCH_NEWEST_WEIGHT, kochNewChars, kochPool } from '../../../data/koch-lessons';
import { MORSE_TABLE, adjustGapTimings, timingsFromWpm } from '../../../morse-table';
import { effectivePracticeFeedbackMode } from './practice-item.model';

/**
 * Return a concise description of the currently configured practice content.
 */
export function practiceContentDescription(settings: AppSettings): string {
  switch (settings.practiceContentMode) {
    case 'characters':
      return `${settings.practiceGroupCount} character group${settings.practiceGroupCount === 1 ? '' : 's'} of ${settings.practiceCharGroupSize}`;
    case 'words':
      return `${settings.practiceGroupCount} random word${settings.practiceGroupCount === 1 ? '' : 's'}`;
    case 'callsigns':
      return `${settings.practiceGroupCount} random callsign${settings.practiceGroupCount === 1 ? '' : 's'}`;
    case 'koch':
      return `${settings.practiceGroupCount} character group${settings.practiceGroupCount === 1 ? '' : 's'} of ${settings.practiceCharGroupSize} (Koch lesson ${settings.practiceKochLesson})`;
  }
}

/**
 * Return the learner instruction for the selected feedback style.
 */
export function practiceFeedbackDescription(settings: AppSettings): string {
  switch (effectivePracticeFeedbackMode(settings)) {
    case 'listen':
      return 'Listen: copy on paper or in your head while the text stays visible.';
    case 'blur':
      return 'Blurred: copy on paper or in your head, then hold Reveal to check.';
    case 'typealong':
      return 'Type-along: type what you hear, then validate your answer.';
  }
}

/**
 * Return the enabled external routes that Practice can use through the Full pipeline.
 *
 * Practice output currently uses the encoder source for output-forward matching.
 */
export function practiceExternalRouteNotice(settings: AppSettings): string | null {
  if (settings.practicePipeline !== 'full') return null;

  const matchesEncoderSource = (forward: OutputForward): boolean =>
    forward === 'both' || forward === settings.encoderSource;
  const routes: string[] = [];

  if (settings.serialEnabled && settings.serialOutputMappings.some(mapping =>
    mapping.enabled && mapping.portIndex >= 0 && matchesEncoderSource(mapping.forward)
  )) {
    routes.push('Serial');
  }
  if (settings.midiOutputEnabled && settings.midiOutputMappings.some(mapping =>
    mapping.enabled && !mapping.relaySuppressOtherInputs && matchesEncoderSource(mapping.forward)
  )) {
    routes.push('MIDI');
  }
  if (settings.winkeyerEnabled && settings.winkeyerPortIndex >= 0
    && matchesEncoderSource(settings.winkeyerForward)) {
    routes.push('WinKeyer');
  }
  if (settings.rtdbOutputEnabled
    && settings.rtdbOutputChannelName.trim()
    && settings.rtdbOutputChannelSecret.trim()
    && matchesEncoderSource(settings.rtdbOutputForward)) {
    routes.push('RTDB');
  }

  return routes.length
    ? `Full pipeline is configured to use: ${routes.join(', ')}.`
    : null;
}

/**
 * Return the label for the single state-dependent practice action.
 */
export function practiceActionLabel(state: PracticeState, settings: AppSettings, hasFeedback: boolean): string {
  if (state === 'idle') return 'Start';
  if (state === 'playing') return 'Pause';
  if (state === 'paused') return 'Resume';
  return effectivePracticeFeedbackMode(settings) === 'typealong' && !hasFeedback
    ? 'Validate'
    : 'Next sequence';
}

/**
 * Estimate how long one Koch practice round plays, in seconds, from the real
 * timing: the lesson's characters (weighted like the picker) at the encoder
 * speed with the current Farnsworth gaps, plus a word gap between groups.
 */
export function kochRoundSeconds(settings: AppSettings): number {
  const timings = adjustGapTimings(
    timingsFromWpm(settings.encoderWpm), settings.encoderWpm, settings.practiceSource, settings);
  const charMs = (ch: string): number => {
    const morse = MORSE_TABLE[ch] ?? '';
    let ms = 0;
    for (const element of morse) ms += element === '.' ? timings.dit : timings.dah;
    return ms + Math.max(0, morse.length - 1) * timings.intraChar + timings.interChar;
  };
  const mean = (chars: readonly string[]): number =>
    chars.reduce((sum, ch) => sum + charMs(ch), 0) / chars.length;

  const pool = kochPool(settings.practiceKochLesson);
  const newest = kochNewChars(settings.practiceKochLesson);
  const older = pool.slice(0, pool.length - newest.length);
  const averageMs = older.length
    ? KOCH_NEWEST_WEIGHT * mean(newest) + (1 - KOCH_NEWEST_WEIGHT) * mean(older)
    : mean(newest);
  const characters = settings.practiceGroupCount * settings.practiceCharGroupSize;
  const gaps = Math.max(0, settings.practiceGroupCount - 1);
  return (characters * averageMs + gaps * (timings.interWord - timings.interChar)) / 1000;
}

/** Format a duration for people: whole seconds under 2 minutes (to 5 s), otherwise to 10 s. */
export function formatPracticeDuration(seconds: number): string {
  const step = seconds < 120 ? 5 : 10;
  const total = Math.max(step, Math.round(seconds / step) * step);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Hint under Rounds for Koch method: the estimated length of a round and of the whole session. */
export function kochRoundsHint(settings: AppSettings): string {
  const seconds = kochRoundSeconds(settings);
  const characters = settings.practiceGroupCount * settings.practiceCharGroupSize;
  const round = `About ${formatPracticeDuration(seconds)} per round (${characters} characters at ${settings.encoderWpm} WPM).`;
  return settings.practiceRounds > 1
    ? `${round} ${settings.practiceRounds} rounds is about ${formatPracticeDuration(seconds * settings.practiceRounds)}. Rounds are averaged.`
    : round;
}

/** Accuracy above this percentage recommends the next Koch lesson. */
export const KOCH_ADVANCE_ACCURACY = 90;

/** Where the learner stands after a result: move on to the next lesson, or finished all lessons. */
export type KochRecommendation =
  | { kind: 'next'; lesson: number; newChars: string }
  | { kind: 'complete' };

/**
 * Recommend moving on after a Koch result above 90 % (the round accuracy, or
 * the average of a multi-round session). Null for other content or lower scores.
 */
export function kochRecommendation(settings: AppSettings, accuracy: number): KochRecommendation | null {
  if (settings.practiceContentMode !== 'koch' || accuracy <= KOCH_ADVANCE_ACCURACY) return null;
  if (settings.practiceKochLesson >= KOCH_LESSON_COUNT) return { kind: 'complete' };
  const lesson = settings.practiceKochLesson + 1;
  return { kind: 'next', lesson, newChars: kochNewChars(lesson).join(', ') };
}

/** What a Koch lesson plays: lesson 1 has only its two characters, later ones add the newest. */
export function kochLessonHint(lesson: number): string {
  const newest = kochNewChars(lesson).join(' and ');
  return lesson <= 1
    ? `Lesson 1 plays only ${newest}.`
    : `Random characters from lessons 1 to ${lesson}. The newest, ${newest}, comes up more often.`;
}
