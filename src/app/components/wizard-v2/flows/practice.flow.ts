/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, soundStep, speedStep } from './shared-steps';
import { farnsworthProblems, sidetoneProblems } from './direction-checks';

/**
 * Goal "Practice receiving Morse": content, feedback and rounds, speed,
 * Farnsworth, the pipeline, who the practice counts as (direction, name,
 * colour) and the sidetone; each part of the copy-practice card is its own
 * step. Applying always turns copy practice on. The pipeline is the user's
 * explicit choice (it stays at its current value, `local` by default), so the
 * wizard never turns an output route on. The shell also selects the Practice
 * encoder mode on Apply and the app moves focus to the Start button (or the
 * input box for Type-along).
 */
export const PRACTICE_FLOW: WizardFlow = {
  id: 'practice',
  title: 'Practice receiving Morse',
  goal: 'practice',
  forced: [
    { key: 'practiceEnabled', value: true, label: 'Copy practice on' },
  ],
  levels: true,
  // Provisional suggestions per level (see #140); Novice keeps the app's gentle defaults
  levelDefaults: {
    intermediate: { practiceContentMode: 'words' },
    expert: { practiceContentMode: 'callsigns', practiceRounds: 3 },
  },
  steps: [
    {
      id: 'content',
      title: 'What do you want to copy?',
      intro: 'Choose the content: random characters, words, callsigns or Koch method lessons, how many groups to play in a round and, for characters, which kinds to use.',
      helpSection: 's3-5',
      items: [{ item: 'practice-content' }],
    },
    {
      id: 'feedback',
      title: 'How is it scored?',
      intro: 'Type-along: type what you hear, then check it. Blurred hides the text until you peek, and Listen only shows it as it plays. The Koch method is always Type-along. More rounds give a score for each round and an average.',
      helpSection: 's3-5',
      items: [{ item: 'practice-feedback' }],
    },
    speedStep({ encoder: true }, {
      intro: 'Practice sequences play at this speed. Slower is easier to copy while you learn.',
    }),
    farnsworthStep({
      applies: 'rx', level: 'intermediate',
      validate: ctx => farnsworthProblems(ctx.settings, [ctx.settings.practiceSource], 'the practice'),
    }),
    {
      id: 'pipeline',
      level: 'expert',
      title: 'Where does the practice go?',
      intro: 'This device only is the safe choice: the practice is heard through the sidetone and nothing is sent to serial, MIDI, WinKeyer or online outputs. Full pipeline also sends it to the outputs you have already switched on in Settings. This guide never switches an output on.',
      helpSection: 's3-5',
      items: [{ item: 'practice-pipeline' }],
    },
    {
      id: 'identity',
      level: 'expert',
      title: 'Who is practising?',
      intro: 'Optional. Direction says whether the practice counts as received (RX) or sent (TX) Morse. A name and colour label the practice text where names are shown.',
      helpSection: 's3-5',
      items: [{ item: 'practice-identity' }],
    },
    soundStep({
      detail: 'Practice sequences are played through it. Make sure it is on and at a comfortable volume.',
      validate: ctx => sidetoneProblems(ctx.settings, [ctx.settings.practiceSource], 'the practice'),
    }),
  ],
};
