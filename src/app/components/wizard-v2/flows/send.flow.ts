/**
 * Morse Code Studio
 */

import { all, answerIncludes, any, not } from '../engine/conditions';
import { Condition, ForcedSetting, WizardFlow } from '../engine/flow-types';
import { AppSettings } from '../../../services/settings.service';
import { farnsworthStep, screenForced, screenStep, soundStep, speedStep } from './shared-steps';

/** The local keyers this goal can switch on, with the setting that enables each. */
const METHODS: {
  id: string;
  label: string;
  /** How the keyer is named in the review ("Turn the ... on") */
  phrase: string;
  key: 'keyboardKeyerEnabled' | 'mouseKeyerEnabled' | 'touchKeyerEnabled' | 'midiInputEnabled';
}[] = [
  { id: 'keyboard', label: 'Keyboard keyer', phrase: 'keyboard key or paddle', key: 'keyboardKeyerEnabled' },
  { id: 'mouse', label: 'Mouse keyer', phrase: 'mouse keyer', key: 'mouseKeyerEnabled' },
  { id: 'touch', label: 'Touch keyer', phrase: 'touch keyer', key: 'touchKeyerEnabled' },
  { id: 'midi', label: 'MIDI keyer', phrase: 'MIDI keyer', key: 'midiInputEnabled' },
];

/** Each chosen keyer is switched on, each unchosen one off. */
const FORCED: ForcedSetting[] = [...METHODS.flatMap(m => [
  { key: m.key, value: true, label: `Turn the ${m.phrase} on`, when: answerIncludes('methods', m.id) },
  { key: m.key, value: false, label: `Turn the ${m.phrase} off`, when: not(answerIncludes('methods', m.id)) },
]), ...screenForced('key')];

/**
 * True when a chosen keyer has a paddle set up: a paddle keyboard or MIDI
 * mapping, a mouse button that dits or dahs, or the touch keyer in paddle mode.
 * Only a paddle makes the keyer generate the dits and dahs, so only then do the
 * keyer speed and Farnsworth timing matter.
 */
const paddleConfigured: Condition = any(
  all(answerIncludes('methods', 'keyboard'),
    ctx => ctx.settings.keyboardInputMappings.some(m => m.enabled && m.mode === 'paddle')),
  all(answerIncludes('methods', 'mouse'),
    ctx => [ctx.settings.mouseLeftAction, ctx.settings.mouseMiddleAction, ctx.settings.mouseRightAction]
      .some(action => action === 'dit' || action === 'dah')),
  all(answerIncludes('methods', 'touch'), ctx => ctx.settings.touchKeyerMode === 'paddle'),
  all(answerIncludes('methods', 'midi'),
    ctx => ctx.settings.midiInputMappings.some(m => m.enabled && m.mode === 'paddle')),
);

const PADDLE_ONLY = 'This only applies to automatic keying with a paddle, where the keyer generates the dit and dah timings. A straight key is timed by your hand, so it is not affected.';

/**
 * Goal "Practice sending Morse": choose which local keyers to use (keyboard,
 * mouse, touch, MIDI), then one step per chosen keyer (a summary of the keyboard
 * or MIDI mappings, each opened to edit), then the keyer speed and Farnsworth
 * timing when a paddle is set up, then the sidetone. Local keyers never start
 * audio or enable radio, serial or online outputs. Choosing the MIDI keyer
 * switches MIDI input on; the app connects to it when the guide is applied.
 */
export const SEND_FLOW: WizardFlow = {
  id: 'send',
  title: 'Practice sending Morse',
  goal: 'send',
  forced: FORCED,
  steps: [
    {
      id: 'methods',
      title: 'Choose how you will send',
      intro: 'Keyboard, mouse, touch and MIDI keyers are inputs that key Morse on this device. They do not start audio or enable radio, serial or online outputs. A MIDI keyer reads a MIDI key or paddle you connect; the browser may ask for MIDI access when you press Apply.',
      helpSection: 's4-1',
      questions: [{
        id: 'methods',
        label: 'Local keyers',
        kind: 'multi',
        default: [],
        defaultFrom: (s: AppSettings) => METHODS.filter(m => s[m.key]).map(m => m.id),
        options: METHODS.map(m => ({ value: m.id, label: m.label })),
      }],
      validate: ctx => Array.isArray(ctx.answers['methods']) && ctx.answers['methods'].length
        ? []
        : ['Choose a keyboard, mouse, touch or MIDI keyer.'],
    },
    {
      id: 'keyboard',
      title: 'Keyboard keys',
      intro: 'Use Detect to press the key you want, then pick a name and colour.',
      helpSection: 's4-1',
      when: answerIncludes('methods', 'keyboard'),
      repeat: { list: 'keyboardInputMappings', item: 'keyboard-mapping-editor' },
      validate: ctx => ctx.settings.keyboardInputMappings.some(m => m.enabled && m.keyCode)
        ? []
        : ['Enable and configure at least one keyboard key or paddle mapping.'],
    },
    {
      id: 'mouse',
      title: 'Mouse keyer',
      intro: 'Choose what each mouse button does.',
      helpSection: 's4-2',
      when: answerIncludes('methods', 'mouse'),
      items: [{ item: 'mouse-keyer' }],
    },
    {
      id: 'touch',
      title: 'Touch keyer',
      intro: 'Choose how the touch screen keys.',
      helpSection: 's4-3',
      when: answerIncludes('methods', 'touch'),
      items: [{ item: 'touch-keyer' }],
    },
    {
      id: 'midi',
      title: 'MIDI keyer',
      intro: 'Choose the device, press Detect and play the note for each paddle or key.',
      helpSection: 's6-2',
      when: answerIncludes('methods', 'midi'),
      repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor' },
      validate: ctx => ctx.settings.midiInputMappings.some(m => m.enabled)
        ? []
        : ['Enable and configure at least one MIDI key or paddle mapping.'],
    },
    speedStep({ keyer: true }, {
      when: paddleConfigured,
      intro: `Pick the keyer speed for your paddle. ${PADDLE_ONLY} You can change it later from the main menu.`,
    }),
    farnsworthStep({
      when: paddleConfigured,
      intro: `Optional. Farnsworth timing keeps each character at full speed but stretches the gaps between characters and words. ${PADDLE_ONLY} Leave it off for normal timing.`,
    }),
    soundStep({
      detail: 'Your keying is played through it, so you hear what you send.',
    }),
    screenStep('key'),
  ],
};
