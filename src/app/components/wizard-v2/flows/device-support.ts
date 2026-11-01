/**
 * Morse Code Studio
 */

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

/** Shown next to a choice that this device cannot support */
export const NOT_AVAILABLE_HINT = 'Not available on this device.';
