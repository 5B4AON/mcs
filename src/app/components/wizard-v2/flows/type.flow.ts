/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, soundStep, speedStep } from './shared-steps';

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
  steps: [
    speedStep({ encoder: true }, {
      intro: 'Text you type is sent as Morse at this speed. You can change it later with the speed buttons on the main screen.',
    }),
    farnsworthStep({ applies: 'tx' }),
    soundStep({
      detail: 'The text you type is played through it. Radio, serial, MIDI and online outputs are not touched.',
    }),
  ],
};
