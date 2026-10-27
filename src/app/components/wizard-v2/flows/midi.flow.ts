/**
 * Morse Code Studio
 */

import { settingIs } from '../engine/conditions';
import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, speedStep } from './shared-steps';

/**
 * Goal "Use my paddle or key through MIDI": keyer speed, Farnsworth, an explicit
 * "use MIDI input" tick, one page per MIDI mapping (device, channel, notes with
 * Detect), then the sidetone. MIDI access is requested only by the device
 * buttons inside the mapping pages, never by the wizard itself. The mapping
 * pages are shown only while MIDI input is ticked.
 */
export const MIDI_FLOW: WizardFlow = {
  id: 'midi',
  title: 'Use my paddle or key through MIDI',
  goal: 'midi',
  nextSteps: 'Key on your MIDI device. Nothing sends by itself, and MIDI output is not changed.',
  steps: [
    speedStep({ keyer: true }),
    farnsworthStep(),
    {
      id: 'midiKey',
      title: 'Use a MIDI key or paddle',
      intro: 'Tick the box to use MIDI input. Your device, channel and notes are set on the next pages.',
      items: [{ item: 'midi-input' }],
      validate: ctx => ctx.settings.midiInputEnabled ? [] : ['Tick "Use MIDI input" to continue, or close the wizard.'],
    },
    {
      id: 'midiIn',
      title: 'MIDI mapping',
      intro: 'One page per mapping. Choose the device, press Detect and play the note for each paddle or key.',
      when: settingIs('midiInputEnabled', true),
      repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor' },
      validate: ctx => ctx.settings.midiInputMappings.some(m => m.enabled)
        ? []
        : ['Enable and configure at least one MIDI key or paddle mapping.'],
    },
    {
      id: 'sidetone',
      title: 'Hear your keying',
      intro: 'The sidetone is the beep you hear while you key. It only plays on this device.',
      items: [{ item: 'sidetone' }],
    },
  ],
};
