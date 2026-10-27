/**
 * Morse Code Studio
 */

import { answerIs, settingIs } from '../engine/conditions';
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
      when: settingIs('keyboardKeyerEnabled', true),
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
      when: settingIs('midiInputEnabled', true),
      repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor' },
    },
    {
      id: 'serialKey',
      title: 'Serial input',
      intro: 'Turn serial keying on or off. Ports and pins are set on the next pages.',
      items: [{ item: 'serial-input' }],
    },
    {
      id: 'serialIn',
      title: 'Serial input',
      intro: 'One page per serial input mapping.',
      when: settingIs('serialInputEnabled', true),
      repeat: { list: 'serialInputMappings', item: 'serial-input-mapping-editor' },
    },
    {
      id: 'serialOutKey',
      title: 'Serial output',
      intro: 'Turn serial (DTR/RTS) output on or off. Ports and pins are set on the next pages.',
      items: [{ item: 'serial-output' }],
    },
    {
      id: 'serialOut',
      title: 'Serial output',
      intro: 'One page per serial output mapping.',
      when: settingIs('serialEnabled', true),
      repeat: { list: 'serialOutputMappings', item: 'serial-output-mapping-editor' },
    },
    {
      id: 'winkeyer',
      title: 'WinKeyer',
      intro: 'Choose whether to key through a WinKeyer, and its port, speed and direction.',
      items: [{ item: 'winkeyer' }],
    },
    {
      id: 'cwDetector',
      title: 'CW tone detector',
      intro: 'Decode CW tones from an audio input.',
      items: [{ item: 'cw-detector' }],
    },
    {
      id: 'micKey',
      title: 'Straight key via mic',
      intro: 'Read a hardware key through the microphone with a pilot tone.',
      items: [{ item: 'mic' }],
    },
    {
      id: 'rtdbIn',
      title: 'Firebase input',
      intro: 'Receive morse from a Firebase channel.',
      items: [{ item: 'rtdb-input' }],
    },
    {
      id: 'rtdbOut',
      title: 'Firebase output',
      intro: 'Send morse to a Firebase channel.',
      items: [{ item: 'rtdb-output' }],
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
      when: settingIs('midiOutputEnabled', true),
      repeat: { list: 'midiOutputMappings', item: 'midi-output-mapping-editor' },
    },
  ],
};
