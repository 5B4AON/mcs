/**
 * Morse Code Studio
 */

import { answerIs } from '../engine/conditions';
import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, speedStep } from './shared-steps';

/**
 * Temporary demo flow that exercises the engine and the shell: one question
 * and one settings item. Removed when the real goals have been migrated.
 */
export const DEMO_FLOW: WizardFlow = {
  id: 'demo',
  title: 'Demo flow',
  goal: 'type',
  forced: [
    { key: 'sidetoneEnabled', value: true, label: 'Turn the sidetone on', when: answerIs('wantSound', true) },
  ],
  steps: [
    {
      id: 'wantSound',
      title: 'Do you want to hear Morse?',
      intro: 'This question only decides whether the next step is shown.',
      questions: [
        { id: 'wantSound', label: 'Play Morse as sound', kind: 'boolean', default: false },
      ],
    },
    {
      id: 'sound',
      title: 'Choose your sound',
      intro: 'These are the same controls you find in Settings > Outputs.',
      when: answerIs('wantSound', true),
      items: [{ item: 'sidetone', mode: 'embedded' }],
    },
    speedStep({ encoder: true, keyer: true }),
    farnsworthStep(),
    {
      id: 'moreItems',
      title: 'Encoder, audio key output and vibration',
      intro: 'The same controls as in Settings, shown flat. Tests that use hardware are only in Settings.',
      items: [{ item: 'encoder' }, { item: 'audio-output' }, { item: 'vibration' }],
    },
    {
      id: 'display',
      title: 'Practice and display',
      intro: 'Copy practice, text blurring, prosigns and emojis, flat.',
      items: [{ item: 'practice' }, { item: 'text-blur' }, { item: 'show-prosigns' }, { item: 'prosign-actions' }, { item: 'emojis' }],
    },
    {
      id: 'screenKeys',
      title: 'Mouse, touch and sprite keys',
      intro: 'Keying with the mouse, the touch screen and the on-screen straight key.',
      items: [{ item: 'mouse-keyer' }, { item: 'touch-keyer' }, { item: 'sprite-key' }],
    },
    {
      id: 'keyer',
      title: 'Keyboard keyer',
      intro: 'Turn the keyboard keyer on or off. Your keys are set on the next pages.',
      items: [{ item: 'keyboard-keyer' }],
    },
    {
      id: 'keys',
      title: 'Keyboard keys',
      intro: 'One page per keyboard mapping, with the same fields as Settings > Inputs.',
      repeat: { list: 'keyboardInputMappings', item: 'keyboard-mapping-editor' },
    },
    {
      id: 'midiKey',
      title: 'MIDI input',
      intro: 'Turn MIDI keying on or off. Your notes are set on the next pages.',
      items: [{ item: 'midi-input' }],
    },
    {
      id: 'midiIn',
      title: 'MIDI input',
      intro: 'One page per MIDI input mapping.',
      repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor' },
    },
    {
      id: 'midiOutKey',
      title: 'MIDI output',
      intro: 'Turn MIDI output on or off. Your notes are set on the next pages.',
      items: [{ item: 'midi-output' }],
    },
    {
      id: 'midiOut',
      title: 'MIDI output',
      intro: 'One page per MIDI output mapping.',
      repeat: { list: 'midiOutputMappings', item: 'midi-output-mapping-editor' },
    },
  ],
};
