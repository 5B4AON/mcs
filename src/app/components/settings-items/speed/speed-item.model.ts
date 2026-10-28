/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Speed range of the toolbar buttons (WPM) */
export const SPEED_RANGE = { min: 5, max: 50 } as const;

/** The four speeds shown on the main toolbar */
export type SpeedKind = 'encoder' | 'keyer' | 'rx' | 'tx';

/** Setting key and label of each speed */
export const SPEED_INFO: Record<SpeedKind, { key: 'encoderWpm' | 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm'; label: string; hint: string }> = {
  encoder: {
    key: 'encoderWpm',
    label: 'Encoder speed',
    hint: 'How fast the app itself sends Morse: text you type, copy practice and relayed text. Slower is easier to follow.',
  },
  keyer: {
    key: 'keyerWpm',
    label: 'Keyer speed',
    hint: 'The speed of the keyer you operate with paddles (iambic or single lever): it sets the length of the dots and dashes it generates. A straight key has no keyer speed, because you make the timing by hand.',
  },
  rx: {
    key: 'rxDecoderWpm',
    label: 'RX decoder start speed',
    hint: 'The speed the receive decoder expects for incoming Morse (audio, relay). It adapts to what it hears, and the main menu shows its current estimate. Set it near the speed you expect. The reset button beside RX in the main menu forgets what it learned and starts again from this value.',
  },
  tx: {
    key: 'txDecoderWpm',
    label: 'TX decoder start speed',
    hint: 'The same for the Morse you key yourself. It adapts to your keying, and the TX reset button in the main menu starts again from this value.',
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
