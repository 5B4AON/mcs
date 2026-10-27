/**
 * Morse Code Studio
 */

import { settingIs } from '../engine/conditions';
import { WizardFlow } from '../engine/flow-types';
import { farnsworthStep, speedStep } from './shared-steps';

/**
 * Goal "Key a radio or device": encoder speed, Farnsworth, then one step per
 * route - MIDI output (one page per mapping), WinKeyer and serial DTR/RTS (one
 * page per mapping) - and the sidetone. The experimental audio key output (and
 * the experimental mic key input) are left out of the wizards; they stay in
 * Settings and the wizards do not touch them. Each route is
 * switched on only by its own tick, so a route you do not tick is turned off
 * or left off. The wizard never opens a port or device and never sends Morse;
 * ports and devices are chosen with the item's own buttons. At least one route
 * must be on, and each route must name an exact target.
 */
export const HARDWARE_FLOW: WizardFlow = {
  id: 'hardware',
  title: 'Key a radio or device',
  goal: 'hardware',
  steps: [
    speedStep({ encoder: true }),
    farnsworthStep(),
    {
      id: 'midiOut',
      title: 'MIDI output',
      intro: 'Sends keying to a MIDI device. Tick the box to set up mappings on the next pages, or leave it to skip this route.',
      items: [{ item: 'midi-output' }],
    },
    {
      id: 'midiMap',
      title: 'MIDI output mapping',
      intro: 'One page per mapping. Choose the exact device, channel and notes.',
      when: settingIs('midiOutputEnabled', true),
      repeat: { list: 'midiOutputMappings', item: 'midi-output-mapping-editor' },
      validate: ctx => {
        const mappings = ctx.settings.midiOutputMappings.filter(m => m.enabled);
        if (!mappings.length) return ['Enable and configure at least one MIDI output mapping.'];
        return mappings.some(m => m.deviceId.trim())
          ? []
          : ['Select an exact MIDI output device for at least one enabled mapping; an any-device mapping is not specific enough.'];
      },
    },
    {
      id: 'winkeyer',
      title: 'WinKeyer',
      intro: 'Keys through a WinKeyer device, which times the Morse itself. Tick the box to choose its port and speed, or leave it to skip this route.',
      items: [{ item: 'winkeyer' }],
    },
    {
      id: 'serialOut',
      title: 'Serial DTR/RTS keying',
      intro: 'Keys a radio through a USB-serial adapter. Tick the box to set up mappings on the next pages, or leave it to skip this route.',
      items: [{ item: 'serial-output' }],
    },
    {
      id: 'serialMap',
      title: 'Serial output mapping',
      intro: 'One page per mapping. Choose the exact port and pin for each.',
      when: settingIs('serialEnabled', true),
      repeat: { list: 'serialOutputMappings', item: 'serial-output-mapping-editor' },
      validate: ctx => ctx.settings.serialOutputMappings.some(m => m.enabled && m.portIndex >= 0)
        ? []
        : ['Enable a serial mapping and assign it an exact serial port.'],
    },
    {
      id: 'sidetone',
      title: 'Hear the Morse',
      intro: 'The sidetone is the beep you hear while Morse plays. It only plays on this device.',
      items: [{ item: 'sidetone' }],
      validate: ctx => ctx.settings.serialEnabled || ctx.settings.winkeyerEnabled || ctx.settings.midiOutputEnabled
        ? []
        : ['Tick at least one radio-keying route (MIDI, WinKeyer or serial), or close the wizard.'],
    },
  ],
};
