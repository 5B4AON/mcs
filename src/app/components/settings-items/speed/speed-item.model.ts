/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Speed range of the toolbar buttons (WPM) */
export const SPEED_RANGE = { min: 5, max: 50 } as const;

/** The four speeds shown on the main toolbar */
export type SpeedKind = 'encoder' | 'keyer' | 'rx' | 'tx';

/** Setting key and label of each speed */
export const SPEED_INFO: Record<SpeedKind, { key: 'encoderWpm' | 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm'; label: string; hint: string; help: string; helpLabel: string }> = {
  encoder: {
    key: 'encoderWpm',
    label: 'Encoder speed',
    hint: 'How fast the app sends Morse.',
    help: 's3-2',
    helpLabel: 'Help: encoder speed',
  },
  keyer: {
    key: 'keyerWpm',
    label: 'Keyer speed',
    hint: 'The speed of your paddle keyer. A straight key has none.',
    help: 's4-4',
    helpLabel: 'Help: keyer speed',
  },
  rx: {
    key: 'rxDecoderWpm',
    label: 'RX decoder start speed',
    hint: 'The speed at which the receive decoder starts. It adapts as it listens.',
    help: 's2-2',
    helpLabel: 'Help: decoder start speed',
  },
  tx: {
    key: 'txDecoderWpm',
    label: 'TX decoder start speed',
    hint: 'The speed at which the transmit decoder starts. It adapts as it listens.',
    help: 's2-2',
    helpLabel: 'Help: decoder start speed',
  },
};

/** Descriptor for a set of speeds. */
function speedsDescriptor(id: string, kinds: SpeedKind[]): ItemDescriptor {
  return {
    id,
    keys: kinds.map(k => SPEED_INFO[k].key),
    validate: s => kinds
      .filter(k => s[SPEED_INFO[k].key] < SPEED_RANGE.min || s[SPEED_INFO[k].key] > SPEED_RANGE.max)
      .map(k => `${SPEED_INFO[k].label} must be between ${SPEED_RANGE.min} and ${SPEED_RANGE.max} WPM.`),
    review: labelledReview(Object.fromEntries(kinds.map(k => [SPEED_INFO[k].key, `${SPEED_INFO[k].label} (WPM)`]))),
  };
}

export const ENCODER_SPEED_DESCRIPTOR = speedsDescriptor('encoder-speed', ['encoder']);
export const KEYER_SPEED_DESCRIPTOR = speedsDescriptor('keyer-speed', ['keyer']);
export const RX_SPEED_DESCRIPTOR = speedsDescriptor('rx-speed', ['rx']);
export const TX_SPEED_DESCRIPTOR = speedsDescriptor('tx-speed', ['tx']);
export const SPEEDS_DESCRIPTOR = speedsDescriptor('speeds', ['encoder', 'keyer', 'rx', 'tx']);
