/**
 * Morse Code Studio
 */

import { isMobileDevice } from '../../../services/settings-common';

/**
 * What this device can do, from real capability checks (the same checks the
 * Settings cards use), evaluated once. Wizard flows use it to disable choices
 * the device cannot support, such as the MIDI keyer on an iPhone.
 */

/** Web MIDI is available (not on iPhone, Firefox or Safari) */
export const MIDI_SUPPORTED = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

/** Web Serial is available and usable: not on iPhone, and not on Android (USB-serial adapters are unsupported there), matching the serial and WinKeyer cards */
export const SERIAL_SUPPORTED = typeof navigator !== 'undefined'
  && 'serial' in navigator
  && !/android/i.test(navigator.userAgent);

/** The Screen Wake Lock API is available (the Keep screen on setting can work) */
export const WAKE_LOCK_SUPPORTED = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** A phone or tablet, which pauses a page when the screen locks */
export const MOBILE_DEVICE = typeof matchMedia !== 'undefined' && isMobileDevice();

/** Shown next to a choice that this device cannot support */
export const NOT_AVAILABLE_HINT = 'Not available on this device.';
