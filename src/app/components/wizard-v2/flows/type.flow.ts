/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { speedStep } from './shared-steps';

/**
 * Goal "Type text and hear it as Morse": pick the speed, optionally add
 * Farnsworth spacing, and set the sidetone. Typed text plays as sent (TX) Morse,
 * so the Farnsworth step reminds the user to apply it to TX. The flow changes
 * only these settings: it never turns an output route on or switches the
 * encoder mode.
 */
export const TYPE_FLOW: WizardFlow = {
  id: 'type',
  title: 'Type text and hear it as Morse',
  goal: 'type',
  nextSteps: 'Type some text on the main screen and press Enter. Nothing is sent until you choose the send action.',
  steps: [
    {
      ...speedStep({ encoder: true }),
      title: 'How fast should typed text play?',
      intro: 'Text you type is sent as Morse at this speed. You can change it later with the speed buttons on the main screen.',
    },
    {
      id: 'farnsworth',
      title: 'Make the Morse easier to follow?',
      intro: 'Farnsworth timing plays each character at full speed but stretches the gaps between characters and words, so the Morse is easier to follow while each character keeps its real sound. Leave it off to keep your current timing.',
      items: [{
        item: 'farnsworth',
        hint: 'Typed text plays as sent (TX) Morse. Choose "TX Only" or "Both RX and TX" so the gaps you hear are stretched.',
      }],
    },
    {
      id: 'sidetone',
      title: 'Hear the Morse',
      intro: 'The sidetone is the beep you hear while Morse plays. It only plays on this device. Radio, serial, MIDI and online outputs are not touched.',
      items: [{ item: 'sidetone' }],
    },
  ],
};
