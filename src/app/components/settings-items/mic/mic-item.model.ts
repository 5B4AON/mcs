/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Straight Key via Mic (pilot tone) item edits, checks and says in a review. */
export const MIC_DESCRIPTOR: ItemDescriptor = {
  id: 'mic',
  keys: [
    'micInputEnabled', 'micInputSource', 'inputDeviceId', 'pilotOutputDeviceId', 'pilotOutputChannel',
    'pilotFrequency', 'pilotAmplitude', 'inputThreshold', 'inputDebounceMs', 'inputInvert',
    'micInputName', 'micInputColor',
  ],
  validate: s => s.micInputEnabled && (s.pilotFrequency < 10000 || s.pilotFrequency > 22000)
    ? ['Mic key pilot frequency must be between 10000 and 22000 Hz.']
    : [],
  review: labelledReview({
    micInputEnabled: 'Straight key via mic',
    micInputSource: 'Mic key used for',
    inputDeviceId: 'Mic device',
    pilotOutputDeviceId: 'Pilot output device',
    pilotOutputChannel: 'Pilot output channel',
    pilotFrequency: 'Pilot frequency (Hz)',
    pilotAmplitude: 'Pilot amplitude',
    inputThreshold: 'Mic key threshold',
    inputDebounceMs: 'Mic key debounce (ms)',
    inputInvert: 'Mic key invert',
    micInputName: 'Mic key name',
    micInputColor: 'Mic key colour',
  }),
};
