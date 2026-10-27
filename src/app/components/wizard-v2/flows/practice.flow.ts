/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, soundStep, speedStep } from './shared-steps';

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
    speedStep({ encoder: true }, {
      intro: 'Practice sequences play at this speed. Slower is easier to copy while you learn.',
    }),
    farnsworthStep({ applies: 'rx' }),
    {
      id: 'practice',
      title: 'What do you want to copy?',
      intro: 'Choose the content, how it is scored and how many rounds. This goal keeps practice on this device only, whatever the pipeline below shows.',
      helpSection: 's3-5',
      items: [{ item: 'practice' }],
    },
    soundStep({
      detail: 'Practice sequences are played through it. Make sure it is on and at a comfortable volume.',
    }),
  ],
};
