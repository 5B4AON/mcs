/**
 * Morse Code Studio
 */

import { Condition, WizardStep } from '../engine/flow-types';

/** Options shared by the standard timing steps. */
export interface TimingStepOptions {
  /** Hide the step, e.g. on a hardware-timed path such as WinKeyer only */
  when?: Condition;
  /** Override the default id when a flow needs multiple speed pages */
  id?: string;
  /** Goal-specific wording that replaces the standard intro */
  intro?: string;
  /** Help section to open from the step's "?" button; the standard one is used by default */
  helpSection?: string;
}

/**
 * Standard speed step: every goal that sends Morse asks for the speed first.
 * Pick the encoder (text the app sends), the keyer (your key or paddle), or both.
 * All goals share the title; a goal adds its own sentence through `intro`.
 */
export function speedStep(
  speeds: { encoder?: boolean; keyer?: boolean; rx?: boolean; tx?: boolean },
  options: TimingStepOptions = {},
): WizardStep {
  const items = [];
  if (speeds.encoder) {
    items.push({ item: 'encoder-speed' });
  }
  if (speeds.keyer) {
    items.push({ item: 'keyer-speed' });
  }
  if (speeds.rx) {
    items.push({ item: 'rx-speed' });
  }
  if (speeds.tx) {
    items.push({ item: 'tx-speed' });
  }
  // Keyer speed is explained with the keyers, decoder start speeds with the decoder, encoder speed with the encoder
  const helpSection = speeds.keyer ? 's4-1' : speeds.rx || speeds.tx ? 's2-2' : 's3-2';
  return {
    id: options.id ?? 'speed',
    title: 'Choose your speed',
    intro: options.intro ?? 'Pick how fast Morse is sent for this task. You can change it later from the main menu.',
    helpSection: options.helpSection ?? helpSection,
    when: options.when,
    items,
  };
}

/** Options of the Farnsworth step. */
export interface FarnsworthStepOptions extends TimingStepOptions {
  /** Which Morse the goal plays, so the step can say which "Applies to" choice stretches the gaps */
  applies?: 'tx' | 'rx';
}

/** Standard Farnsworth step, always right after the speed step. */
export function farnsworthStep(options: FarnsworthStepOptions = {}): WizardStep {
  const hint = options.applies === 'tx'
    ? 'This goal plays sent (TX) Morse. Choose "TX Only" or "Both RX and TX" so the gaps you hear are stretched.'
    : options.applies === 'rx'
      ? 'This goal plays received (RX) Morse. Choose "RX Only" or "Both RX and TX" so the gaps you hear are stretched.'
      : undefined;
  return {
    id: 'farnsworth',
    title: 'Farnsworth timing',
    intro: options.intro ?? 'Optional. Farnsworth timing keeps each character at full speed but stretches the gaps between characters and words, so the Morse is easier to follow. Leave it off for normal timing.',
    helpSection: options.helpSection ?? 's8-5',
    when: options.when,
    items: [{ item: 'farnsworth', hint }],
  };
}

/** Options of the sound step. */
export interface SoundStepOptions {
  /** One sentence about what this goal plays through the sidetone */
  detail: string;
  /** Extra checks for this goal; the sound step itself needs none */
  validate?: WizardStep['validate'];
  when?: Condition;
}

/**
 * Standard sound step, last in every goal that plays Morse on this device. The
 * title, explanation and item are the same everywhere; each goal only says what
 * it plays. Decode is the exception: it only listens and plays nothing.
 */
export function soundStep(options: SoundStepOptions): WizardStep {
  return {
    id: 'sidetone',
    title: 'Hear the Morse',
    intro: 'The sidetone is the beep you hear while Morse is sent or played. It only plays on this device.',
    helpSection: 's7-5',
    when: options.when,
    validate: options.validate,
    items: [{ item: 'sidetone', hint: options.detail }],
  };
}
