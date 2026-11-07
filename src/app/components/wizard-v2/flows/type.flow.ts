/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, screenForced, screenStep, soundStep, speedStep } from './shared-steps';

/**
 * Goal "Type and hear Morse": choose whether text is sent on Enter or live,
 * set up the keyboard encoder, pick the speed, optionally add
 * Farnsworth spacing, and set the sidetone. Typed text plays as sent (TX) Morse,
 * so the Farnsworth step reminds the user to apply it to TX. The last step
 * chooses the screen (main, full screen, or full screen with Lens). The flow
 * changes only these settings: it never turns an output route on. The encoder
 * mode changes only through the explicit send-mode choice on its first page.
 */
export const TYPE_FLOW: WizardFlow = {
  id: 'type',
  title: 'Type and hear Morse',
  goal: 'type',
  forced: screenForced('type'),
  levels: true,
  steps: [
    {
      id: 'typing-mode',
      title: 'How your text is sent',
      intro: 'Choose when typed text is played as Morse.',
      helpSection: 's3-1',
      items: [{ item: 'encoder-mode' }],
    },
    {
      id: 'encoder',
      level: 'intermediate',
      title: 'Keyboard encoder',
      intro: 'Choose whether typed text counts as sent (TX) or received (RX).',
      helpSection: 's5-1',
      items: [{ item: 'encoder-source' }],
    },
    {
      id: 'encoder-name',
      level: 'expert',
      title: 'Name and colour of typed text',
      intro: 'Optional. A name and colour label the text you type, so it stands out where names are shown. A new name starts a new line.',
      helpSection: 's5-1',
      items: [{ item: 'encoder-identity' }],
    },
    speedStep({ encoder: true }, {
      intro: 'Text you type is sent as Morse at this speed. You can change it later with the speed buttons on the main screen.',
    }),
    farnsworthStep({ applies: 'tx', level: 'intermediate' }),
    soundStep({
      detail: 'The text you type is played through it. Radio, serial, MIDI and online outputs are not touched.',
    }),
    { ...screenStep('type'), level: 'intermediate' },
  ],
};
