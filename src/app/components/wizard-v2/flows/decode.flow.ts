/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';

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
  forced: [{ key: 'cwInputEnabled', value: true, label: 'CW tone detector on' }],
  steps: [
    {
      id: 'before',
      title: 'Before you listen',
      intro: 'This guide never starts listening, never asks for microphone access and never lists your devices. Your browser may ask for microphone permission later, when audio starts.',
      items: [{ item: 'audio-feedback-guard' }],
    },
    {
      id: 'tone',
      title: 'Tune the detector',
      intro: 'Match these to the tone you hear from your radio. Typical CW pitch is 500-700 Hz.',
      items: [{ item: 'cw-detector-tune' }],
      validate: ctx => {
        const s = ctx.settings;
        const errors: string[] = [];
        if (s.cwInputFrequency < 200 || s.cwInputFrequency > 2000) errors.push('Tone frequency must be between 200 and 2000 Hz.');
        if (s.cwInputBandwidth < 100 || s.cwInputBandwidth > 500) errors.push('Bandwidth must be between 100 and 500 Hz.');
        return errors;
      },
    },
  ],
};
