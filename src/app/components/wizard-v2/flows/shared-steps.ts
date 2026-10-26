/**
 * Morse Code Studio
 */

import { Condition, WizardStep } from '../engine/flow-types';

/** Options shared by the standard timing steps. */
export interface TimingStepOptions {
  /** Hide the step, e.g. on a hardware-timed path such as WinKeyer only */
  when?: Condition;
}

/**
 * Standard speed step: every goal that sends Morse asks for the speed first.
 * Pick the encoder (text the app sends), the keyer (your key or paddle), or both.
 */
export function speedStep(speeds: { encoder?: boolean; keyer?: boolean }, options: TimingStepOptions = {}): WizardStep {
  const items = [];
  if (speeds.encoder) {
    items.push({ item: 'encoder-speed' });
  }
  if (speeds.keyer) {
    items.push({ item: 'keyer-speed' });
  }
  return {
    id: 'speed',
    title: 'Choose your speed',
    intro: 'Pick how fast Morse is sent for this task. You can change it later from the main menu.',
    when: options.when,
    items,
  };
}

/** Standard Farnsworth step, always right after the speed step. */
export function farnsworthStep(options: TimingStepOptions = {}): WizardStep {
  return {
    id: 'farnsworth',
    title: 'Farnsworth timing',
    intro: 'Optional. Keep the characters fast but leave longer gaps between them. Leave it off for normal timing.',
    when: options.when,
    items: [{ item: 'farnsworth' }],
  };
}
