/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { speedStep } from './shared-steps';

/**
 * Goal "Practise receiving Morse": speed, Farnsworth, the copy-practice item
 * (content, feedback, rounds) and the sidetone. Applying always turns copy
 * practice on and keeps it on this device (local pipeline), so no serial, MIDI,
 * WinKeyer or online output is driven. The shell also selects the Practice
 * encoder mode on Apply and the app moves focus to the Start button (or the
 * input box for Type-along).
 */
export const PRACTICE_FLOW: WizardFlow = {
  id: 'practice',
  title: 'Practise receiving Morse',
  goal: 'practice',
  forced: [
    { key: 'practiceEnabled', value: true, label: 'Copy practice on' },
    { key: 'practicePipeline', value: 'local', label: 'Practice plays on this device only' },
  ],
  steps: [
    {
      ...speedStep({ encoder: true }),
      title: 'How fast should practice play?',
      intro: 'Practice sequences play at this speed. Slower is easier to copy while you learn.',
    },
    {
      id: 'farnsworth',
      title: 'Make practice easier to copy?',
      intro: 'Farnsworth timing keeps each character at full speed but stretches the gaps between characters and words. Leave it off for normal timing.',
      items: [{
        item: 'farnsworth',
        hint: 'Practice plays as received (RX) Morse. Choose "RX Only" or "Both RX and TX" so the gaps are stretched.',
      }],
    },
    {
      id: 'practice',
      title: 'What do you want to copy?',
      intro: 'Choose the content, how it is scored and how many rounds. This goal keeps practice on this device only, whatever the pipeline below shows.',
      items: [{ item: 'practice' }],
    },
    {
      id: 'sidetone',
      title: 'Hear the practice',
      intro: 'Practice is played through the sidetone on this device. Make sure it is on and at a comfortable volume.',
      items: [{ item: 'sidetone' }],
    },
  ],
};
