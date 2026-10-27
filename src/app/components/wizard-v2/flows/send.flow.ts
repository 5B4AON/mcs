/**
 * Morse Code Studio
 */

import { answerIncludes, not } from '../engine/conditions';
import { ForcedSetting, WizardFlow } from '../engine/flow-types';
import { AppSettings } from '../../../services/settings.service';
import { farnsworthStep, speedStep } from './shared-steps';

/** The local keyers this goal can switch on, with the setting that enables each. */
const METHODS: { id: string; label: string; key: 'keyboardKeyerEnabled' | 'mouseKeyerEnabled' | 'touchKeyerEnabled' }[] = [
  { id: 'keyboard', label: 'Keyboard key or paddle', key: 'keyboardKeyerEnabled' },
  { id: 'mouse', label: 'Mouse keyer', key: 'mouseKeyerEnabled' },
  { id: 'touch', label: 'Touch keyer', key: 'touchKeyerEnabled' },
];

/** Each chosen keyer is switched on, each unchosen one off, as the old wizard did. */
const FORCED: ForcedSetting[] = METHODS.flatMap(m => [
  { key: m.key, value: true, label: `Turn the ${m.label.toLowerCase()} on`, when: answerIncludes('methods', m.id) },
  { key: m.key, value: false, label: `Turn the ${m.label.toLowerCase()} off`, when: not(answerIncludes('methods', m.id)) },
]);

/**
 * Goal "Practice sending": choose which local keyers to use (keyboard, mouse,
 * touch), then the speed, then one step per chosen keyer, then the sidetone.
 * Local keyers never start audio or enable radio, MIDI, serial or online outputs.
 */
export const SEND_FLOW: WizardFlow = {
  id: 'send',
  title: 'Practice sending',
  goal: 'send',
  forced: FORCED,
  nextSteps: 'Your chosen keyers are ready. Press or operate a key yourself when you are ready; nothing sends by itself.',
  steps: [
    {
      id: 'methods',
      title: 'Choose how you will send',
      intro: 'Keyboard, mouse and touch keyers are local inputs. They do not start audio or enable radio, MIDI, serial or online outputs.',
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
        : ['Choose a keyboard, mouse or touch keyer.'],
    },
    speedStep({ keyer: true }),
    farnsworthStep(),
    {
      id: 'keyboard',
      title: 'Keyboard keys',
      intro: 'One page per keyboard mapping. Use Detect to press the key you want, then pick a name and colour.',
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
      when: answerIncludes('methods', 'mouse'),
      items: [{ item: 'mouse-keyer' }],
    },
    {
      id: 'touch',
      title: 'Touch keyer',
      intro: 'Choose how the touch screen keys.',
      when: answerIncludes('methods', 'touch'),
      items: [{ item: 'touch-keyer' }],
    },
    {
      id: 'sidetone',
      title: 'Hear your keying',
      intro: 'The sidetone is the beep you hear while you key. It only plays on this device.',
      items: [{ item: 'sidetone' }],
    },
  ],
};
