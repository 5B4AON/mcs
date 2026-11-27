/**
 * Morse Code Studio
 */

import { AudioChannel, OUTPUT_FORWARDS, OutputForward, AUDIO_CHANNELS, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Sidetone can also play on both stereo channels. */
export type SidetoneChannel = AudioChannel | 'both';

/** How strong the inaudible signal is that keeps a USB sound card from going to sleep. */
export type OutputKeepAlive = 'off' | 'low' | 'normal' | 'high';

export const OUTPUT_KEEP_ALIVES: readonly OutputKeepAlive[] = ['off', 'low', 'normal', 'high'];

/** The settings the Sidetone item owns. */
export interface SidetoneSettings {
  sidetoneOutputDeviceId: string;
  sidetoneOutputChannel: SidetoneChannel;
  sidetoneFrequency: number;
  sidetoneAmplitude: number;
  sidetoneEnabled: boolean;
  sidetoneForward: OutputForward;
  outputKeepAlive: OutputKeepAlive;
}

export const SIDETONE_DEFAULTS: SidetoneSettings = {
  sidetoneOutputDeviceId: 'default',
  sidetoneOutputChannel: 'both',
  sidetoneFrequency: 650,
  sidetoneAmplitude: 1,
  sidetoneEnabled: true,
  sidetoneForward: 'both',
  outputKeepAlive: 'normal',
};

export const SIDETONE_FIELD_RULES: SettingsFieldRules = {
  enums: {
    sidetoneOutputChannel: [...AUDIO_CHANNELS, 'both'],
    sidetoneForward: OUTPUT_FORWARDS,
    outputKeepAlive: OUTPUT_KEEP_ALIVES,
  },
};

/** Frequency range the sidetone accepts (Hz) */
export const SIDETONE_FREQUENCY_RANGE = { min: 500, max: 1000, step: 25 } as const;

/** What the Sidetone item edits, checks and says in a review. */
export const SIDETONE_DESCRIPTOR: ItemDescriptor = {
  id: 'sidetone',
  keys: [
    'sidetoneEnabled', 'sidetoneForward', 'sidetoneOutputDeviceId',
    'sidetoneOutputChannel', 'sidetoneFrequency', 'sidetoneAmplitude', 'outputKeepAlive',
  ],
  validate: settings => {
    const f = settings.sidetoneFrequency;
    return f >= SIDETONE_FREQUENCY_RANGE.min && f <= SIDETONE_FREQUENCY_RANGE.max
      ? []
      : [`Sidetone frequency must be between ${SIDETONE_FREQUENCY_RANGE.min} and ${SIDETONE_FREQUENCY_RANGE.max} Hz.`];
  },
  review: labelledReview({
    sidetoneEnabled: 'Sidetone',
    sidetoneForward: 'Sidetone active on',
    sidetoneOutputDeviceId: 'Sidetone audio device',
    sidetoneOutputChannel: 'Sidetone channel',
    sidetoneFrequency: 'Sidetone frequency (Hz)',
    sidetoneAmplitude: 'Sidetone amplitude',
    outputKeepAlive: 'Sound card keep-alive',
  }),
};
