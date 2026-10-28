/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, screenForced, screenStep, soundStep, speedStep } from './shared-steps';

/**
 * Goal "Type text and hear it as Morse": choose whether text is sent on Enter or live,
 * set up the keyboard encoder, pick the speed, optionally add
 * Farnsworth spacing, and set the sidetone. Typed text plays as sent (TX) Morse,
 * so the Farnsworth step reminds the user to apply it to TX. The last step
 * chooses the screen (main, full screen, or full screen with Lens). The flow
 * changes only these settings: it never turns an output route on. The encoder
 * mode changes only through the explicit send-mode choice on its first page.
 */
export const TYPE_FLOW: WizardFlow = {
  id: 'type',
  title: 'Type text and hear it as Morse',
  goal: 'type',
  forced: screenForced('type'),
  steps: [
    {
      id: 'typing-mode',
      title: 'How your text is sent',
      intro: 'Choose when typed text is played as Morse. In Send on Enter you write the message first and send it with Enter; in Live every letter is played as you type it.',
      helpSection: 's3-1',
      items: [{ item: 'encoder-mode' }],
    },
    {
      id: 'encoder',
      title: 'Keyboard encoder',
      intro: 'Say whether the text you type counts as sent (TX) or received (RX) Morse, and optionally give it a name and colour for the conversation views.',
      helpSection: 's3-1',
      items: [{ item: 'encoder' }],
    },
    speedStep({ encoder: true }, {
      intro: 'Text you type is sent as Morse at this speed. You can change it later with the speed buttons on the main screen.',
    }),
    farnsworthStep({ applies: 'tx' }),
    soundStep({
      detail: 'The text you type is played through it. Radio, serial, MIDI and online outputs are not touched.',
    }),
    screenStep('type'),
  ],
};
