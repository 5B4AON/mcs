/**
 * Morse Code Studio
 */

import { AppSettings, OutputForward } from './services/settings.service';
import { PracticeState } from './services/practice.service';

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
  }
}

/**
 * Return the learner instruction for the selected feedback style.
 */
export function practiceFeedbackDescription(settings: AppSettings): string {
  switch (settings.practiceFeedbackMode) {
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
  return settings.practiceFeedbackMode === 'typealong' && !hasFeedback
    ? 'Validate'
    : 'Next sequence';
}
