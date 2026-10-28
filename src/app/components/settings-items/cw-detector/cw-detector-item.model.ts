/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the CW Tone Detector item edits, checks and says in a review. */
export const CW_DETECTOR_DESCRIPTOR: ItemDescriptor = {
  id: 'cw-detector',
  keys: [
    'cwInputEnabled', 'cwInputSource', 'cwInputDeviceId', 'cwInputChannel', 'cwInputFrequency',
    'cwInputBandwidth', 'cwInputAutoThreshold', 'cwInputThreshold', 'cwInputDebounceMs',
    'cwInputName', 'cwInputColor',
  ],
  validate: s => {
    if (!s.cwInputEnabled) return [];
    const errors: string[] = [];
    if (s.cwInputFrequency < 200 || s.cwInputFrequency > 2000) errors.push('CW detector tone frequency must be between 200 and 2000 Hz.');
    if (s.cwInputBandwidth < 100 || s.cwInputBandwidth > 500) errors.push('CW detector bandwidth must be between 100 and 500 Hz.');
    if (s.micInputEnabled && (s.cwInputDeviceId || 'default') === (s.inputDeviceId || 'default')) {
      errors.push('CW detector and mic key both use the same mic device. Use a different device or turn one off.');
    }
    return errors;
  },
  review: labelledReview({
    cwInputEnabled: 'CW tone detector',
    cwInputSource: 'CW detector used for',
    cwInputDeviceId: 'CW detector input device',
    cwInputChannel: 'CW detector input channel',
    cwInputFrequency: 'CW tone frequency (Hz)',
    cwInputBandwidth: 'CW tone bandwidth (Hz)',
    cwInputAutoThreshold: 'CW auto threshold',
    cwInputThreshold: 'CW manual threshold',
    cwInputDebounceMs: 'CW debounce (ms)',
    cwInputName: 'CW detector name',
    cwInputColor: 'CW detector colour',
  }),
};
