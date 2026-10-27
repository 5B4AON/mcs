/**
 * Morse Code Studio
 */

import { settingIs } from '../engine/conditions';
import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, soundStep, speedStep } from './shared-steps';

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
  steps: [
    speedStep({ keyer: true }, { helpSection: 's6-2' }),
    farnsworthStep(),
    {
      id: 'midiKey',
      title: 'Use a MIDI key or paddle',
      intro: 'Tick the box to use MIDI input. Your device, channel and notes are set on the next pages.',
      helpSection: 's6-2',
      items: [{ item: 'midi-input' }],
      validate: ctx => ctx.settings.midiInputEnabled ? [] : ['Tick "Use MIDI input" to continue, or close the wizard.'],
    },
    {
      id: 'midiIn',
      title: 'MIDI mapping',
      intro: 'One page per mapping. Choose the device, press Detect and play the note for each paddle or key.',
      helpSection: 's6-2',
      when: settingIs('midiInputEnabled', true),
      repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor' },
      validate: ctx => ctx.settings.midiInputMappings.some(m => m.enabled)
        ? []
        : ['Enable and configure at least one MIDI key or paddle mapping.'],
    },
    soundStep({
      detail: 'Your keying is played through it, so you hear what you send.',
    }),
  ],
};
