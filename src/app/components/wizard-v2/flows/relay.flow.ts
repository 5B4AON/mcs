/**
 * Morse Code Studio
 */

import { all, settingIs } from '../engine/conditions';
import { WizardFlow } from '../engine/flow-types';
import { leavePracticeForced, leavePracticeStep, soundStep } from './shared-steps';
import { sidetoneProblems } from './direction-checks';

/**
 * Goal "Join an online Morse conversation": each direction is a few small
 * steps. Receive: tick it and give the channel and secret, then (when ticked)
 * how received Morse plays and the optional name and colour overrides. Send:
 * tick it and give the channel and secret, then (when ticked) what is
 * forwarded, the name and colour sent, and (when both directions are on)
 * relaying; then the sidetone. Both ticks start from the current settings and
 * at least one must stay on. Secrets stay in this browser and are only shown as
 * "set" in the review or in a preset. Apply turns the ticked directions on and
 * the app connects to the channel then.
 */
export const RELAY_FLOW: WizardFlow = {
  id: 'relay',
  title: 'Join an online Morse conversation',
  goal: 'relay',
  forced: leavePracticeForced(),
  levels: true,
  steps: [
    leavePracticeStep('A practice mode keeps what you key or type on this device and out of the shared channel.'),
    {
      id: 'relayIn',
      title: 'Receive from a shared channel',
      intro: 'Tick the box to hear Morse from a shared channel, then give its name and secret.',
      helpSection: 's10-3',
      items: [{ item: 'rtdb-input-connect' }],
    },
    {
      id: 'relayInPlay',
      level: 'intermediate',
      title: 'How received Morse plays',
      intro: 'Choose whether received Morse counts as received (RX) or sent (TX), and whether it plays at your own speed instead of the sender\'s.',
      helpSection: 's10-3',
      when: settingIs('rtdbInputEnabled', true),
      items: [{ item: 'rtdb-input-play' }],
    },
    {
      id: 'relayInNames',
      level: 'expert',
      title: 'Names and colours of senders',
      intro: 'Optional. Replace the name or colour that senders use, so their text shows the way you want.',
      helpSection: 's10-3',
      when: settingIs('rtdbInputEnabled', true),
      items: [{ item: 'rtdb-input-names' }],
    },
    {
      id: 'relayOut',
      title: 'Send to a shared channel',
      intro: 'Tick the box to share the Morse you send, then give its name and secret.',
      helpSection: 's10-4',
      items: [{ item: 'rtdb-output-connect' }],
      validate: ctx => {
        const s = ctx.settings;
        const errors: string[] = [];
        if (!s.rtdbInputEnabled && !s.rtdbOutputEnabled) {
          errors.push('Tick receive or send (or both), or close the wizard.');
        }
        if (s.rtdbAllowInputRelay && (!s.rtdbInputEnabled || !s.rtdbOutputEnabled)) {
          errors.push('Relaying received characters needs receive and send to be on, on different channels.');
        }
        return errors;
      },
    },
    {
      id: 'relayOutSend',
      level: 'intermediate',
      title: 'What is shared',
      intro: 'Choose whether the channel gets the Morse you receive, the Morse you send, or both.',
      helpSection: 's10-4',
      when: settingIs('rtdbOutputEnabled', true),
      items: [{ item: 'rtdb-output-send' }],
    },
    {
      id: 'relayOutIdentity',
      title: 'Your name and colour',
      intro: 'Your name is shown next to what you send. The colour is optional. "Always use" makes it win over the name or colour of an input.',
      helpSection: 's10-4',
      when: settingIs('rtdbOutputEnabled', true),
      items: [{ item: 'rtdb-output-identity' }],
    },
    {
      id: 'relayOutRelay',
      level: 'expert',
      title: 'Pass received Morse on',
      intro: 'Optional. Morse received on the input can be passed on to the output channel. This needs two different channels, or it would loop.',
      helpSection: 's10-6',
      when: all(settingIs('rtdbInputEnabled', true), settingIs('rtdbOutputEnabled', true)),
      items: [{ item: 'rtdb-output-relay' }],
      validate: ctx => {
        const s = ctx.settings;
        return s.rtdbAllowInputRelay && s.rtdbInputChannelName === s.rtdbOutputChannelName
          && s.rtdbInputChannelSecret === s.rtdbOutputChannelSecret
          ? ['Relaying received characters needs receive and send on different channels, to avoid a feedback loop.']
          : [];
      },
    },
    soundStep({
      detail: 'Morse received from the shared channel, and the Morse you send, is played through it.',
      validate: ctx => sidetoneProblems(
        ctx.settings,
        ctx.settings.rtdbInputEnabled ? [ctx.settings.rtdbInputSource] : [],
        'Morse from the shared channel',
      ),
    }),
  ],
};
