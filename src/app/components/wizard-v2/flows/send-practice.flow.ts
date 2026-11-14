/**
 * Morse Code Studio
 */

import { all, answerIs, any, noSendPracticeInput, not, sendPracticeUsesPaddle, settingIs } from '../engine/conditions';
import { Condition, ForcedSetting, WizardFlow } from '../engine/flow-types';
import { isTouchDevice } from '../../../services/settings-common';
import { screenStep, soundStep, speedStep } from './shared-steps';
import { sendPracticeSources, sidetoneProblems } from './direction-checks';

const SWITCH_MODE = 'switch-mode';
const ASSIST = 'assist';

/** The book is the content: checking, rounds and the pattern hint do not apply, so those pages give way to the book's own. */
const ebook: Condition = settingIs('sendPracticeContentMode', 'ebook');

/** A book always opens in the full screen (and in Send practice mode); otherwise the screen question decides. */
const fullscreen: Condition = any(ebook, answerIs('screen', 'fullscreen'));

/** On a touch screen the guide switches the fullscreen touch keyer on as a straight key and counts it as a key. */
const touchDevice: Condition = () => isTouchDevice();
const touchNotCounted: Condition = ctx => !ctx.settings.sendPracticeInputs.includes('touch');

/** Setting changes this goal always makes, plus the ones the user chose with the mode and screen questions. */
const FORCED: ForcedSetting[] = [
  { key: 'sendPracticeEnabled', value: true, label: 'Send practice on' },
  { key: 'touchKeyerEnabled', value: true, label: 'Turn the fullscreen touch keyer on', when: touchDevice },
  { key: 'touchKeyerMode', value: 'straight', label: 'Use the fullscreen touch keyer as a straight key', when: all(touchDevice, settingIs('touchKeyerEnabled', false), ctx => ctx.level === 'novice') },
  { key: 'sendPracticeInputs', value: ctx => [...ctx.settings.sendPracticeInputs, 'touch'], label: 'Count the fullscreen touch keyer as a key', when: all(touchDevice, touchNotCounted) },
  { key: 'encoderMode', value: 'send-practice', label: 'Switch the main screen to Send practice', when: any(ebook, answerIs(SWITCH_MODE, 'yes')) },
  { key: 'fullscreenLensEnabled', value: false, label: 'Turn Lens off in the full screen', when: fullscreen },
  { key: 'fullscreenInputMode', value: 'key', label: 'Open the full screen in Key mode', when: fullscreen },
  { key: 'sendPracticeEbookAssist', value: answerIs(ASSIST, 'yes'), label: ctx => (ctx.answers[ASSIST] === 'yes' ? 'Show the next letters above the book' : 'Do not show the next letters above the book'), when: ebook },
];

/**
 * Goal "Practice sending Morse": which keys count, the content (including the
 * Koch lesson), how a round is checked, the keyer speed (only when a paddle is ticked and on), the pattern hint, the
 * pipeline, the sidetone, the main-screen mode and the screen. Applying always
 * turns Send practice on. The pipeline (this device only, or full) is the
 * user's explicit choice on its own step and stays at its current value
 * (`local` by default); the wizard never turns an output route on, and the
 * only input it switches on is the fullscreen touch keyer, as a straight key and
 * counted as a key, on a touch screen.
 * The encoder mode changes
 * only when the user answers "yes" to the explicit mode question. There is no
 * Farnsworth step (the operator's hands set the gaps) and no Lens option (one
 * latest character does not suit practice). With a book as the content the
 * checking, pattern hint, mode and screen pages give way to the book page
 * (load a file, custom text or web address; the book is loaded at once, outside
 * Apply and Revert), and Apply switches to Send practice and opens the full screen.
 */
export const SEND_PRACTICE_FLOW: WizardFlow = {
  id: 'send-practice',
  title: 'Practice sending Morse',
  goal: 'send-practice',
  forced: FORCED,
  fullscreenWhen: fullscreen,
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
      when: all(noSendPracticeInput, not(touchDevice)),
    },
    {
      id: 'keys',
      title: 'Which keys do you practise with?',
      intro: 'Only the ticked keys count as keying the text. Greyed keys are set up but switched off in Settings. On a touch screen this guide switches the fullscreen touch keyer on and counts it.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-keys' }],
    },
    {
      id: 'touchMode',
      level: 'intermediate',
      title: 'Fullscreen touch keyer',
      intro: 'Choose how the touch screen keys: as a straight key (one button, you time the dots and dashes) or as a paddle (two buttons). It works only in the full-screen view.',
      helpSection: 's4-3',
      when: touchDevice,
      items: [{ item: 'touch-keyer-mode' }],
    },
    {
      id: 'content',
      title: 'What do you want to key?',
      intro: 'Choose the content (random characters, words, callsigns, Koch method lessons or a book of your own), how many groups to key in a round and, for characters, which kinds to use.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-content' }],
    },
    {
      id: 'book',
      title: 'Which book or text?',
      intro: 'Choose a file, type or paste your own text (your name, for example), or give a web address. A book has no score, rounds or pattern hint. It loads as soon as you choose it.',
      helpSection: 's3-7',
      when: ebook,
      items: [{ item: 'send-practice-book' }],
    },
    {
      id: 'assist',
      title: 'Show how to key it?',
      intro: 'Assist shows the next letters above the text with the dots and dashes of the next one, so you can see how to key it. Good for beginners and children. You can switch it on or off at any time with the round button over the book.',
      helpSection: 's3-7',
      when: ebook,
      questions: [{
        id: ASSIST,
        label: 'Assist',
        kind: 'single',
        default: 'no',
        defaultFrom: settings => (settings.sendPracticeEbookAssist ? 'yes' : undefined),
        defaultByLevel: { novice: 'yes', intermediate: 'no', expert: 'no' },
        options: [
          { value: 'yes', label: 'Yes, show the next letters and their dots and dashes' },
          { value: 'no', label: 'No, just the text in the book' },
        ],
      }],
    },
    {
      id: 'checking',
      level: 'intermediate',
      when: not(ebook),
      title: 'How is it checked?',
      intro: 'Check as you go marks each character as you key it. Check at the end shows what you got right once you have keyed the whole text. More rounds give a score for each round and an average.',
      helpSection: 's3-6',
      items: [{ item: 'send-practice-checking' }],
    },
    speedStep({ keyer: true }, {
      level: 'intermediate',
      intro: 'The keyer speed decides how clean the dits and dahs of your paddle are, so a speed you can keep up with decodes best. A straight key is timed by your hand, so this page is only shown when a paddle is ticked and switched on.',
      when: any(sendPracticeUsesPaddle, all(touchDevice, settingIs('touchKeyerMode', 'paddle'))),
    }),
    {
      id: 'hint',
      level: 'expert',
      when: not(ebook),
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
      when: not(ebook),
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
    { ...screenStep('key', { lens: false }), level: 'intermediate', when: not(ebook) },
  ],
};
