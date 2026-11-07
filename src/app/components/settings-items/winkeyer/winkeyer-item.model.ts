/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview, partDescriptor } from '../item-descriptor';
import type { AppSettings } from '../../../services/settings.service';

/** The settings the WinKeyer Output (K1EL WinKeyer via serial port) item owns. */
export interface WinkeyerSettings {
  winkeyerEnabled: boolean;
  winkeyerPortIndex: number;
  winkeyerWpm: number;
  winkeyerForward: OutputForward;
}

export const WINKEYER_DEFAULTS: WinkeyerSettings = {
  winkeyerEnabled: false,
  winkeyerPortIndex: -1,
  winkeyerWpm: 20,
  winkeyerForward: 'tx',
};

export const WINKEYER_FIELD_RULES: SettingsFieldRules = {
  enums: { winkeyerForward: OUTPUT_FORWARDS },
  integers: ['winkeyerWpm', 'winkeyerPortIndex'],
};

const REVIEW_LABELS = {
  winkeyerEnabled: 'WinKeyer output',
  winkeyerForward: 'WinKeyer forwards',
  winkeyerPortIndex: 'WinKeyer port',
  winkeyerWpm: 'WinKeyer speed (WPM)',
};

function reviewText(key: string, value: unknown): string {
  if (key === 'winkeyerForward') return value === 'rx' ? 'RX only' : value === 'tx' ? 'TX only' : 'RX and TX';
  if (key === 'winkeyerPortIndex') return (value as number) < 0 ? 'none' : `Port ${(value as number) + 1}`;
  if (key === 'winkeyerEnabled') return value ? 'On' : 'Off';
  return String(value);
}

function portProblems(s: AppSettings): string[] {
  return s.winkeyerEnabled && s.winkeyerPortIndex < 0 ? ['WinKeyer: choose a serial port, or turn WinKeyer off.'] : [];
}

function speedProblems(s: AppSettings): string[] {
  return s.winkeyerWpm < 5 || s.winkeyerWpm > 99 ? ['WinKeyer speed must be between 5 and 99 WPM.'] : [];
}

/** What the WinKeyer item edits and says in a review. */
export const WINKEYER_DESCRIPTOR: ItemDescriptor = {
  id: 'winkeyer',
  keys: ['winkeyerEnabled', 'winkeyerForward', 'winkeyerPortIndex', 'winkeyerWpm'],
  validate: s => [...portProblems(s), ...speedProblems(s)],
  review: labelledReview(REVIEW_LABELS, reviewText),
};

/** The switch on its own wizard step. */
export const WINKEYER_CONNECT_DESCRIPTOR = partDescriptor('winkeyer-connect', ['winkeyerEnabled'], REVIEW_LABELS, undefined, reviewText);

/** The serial port on its own wizard step. */
export const WINKEYER_PORT_DESCRIPTOR = partDescriptor('winkeyer-port', ['winkeyerPortIndex'], REVIEW_LABELS, portProblems, reviewText);

/** What is forwarded (RX, TX or both) on its own wizard step. */
export const WINKEYER_SEND_DESCRIPTOR = partDescriptor('winkeyer-send', ['winkeyerForward'], REVIEW_LABELS, undefined, reviewText);

/** The WinKeyer speed on its own wizard step. */
export const WINKEYER_SPEED_DESCRIPTOR = partDescriptor('winkeyer-speed', ['winkeyerWpm'], REVIEW_LABELS, speedProblems, reviewText);
