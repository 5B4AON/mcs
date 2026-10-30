/**
 * Morse Code Studio
 */

import {
  DECODER_SOURCES, DecoderSource, KEY_INPUT_MODES, KeyInputMode, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** @deprecated Use KeyInputMode instead */
export type MidiInputMode = KeyInputMode;

/** Configuration for a single MIDI input mapping */
export interface MidiInputMapping {
  enabled: boolean;
  /** MIDI input device ID (empty = any/first available) */
  deviceId: string;
  /** MIDI channel filter: 0 = omni (all channels), 1-16 = specific channel */
  channel: number;
  /** Decoder source: which calibration pool this input feeds ('rx' or 'tx') */
  source: DecoderSource;
  /** Mode: straight key or paddle */
  mode: KeyInputMode;
  /** MIDI note number for straight key, or dit paddle (-1 = not assigned) */
  value: number;
  /** MIDI note number for dah paddle (only used when mode is 'paddle', -1 = not assigned) */
  dahValue: number;
  /** Reverse paddles (only used when mode is 'paddle') */
  reversePaddles: boolean;
  /** Optional display name (e.g. callsign) — triggers line breaks in conversation views */
  name: string;
  /** Optional text color (CSS color string) — overrides RX/TX default in fullscreen views */
  color: string;
}

/** The settings the MIDI Input item owns. */
export interface MidiInputSettings {
  midiInputEnabled: boolean;
  /** Ordered list of MIDI input mappings (straight key / paddle entries) */
  midiInputMappings: MidiInputMapping[];
}

export const MIDI_INPUT_DEFAULTS: MidiInputSettings = {
  midiInputEnabled: false,
  midiInputMappings: [
    {
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'rx',
      mode: 'straightKey',
      value: 60,
      dahValue: -1,
      reversePaddles: false,
      name: '',
      color: '',
    },
    {
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'rx',
      mode: 'paddle',
      value: 62,
      dahValue: 64,
      reversePaddles: false,
      name: '',
      color: '',
    },
  ],
};

export const MIDI_INPUT_FIELD_RULES: SettingsFieldRules = {
  enums: {
    'midiInputMappings[].source': DECODER_SOURCES,
    'midiInputMappings[].mode': KEY_INPUT_MODES,
  },
  integers: [
    'midiInputMappings[].channel',
    'midiInputMappings[].value',
    'midiInputMappings[].dahValue',
  ],
};

/** What the MIDI Input item (master switch) edits and says in a review. The mappings have their own descriptor. */
export const MIDI_INPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'midi-input',
  keys: ['midiInputEnabled'],
  validate: () => [],
  review: labelledReview({ midiInputEnabled: 'MIDI key/paddle input' }),
};
