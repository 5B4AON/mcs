/**
 * Morse Code Studio
 */

import {
  KEY_INPUT_MODES, KeyInputMode, OUTPUT_FORWARDS, OutputForward, SettingsFieldRules,
} from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';

/** Mode for a MIDI output mapping entry */
export type MidiOutputMode = KeyInputMode;

/** Configuration for a single MIDI output mapping */
export interface MidiOutputMapping {
  enabled: boolean;
  /** MIDI output device ID (empty = any/first available) */
  deviceId: string;
  /** MIDI channel (1-16) */
  channel: number;
  /** Output forwarding mode: which signal source drives this mapping */
  forward: OutputForward;
  /** Mode: straight key or paddle */
  mode: MidiOutputMode;
  /** MIDI note number for straight key, or dit paddle */
  value: number;
  /** MIDI note number for dah paddle (only used when mode is 'paddle', -1 = not assigned) */
  dahValue: number;
  /** Indices into midiInputMappings that are allowed to relay through this output mapping */
  relayInputIndices: number[];
  /** When true, only relay sources (and encoder) drive this output — all other inputs are suppressed */
  relaySuppressOtherInputs: boolean;
}

/** The settings the MIDI Output item owns. */
export interface MidiOutputSettings {
  midiOutputEnabled: boolean;
  /** Ordered list of MIDI output mappings (straight key / paddle entries) */
  midiOutputMappings: MidiOutputMapping[];
  /** When true, ignore remote WPM and use local encoder WPM for MIDI output */
  midiOutputOverrideWpm: boolean;
}

export const MIDI_OUTPUT_DEFAULTS: MidiOutputSettings = {
  midiOutputEnabled: false,
  midiOutputMappings: [
    {
      enabled: true,
      deviceId: '',
      channel: 1,
      forward: 'tx',
      mode: 'straightKey',
      value: 80,
      dahValue: -1,
      relayInputIndices: [],
      relaySuppressOtherInputs: false,
    },
    {
      enabled: true,
      deviceId: '',
      channel: 1,
      forward: 'tx',
      mode: 'paddle',
      value: 82,
      dahValue: 84,
      relayInputIndices: [],
      relaySuppressOtherInputs: false,
    },
  ],
  midiOutputOverrideWpm: false,
};

export const MIDI_OUTPUT_FIELD_RULES: SettingsFieldRules = {
  enums: {
    'midiOutputMappings[].forward': OUTPUT_FORWARDS,
    'midiOutputMappings[].mode': KEY_INPUT_MODES,
  },
  integers: [
    'midiOutputMappings[].channel',
    'midiOutputMappings[].value',
    'midiOutputMappings[].dahValue',
    'midiOutputMappings[].relayInputIndices[]',
  ],
};

const REVIEW_LABELS = {
  midiOutputEnabled: 'MIDI output',
  midiOutputOverrideWpm: 'MIDI output uses local encoder speed',
};

/** What the MIDI Output item (master switch and WPM option) edits and says in a review. The mappings have their own descriptor. */
export const MIDI_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'midi-output',
  keys: ['midiOutputEnabled', 'midiOutputOverrideWpm'],
  validate: () => [],
  review: labelledReview(REVIEW_LABELS),
};

/** The switch on its own wizard step. */
export const MIDI_OUTPUT_CONNECT_DESCRIPTOR = partDescriptor('midi-output-connect', ['midiOutputEnabled'], REVIEW_LABELS);

/** The local-speed option on its own wizard step. */
export const MIDI_OUTPUT_SPEED_DESCRIPTOR = partDescriptor('midi-output-speed', ['midiOutputOverrideWpm'], REVIEW_LABELS);
