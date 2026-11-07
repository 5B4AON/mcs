/**
 * Morse Code Studio
 */

import { answerIs, noSendPracticeInput, sendPracticeUsesPaddle } from '../engine/conditions';
import { ForcedSetting, WizardFlow } from '../engine/flow-types';
import { screenForced, screenStep, soundStep, speedStep } from './shared-steps';
import { sendPracticeSources, sidetoneProblems } from './direction-checks';

const SWITCH_MODE = 'switch-mode';

/** Setting changes this goal always makes, plus the ones the user chose with the mode and screen questions. */
const FORCED: ForcedSetting[] = [
  { key: 'sendPracticeEnabled', value: true, label: 'Send practice on' },
  { key: 'encoderMode', value: 'send-practice', label: 'Switch the main screen to Send practice', when: answerIs(SWITCH_MODE, 'yes') },
  ...screenForced('key'),
];

/**
 * Goal "Practice sending Morse": which keys count, the content (including the
 * Koch lesson), how a round is checked, the keyer speed (only when a paddle is ticked and on), the pattern hint, the
 * pipeline, the sidetone, the main-screen mode and the screen. Applying always
 * turns Send practice on. The pipeline (this device only, or full) is the
 * user's explicit choice on its own step and stays at its current value
 * (`local` by default); the wizard never turns an input or an output route on.
 * The encoder mode changes
 * only when the user answers "yes" to the explicit mode question. There is no
 * Farnsworth step (the operator's hands set the gaps) and no Lens option (one
 * latest character does not suit practice).
 */
export const SEND_PRACTICE_FLOW: WizardFlow = {
  id: 'send-practice',
  title: 'Practice sending Morse',
  goal: 'send-practice',
  forced: FORCED,
  validateWithFlowSettings: true,
  levels: true,
  // Provisional suggestions per level, replaced by the table approved in #140. Novice keeps the app's gentle defaults.
  levelDefaults: {
    intermediate: { sendPracticeContentMode: 'words', sendPracticeCheckMode: 'auto' },
    expert: { sendPracticeContentMode: 'callsigns', sendPracticeCheckMode: 'auto', sendPracticeRounds: 3, sendPracticeHint: 'off' },
  },
  steps: [
    {
      id: 'no-input',
      title: 'No key is switched on yet',
      intro: 'Send Practice only counts keys that are switched on, and none of the keys ticked on the next page is. You can carry on and choose your settings now, but to key the text you also need to switch a key on: open Settings > Inputs for a keyboard paddle, MIDI or serial input, or run the "Key and see the text" guide from the goal list. This guide never switches a device on for you.',
      helpSection: 's3-6',
      when: noSendPracticeInput,
    },
    {
      id: 'keys',
      title: 'Which keys do you practise with?',
      intro: 'Only the ticked keys count as keying the text. Greyed keys are set up but switched off in Settings. A key set up in Settings is never switched on here.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-keys' }],
    },
    {
      id: 'content',
      title: 'What do you want to key?',
      intro: 'Choose the content (random characters, words, callsigns or Koch method lessons), how many groups to key in a round and, for characters, which kinds to use.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-content' }],
    },
    {
      id: 'checking',
      level: 'intermediate',
      title: 'How is it checked?',
      intro: 'Check as you go marks each character as you key it. Check at the end shows what you got right once you have keyed the whole text. More rounds give a score for each round and an average.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-checking' }],
    },
    speedStep({ keyer: true }, {
      level: 'intermediate',
      intro: 'The keyer speed decides how clean the dits and dahs of your paddle are, so a speed you can keep up with decodes best. A straight key is timed by your hand, so this page is only shown when a paddle is ticked and switched on.',
      when: sendPracticeUsesPaddle,
    }),
    {
      id: 'hint',
      level: 'expert',
      title: 'Help for the eyes',
      intro: 'The pattern hint shows the dots and dashes of the character you are keying next. Turn it off when you know the characters.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-hint' }],
    },
    {
      id: 'safety',
      level: 'expert',
      title: 'Where does your keying go?',
      intro: 'This device only is the safe choice: your keying is heard through the sidetone and nothing is sent to serial, MIDI, WinKeyer or online outputs. Full pipeline also sends it to the outputs you have already switched on in Settings. This guide never switches an output on.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-pipeline' }],
    },
    soundStep({
      detail: 'Your keying is heard through it. Make sure it is on and at a comfortable volume.',
      validate: ctx => sidetoneProblems(ctx.settings, sendPracticeSources(ctx.settings), 'what you key'),
    }),
    {
      id: 'mode',
      title: 'Start practising now?',
      intro: 'Send practice has its own mode on the main screen. If you answer no, the Mode select stays as it is and you can choose Send practice there later.',
      helpSection: 's3-6',
      questions: [{
        id: SWITCH_MODE,
        label: 'Switch the main screen to Send practice now?',
        kind: 'single',
        default: 'no',
        defaultFrom: settings => (settings.encoderMode === 'send-practice' ? 'yes' : undefined),
        defaultByLevel: { novice: 'yes', intermediate: 'no', expert: 'no' },
        options: [
          { value: 'yes', label: 'Yes, switch to Send practice', hint: 'The Mode select shows Send practice and you can press Start after applying.' },
          { value: 'no', label: 'No, leave the mode as it is' },
        ],
      }],
    },
    { ...screenStep('key', { lens: false }), level: 'intermediate' },
  ],
};
