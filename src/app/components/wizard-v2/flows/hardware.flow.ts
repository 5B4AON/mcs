/**
 * Morse Code Studio
 */

import { any, settingIs } from '../engine/conditions';
import { WizardFlow, WizardStep } from '../engine/flow-types';
import { farnsworthStep, leavePracticeForced, leavePracticeStep, soundStep, speedStep } from './shared-steps';
import { MIDI_SUPPORTED, SERIAL_SUPPORTED } from './device-support';

/** On a device with no MIDI, WinKeyer or serial support (for example an iPhone) there is nothing to set up. */
const HARDWARE_UNAVAILABLE = !MIDI_SUPPORTED && !SERIAL_SUPPORTED;

const UNAVAILABLE_STEP: WizardStep = {
  id: 'unavailable',
  title: 'Not available on this device',
  intro: 'This device cannot use MIDI, WinKeyer or serial keying. Nothing is changed. Choose Back to pick another goal.',
  validate: () => ['Not available on this device.'],
};

/** MIDI and serial keying are timed by the app, so the Encoder speed and Farnsworth matter; a WinKeyer times itself. */
const bitTimedRoute = any(settingIs('midiOutputEnabled', true), settingIs('serialEnabled', true));

/**
 * Goal "Connect output hardware": the steps of each route - MIDI output
 * (switch, speed, one page per mapping), WinKeyer (switch, port, what is sent,
 * speed) and serial DTR/RTS (switch, one page per mapping) - then the encoder
 * speed and Farnsworth (only when a MIDI or serial route is on, since a
 * WinKeyer times itself) and the sidetone. A Novice sees MIDI and serial only;
 * WinKeyer, the speed steps and MIDI speed start at Intermediate. The experimental audio key output (and
 * the experimental mic key input) are left out of the wizards; they stay in
 * Settings and the wizards do not touch them. Each route is
 * switched on only by its own tick, so a route you do not tick is turned off
 * or left off. The wizard never opens a port or device and never sends Morse;
 * ports and devices are chosen with the item's own buttons. At least one route
 * must be on, and each route must name an exact target.
 */
export const HARDWARE_FLOW: WizardFlow = {
  id: 'hardware',
  title: 'Connect output hardware',
  goal: 'hardware',
  forced: HARDWARE_UNAVAILABLE ? [] : leavePracticeForced(),
  levels: !HARDWARE_UNAVAILABLE,
  steps: HARDWARE_UNAVAILABLE ? [UNAVAILABLE_STEP] : [
    leavePracticeStep('A practice mode keeps what you key or type on this device and away from your radio, MIDI and serial outputs.'),
    {
      id: 'midiOut',
      title: 'MIDI output',
      intro: 'Keys a MIDI device. Tick the box to set it up.',
      helpSection: 's7-4',
      items: [{ item: 'midi-output-connect' }],
    },
    {
      id: 'midiSpeed',
      level: 'intermediate',
      title: 'MIDI output speed',
      intro: 'MIDI notes are played at your Encoder speed. Tick the box to also use that speed for Morse that arrives at another speed.',
      helpSection: 's7-4',
      when: settingIs('midiOutputEnabled', true),
      items: [{ item: 'midi-output-speed' }],
    },
    {
      id: 'midiMap',
      title: 'MIDI output mapping',
      intro: 'Choose the exact device, channel and notes.',
      helpSection: 's7-4',
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
      level: 'intermediate',
      title: 'WinKeyer',
      intro: 'Keys through a WinKeyer device, which does the timing itself. Tick the box to set it up.',
      helpSection: 's7-3',
      items: [{ item: 'winkeyer-connect' }],
    },
    {
      id: 'winkeyerPort',
      level: 'intermediate',
      title: 'WinKeyer port',
      intro: 'Choose the serial port the WinKeyer is on. Nothing is opened until you apply.',
      helpSection: 's7-3',
      when: settingIs('winkeyerEnabled', true),
      items: [{ item: 'winkeyer-port' }],
    },
    {
      id: 'winkeyerSend',
      level: 'intermediate',
      title: 'What the WinKeyer sends',
      intro: 'Choose whether it keys the Morse you receive, the Morse you send, or both.',
      helpSection: 's7-3',
      when: settingIs('winkeyerEnabled', true),
      items: [{ item: 'winkeyer-send' }],
    },
    {
      id: 'winkeyerSpeed',
      level: 'intermediate',
      title: 'WinKeyer speed',
      intro: 'The WinKeyer times the Morse itself, so it has its own speed (5 to 99 WPM), separate from the Encoder speed.',
      helpSection: 's7-3',
      when: settingIs('winkeyerEnabled', true),
      items: [{ item: 'winkeyer-speed' }],
    },
    {
      id: 'serialOut',
      title: 'Serial DTR/RTS keying',
      intro: 'Keys a radio through a USB-serial adapter. Tick the box to set it up.',
      helpSection: 's7-2',
      items: [{ item: 'serial-output' }],
    },
    {
      id: 'serialMap',
      title: 'Serial output mapping',
      intro: 'Choose the exact port and pin.',
      helpSection: 's7-2',
      when: settingIs('serialEnabled', true),
      repeat: { list: 'serialOutputMappings', item: 'serial-output-mapping-editor' },
      validate: ctx => ctx.settings.serialOutputMappings.some(m => m.enabled && m.portIndex >= 0)
        ? []
        : ['Enable a serial mapping and assign it an exact serial port.'],
    },
    speedStep({ encoder: true }, { when: bitTimedRoute, level: 'intermediate' }),
    farnsworthStep({ applies: 'tx', when: bitTimedRoute, level: 'intermediate' }),
    soundStep({
      detail: 'The text you send is also played through it. It does not change the radio-keying routes you chose on the previous pages.',
      validate: ctx => ctx.settings.serialEnabled || ctx.settings.winkeyerEnabled || ctx.settings.midiOutputEnabled
        ? []
        : ['Tick at least one radio-keying route (MIDI, WinKeyer or serial), or close the wizard.'],
    }),
  ],
};
