/**
 * Morse Code Studio
 */

import { Condition, WizardFlow } from '../engine/flow-types';
import { all, answerIs, settingIs } from '../engine/conditions';
import { MOBILE_DEVICE, WAKE_LOCK_SUPPORTED } from './device-support';
import { leavePracticeForced, leavePracticeStep } from './shared-steps';

const KEEP_SCREEN_ON = 'keep-screen-on';

/** A phone or tablet that can hold a screen wake lock and does not yet: the detector stops listening when the screen locks */
const offerKeepScreenOn: Condition = all(
  () => WAKE_LOCK_SUPPORTED && MOBILE_DEVICE,
  settingIs('wakeLockEnabled', false),
);

/**
 * Goal "Decode Morse from a radio or sound": a feedback-risk step, then the
 * detector tuning (source, device, channel, tone, bandwidth, threshold). Apply
 * switches the detector on (forced, so Review shows it going from off to on) but
 * never starts audio or the microphone: the app starts the detector only if audio
 * already runs. On a phone or tablet it also asks whether to keep the screen on
 * (the page stops listening when the screen locks). A sound output left on is allowed; the
 * app's feedback protection switches the detector off if a loop is detected.
 */
export const DECODE_FLOW: WizardFlow = {
  id: 'decode',
  title: 'Decode Morse from a radio or sound',
  goal: 'decode',
  forced: [{ key: 'cwInputEnabled', value: true, label: 'CW tone decoder on' }, ...leavePracticeForced(), {
    key: 'wakeLockEnabled',
    value: true,
    label: 'Keep the screen on',
    when: all(offerKeepScreenOn, answerIs(KEEP_SCREEN_ON, 'yes')),
  }],
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
      intro: 'The detector finds the tone (400–1500 Hz), the speed and the levels by itself. Pick the input it listens to.',
      helpSection: 's6-1',
      items: [{ item: 'cw-detector-tune' }],
    },
    {
      id: 'keep-screen-on',
      title: 'Keep the screen on?',
      intro: 'The detector listens through the microphone. When the screen dims or locks, a phone or tablet usually pauses the page and stops listening, so decoding would stop.',
      helpSection: 's9-6-wake-lock',
      when: offerKeepScreenOn,
      questions: [{
        id: KEEP_SCREEN_ON,
        label: 'Keep the screen on while the app is open?',
        kind: 'single',
        default: 'yes',
        options: [
          { value: 'yes', label: 'Yes, keep the screen on', hint: 'You can change this later in Settings → Other → Screen Settings.' },
          { value: 'no', label: 'No, let the screen turn off', hint: 'Decoding stops while the screen is off.' },
        ],
      }],
    },
  ],
};
