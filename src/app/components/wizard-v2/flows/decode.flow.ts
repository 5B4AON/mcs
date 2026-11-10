/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { leavePracticeForced, leavePracticeStep } from './shared-steps';

/**
 * Goal "Decode Morse from a radio or sound": a feedback-risk step, then the
 * detector tuning (source, device, channel, tone, bandwidth, threshold). Apply
 * switches the detector on (forced, so Review shows it going from off to on) but
 * never starts audio or the microphone: the app starts the detector only if audio
 * already runs. A sound output left on is allowed; the
 * app's feedback protection switches the detector off if a loop is detected.
 */
export const DECODE_FLOW: WizardFlow = {
  id: 'decode',
  title: 'Decode Morse from a radio or sound',
  goal: 'decode',
  forced: [{ key: 'cwInputEnabled', value: true, label: 'CW tone detector on' }, ...leavePracticeForced()],
  steps: [
    leavePracticeStep('Send practice does not show decoded text in the output area, and Copy practice shows its own prompt.'),
    {
      id: 'before',
      title: 'Before you listen',
      intro: 'This guide never starts listening. Your browser may ask for the microphone later.',
      helpSection: 's7-7',
      items: [{ item: 'audio-feedback-guard' }],
    },
    {
      id: 'tone',
      title: 'Where the sound comes from',
      intro: 'The detector finds the tone (400–900 Hz), the speed and the levels by itself. Pick the input it listens to.',
      helpSection: 's6-1',
      items: [{ item: 'cw-detector-tune' }],
    },
  ],
};
