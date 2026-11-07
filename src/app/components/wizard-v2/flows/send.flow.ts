/**
 * Morse Code Studio
 */

import { all, answerIncludes, any, not, settingIs } from '../engine/conditions';
import { Condition, ForcedSetting, WizardFlow } from '../engine/flow-types';
import { AppSettings } from '../../../services/settings.service';
import { leavePracticeForced, leavePracticeStep, screenForced, screenStep, soundStep, speedStep } from './shared-steps';
import { MIDI_SUPPORTED, NOT_AVAILABLE_HINT } from './device-support';

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

/** True when this device cannot use the keyer (only MIDI depends on the browser) */
const methodUnavailable = (id: string): boolean => id === 'midi' && !MIDI_SUPPORTED;

/** Each chosen keyer is switched on, each unchosen one off. */
const FORCED: ForcedSetting[] = [...METHODS.flatMap(m => [
  { key: m.key, value: true, label: `Turn the ${m.phrase} on`, when: answerIncludes('methods', m.id) },
  { key: m.key, value: false, label: `Turn the ${m.phrase} off`, when: not(answerIncludes('methods', m.id)) },
]), ...leavePracticeForced(), ...screenForced('key')];

/** True when a mouse button is set to dit or dah, which makes the mouse a paddle. */
const mouseHasPaddle: Condition = ctx => [ctx.settings.mouseLeftAction, ctx.settings.mouseMiddleAction, ctx.settings.mouseRightAction]
  .some(action => action === 'dit' || action === 'dah');

/**
 * True when a chosen keyer has a paddle set up: a paddle keyboard or MIDI
 * mapping, a mouse button that dits or dahs, or the touch keyer in paddle mode.
 * Only a paddle makes the keyer generate the dits and dahs, so only then does the
 * keyer speed matter. Farnsworth timing is never asked here: no keyer applies it,
 * because the operator's hands set the gaps.
 */
const paddleConfigured: Condition = any(
  all(answerIncludes('methods', 'keyboard'),
    ctx => ctx.settings.keyboardInputMappings.some(m => m.enabled && m.mode === 'paddle')),
  all(answerIncludes('methods', 'mouse'), mouseHasPaddle),
  all(answerIncludes('methods', 'touch'), ctx => ctx.settings.touchKeyerMode === 'paddle'),
  all(answerIncludes('methods', 'midi'),
    ctx => ctx.settings.midiInputMappings.some(m => m.enabled && m.mode === 'paddle')),
);

const PADDLE_ONLY = 'This only applies to a paddle, where the keyer makes the dits and dahs. A straight key is timed by your hand, so it is not affected.';

/**
 * Goal "Key and see the text": choose which local keyers to use (keyboard,
 * mouse, touch, MIDI), then one step per chosen keyer (a summary of the keyboard
 * or MIDI mappings, each opened to edit), then the keyer speed when a paddle is
 * set up, then the sidetone. There is no Farnsworth step: your hands time the
 * gaps, so it would change nothing. Local keyers never start
 * audio or enable radio, serial or online outputs. Choosing the MIDI keyer
 * switches MIDI input on; the app connects to it when the guide is applied.
 */
export const SEND_FLOW: WizardFlow = {
  id: 'send',
  title: 'Key and see the text',
  goal: 'send',
  forced: FORCED,
  levels: true,
  steps: [
    leavePracticeStep('Copy practice switches the keyers off, and Send practice shows what you key as a practice prompt instead of in the text area.'),
    {
      id: 'methods',
      title: 'Choose how you will send',
      intro: 'These keyers send Morse from this device. Nothing else is switched on. The browser may ask for MIDI access when you press Apply.',
      helpSection: 's4-1',
      questions: [{
        id: 'methods',
        label: 'Local keyers',
        kind: 'multi',
        default: [],
        defaultFrom: (s: AppSettings) => METHODS.filter(m => s[m.key] && !methodUnavailable(m.id)).map(m => m.id),
        // The MIDI keyer needs hardware, so a Novice is not offered it
        optionsFrom: ctx => METHODS.filter(m => m.id !== 'midi' || ctx.level !== 'novice').map(m => methodUnavailable(m.id)
          ? { value: m.id, label: m.label, hint: NOT_AVAILABLE_HINT, disabled: true }
          : { value: m.id, label: m.label }),
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
      items: [{ item: 'mouse-keyer-buttons' }],
    },
    {
      id: 'mousePaddle',
      level: 'intermediate',
      title: 'Mouse paddle behaviour',
      intro: 'A button set to Dit or Dah works as a paddle. Choose which side is which and how holding both buttons behaves.',
      helpSection: 'paddle-modes',
      when: all(answerIncludes('methods', 'mouse'), mouseHasPaddle),
      items: [{ item: 'mouse-keyer-paddle' }],
    },
    {
      id: 'mouseName',
      level: 'expert',
      title: 'Name and colour of mouse keying',
      intro: 'Optional. A name and colour label the text you key with the mouse, so it stands out where names are shown.',
      helpSection: 's4-2',
      when: answerIncludes('methods', 'mouse'),
      items: [{ item: 'mouse-keyer-identity' }],
    },
    {
      id: 'touch',
      title: 'Touch keyer',
      intro: 'Choose how the touch screen keys.',
      helpSection: 's4-3',
      when: answerIncludes('methods', 'touch'),
      items: [{ item: 'touch-keyer-mode' }],
    },
    {
      id: 'touchPaddle',
      level: 'intermediate',
      title: 'Touch paddle behaviour',
      intro: 'Two touch buttons work as a paddle. Choose which side is which and how holding both buttons behaves.',
      helpSection: 'paddle-modes',
      when: all(answerIncludes('methods', 'touch'), settingIs('touchKeyerMode', 'paddle')),
      items: [{ item: 'touch-keyer-paddle' }],
    },
    {
      id: 'touchName',
      level: 'expert',
      title: 'Name and colour of touch keying',
      intro: 'Optional. A name and colour label the text you key by touch, so it stands out where names are shown.',
      helpSection: 's4-3',
      when: answerIncludes('methods', 'touch'),
      items: [{ item: 'touch-keyer-identity' }],
    },
    {
      id: 'midi',
      level: 'intermediate',
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
      level: 'intermediate',
      intro: `Pick the keyer speed for your paddle. ${PADDLE_ONLY} You can change it later from the main menu.`,
    }),
    soundStep({
      detail: 'Your keying is played through it, so you hear what you send.',
    }),
    { ...screenStep('key'), level: 'intermediate' },
  ],
};
