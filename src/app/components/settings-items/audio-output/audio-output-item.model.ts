/**
 * Morse Code Studio
 */

import { AUDIO_CHANNELS, AudioChannel, OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Opto-coupler drive mode: 'dc' = constant voltage, 'ac' = oscillator tone */
export const OPTO_MODES = ['ac', 'dc'] as const;
export type OptoMode = typeof OPTO_MODES[number];

/** The settings the Key Output via Audio Channel (opto-coupler) item owns. */
export interface AudioOutputSettings {
  optoOutputDeviceId: string;
  optoOutputChannel: AudioChannel;
  optoMode: OptoMode;
  optoFrequency: number;
  optoAmplitude: number;
  optoEnabled: boolean;
  optoForward: OutputForward;
}

export const AUDIO_OUTPUT_DEFAULTS: AudioOutputSettings = {
  optoOutputDeviceId: 'default',
  optoOutputChannel: 'right',
  optoMode: 'dc',
  optoFrequency: 5000,
  optoAmplitude: 1.0,
  optoEnabled: false,
  optoForward: 'tx',
};

export const AUDIO_OUTPUT_FIELD_RULES: SettingsFieldRules = {
  enums: {
    optoOutputChannel: AUDIO_CHANNELS,
    optoMode: OPTO_MODES,
    optoForward: OUTPUT_FORWARDS,
  },
};

/** What the Audio Key Output item edits, checks and says in a review. */
export const AUDIO_OUTPUT_DESCRIPTOR: ItemDescriptor = {
  id: 'audio-output',
  keys: [
    'optoEnabled', 'optoForward', 'optoOutputDeviceId', 'optoOutputChannel',
    'optoMode', 'optoFrequency', 'optoAmplitude',
  ],
  validate: s => s.optoMode === 'ac' && (s.optoFrequency < 100 || s.optoFrequency > 20000)
    ? ['Audio key output frequency must be between 100 and 20000 Hz.']
    : [],
  review: labelledReview({
    optoEnabled: 'Audio key output',
    optoForward: 'Audio key output active on',
    optoOutputDeviceId: 'Audio key output device',
    optoOutputChannel: 'Audio key output channel',
    optoMode: 'Audio key output mode',
    optoFrequency: 'Audio key output frequency (Hz)',
    optoAmplitude: 'Audio key output amplitude',
  }),
};
