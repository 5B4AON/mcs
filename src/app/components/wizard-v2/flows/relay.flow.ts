/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { soundStep } from './shared-steps';

/**
 * Goal "Join an online Morse conversation": a receive step and a send step,
 * each with its own "use it" tick, channel and secret, then the sidetone.
 * Both ticks start from the current settings, and at least one must stay on.
 * Secrets stay in this browser and are only shown as "set" in the review or in
 * a preset. Apply turns the ticked directions on and the app connects to the
 * channel then.
 */
export const RELAY_FLOW: WizardFlow = {
  id: 'relay',
  title: 'Join an online Morse conversation',
  goal: 'relay',
  steps: [
    {
      id: 'relayIn',
      title: 'Receive from a shared channel',
      intro: 'Tick the box to hear Morse that others send to a shared channel. Anyone with the same channel name and secret can take part.',
      helpSection: 's10-3',
      items: [{ item: 'rtdb-input' }],
    },
    {
      id: 'relayOut',
      title: 'Send to a shared channel',
      intro: 'Tick the box to publish the Morse you send to a shared channel, under your own name.',
      helpSection: 's10-4',
      items: [{ item: 'rtdb-output' }],
      validate: ctx => {
        const s = ctx.settings;
        const errors: string[] = [];
        if (!s.rtdbInputEnabled && !s.rtdbOutputEnabled) {
          errors.push('Tick receive or send (or both), or close the wizard.');
        }
        if (s.rtdbAllowInputRelay && (!s.rtdbInputEnabled || !s.rtdbOutputEnabled
          || s.rtdbInputChannelName === s.rtdbOutputChannelName
          && s.rtdbInputChannelSecret === s.rtdbOutputChannelSecret)) {
          errors.push('Relaying received characters needs receive and send on different channels, to avoid a feedback loop.');
        }
        return errors;
      },
    },
    soundStep({
      detail: 'Morse received from the shared channel, and the Morse you send, is played through it.',
    }),
  ],
};
