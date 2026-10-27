/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the audio feedback guard edits: only the two outputs that can feed the microphone. */
export const AUDIO_FEEDBACK_GUARD_DESCRIPTOR: ItemDescriptor = {
  id: 'audio-feedback-guard',
  keys: ['sidetoneEnabled', 'optoEnabled'],
  validate: () => [],
  review: labelledReview({
    sidetoneEnabled: 'Sidetone',
    optoEnabled: 'Key Output on an audio channel',
  }),
};

/** Audio outputs that are on and could feed the microphone back into the detector. */
export function feedbackRiskOutputs(settings: Pick<AppSettings, 'sidetoneEnabled' | 'optoEnabled'>): string[] {
  const outputs: string[] = [];
  if (settings.sidetoneEnabled) outputs.push('Sidetone');
  if (settings.optoEnabled) outputs.push('Key Output (audio channel)');
  return outputs;
}
