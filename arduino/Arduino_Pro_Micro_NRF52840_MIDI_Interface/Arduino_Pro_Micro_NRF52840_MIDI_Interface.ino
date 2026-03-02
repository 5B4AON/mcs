/**
 * Arduino Pro Micro (nRF52840) MIDI Interface for Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 *
 * ============================================================
 * OVERVIEW
 * ============================================================
 * This sketch turns an nRF52840-based Pro Micro board (such as
 * the Supermini nRF52840, nice!nano, or similar) into a USB
 * MIDI device that bridges physical morse keys/paddles with
 * Morse Code Studio running in a browser.
 *
 * This is the nRF52840 variant. For the classic ATmega32U4
 * Pro Micro, use the other sketch instead.
 *
 * INPUTS  — A straight key or iambic paddles wired to input
 *           pins. When a key/paddle contact closes (shorts to
 *           GND), the Arduino sends a MIDI Note On message to
 *           the PC. When the contact opens, it sends Note Off.
 *
 * OUTPUTS — When the PC sends a MIDI Note On, the Arduino
 *           drives the corresponding output pin HIGH (e.g. to
 *           drive an optocoupler that keys a radio transmitter).
 *           On Note Off the pin goes LOW again.
 *
 * LED     — The onboard LED blinks on any input or output
 *           activity. (nRF52840 boards typically have a single
 *           LED, unlike the ATmega32U4's separate RX/TX LEDs.)
 *
 * ============================================================
 * REQUIRED LIBRARIES
 * ============================================================
 * 1. Adafruit TinyUSB Library — install via Arduino Library
 *    Manager (Sketch → Include Library → Manage Libraries,
 *    search "Adafruit TinyUSB Library").
 *
 * 2. MIDI Library by Forty Seven Effects — install via Arduino
 *    Library Manager (search "MIDI Library").
 *
 * ============================================================
 * BOARD SETUP
 * ============================================================
 * 1. Install the Adafruit nRF52 Board Support Package:
 *    - File → Preferences → Additional Board Manager URLs, add:
 *      https://adafruit.github.io/arduino-board-index/package_adafruit_index.json
 *    - Tools → Board → Boards Manager → search "Adafruit nRF52"
 *      → install "Adafruit nRF52" by Adafruit
 *
 * 2. Select your board:
 *    - Tools → Board → Adafruit nRF52 Boards →
 *      "Adafruit Feather nRF52840 Express" (or the closest
 *      match for your specific board)
 *
 * 3. Tools → USB Stack → "TinyUSB"
 *
 * ============================================================
 * PIN LAYOUT
 * ============================================================
 * The nRF52840 Pro Micro has the same physical footprint as
 * the ATmega32U4 Pro Micro: 13 pins on each side, USB at top,
 * plus 3 pads at the bottom (typically B+, B−, RST).
 *
 * The pins labelled 2–7 are in the same physical positions as
 * the ATmega32U4 variant, so the wiring is identical:
 *
 *   ┌─────────────────────────────────────┐
 *   │            USB Connector            │
 *   ├──────────┬──────────────────────────┤
 *   │  D1/TX   │     RAW / VIN           │
 *   │  D0/RX   │     GND ← output ground │
 *   │  GND ◄── │ ── input ground         │
 *   │  GND     │     RST                 │
 *   │  Pin 2 ← │ ── Straight Key IN      │
 *   │  Pin 3 ← │ ── Dit Paddle IN        │
 *   │  Pin 4 ← │ ── Dah Paddle IN        │
 *   │  Pin 5 → │ ── Straight Key OUT     │
 *   │  Pin 6 → │ ── Dit OUT              │
 *   │  Pin 7 → │ ── Dah OUT              │
 *   │  Pin 8   │     ...                 │
 *   │  Pin 9   │     ...                 │
 *   │  ...     │     ...                 │
 *   ├──────────┴──────────────────────────┤
 *   │     (B+)    (B−)    (RST)           │
 *   └─────────────────────────────────────┘
 *
 *   Input pins use internal pull-up resistors (no external
 *   components needed — just wire the key between the pin
 *   and GND).
 *
 *   Output pins are LOW by default and go HIGH when the PC
 *   sends the corresponding MIDI note. Connect a 220 Ω
 *   resistor in series with an optocoupler LED to key a
 *   radio transmitter safely.
 */

#include <Adafruit_TinyUSB.h>
#include <MIDI.h>

// ============================================================
// USB MIDI SETUP
// ============================================================
Adafruit_USBD_MIDI usbMidi;
MIDI_CREATE_INSTANCE(Adafruit_USBD_MIDI, usbMidi, MIDI);

// ============================================================
// PIN CONFIGURATION
// ============================================================
// Change these if you wire your board differently.
// The physical positions match the ATmega32U4 Pro Micro,
// so existing wiring works with either board.

/** Straight key input — wire between this pin and GND */
const int PIN_IN_STRAIGHT = 2;

/** Dit (dot) paddle input — wire between this pin and GND */
const int PIN_IN_DIT      = 3;

/** Dah (dash) paddle input — wire between this pin and GND */
const int PIN_IN_DAH      = 4;

/** Straight key output — drives optocoupler or indicator */
const int PIN_OUT_STRAIGHT = 5;

/** Dit output — drives optocoupler or indicator */
const int PIN_OUT_DIT      = 6;

/** Dah output — drives optocoupler or indicator */
const int PIN_OUT_DAH      = 7;

// ============================================================
// ONBOARD LED
// ============================================================
// nRF52840 Pro Micro boards typically have a single onboard LED.
// LED_BUILTIN is defined by the board package. If your board
// uses a different pin, change this.
const int PIN_LED = LED_BUILTIN;

// ============================================================
// MIDI CONFIGURATION
// ============================================================
// These defaults match the Morse Code Studio MIDI settings.
// Change them here if you customise MCS to use different values.

/**
 * MIDI channel (1–16).
 * Note: The MIDI Library uses 1-based channels (1 = first channel),
 * unlike MIDIUSB which uses 0-based. Channel 1 here corresponds
 * to channel 0 in the ATmega32U4 sketch and in MCS settings.
 */
const byte MIDI_CH = 1;

/** MIDI velocity for Note On messages (0–127). */
const byte MIDI_VELOCITY = 127;

// --- Input note numbers (sent TO the PC when a key is pressed) ---
const byte NOTE_IN_STRAIGHT = 60;   // C4
const byte NOTE_IN_DIT      = 62;   // D4
const byte NOTE_IN_DAH      = 64;   // E4

// --- Output note numbers (received FROM the PC to drive pins) ---
const byte NOTE_OUT_STRAIGHT = 60;  // C4
const byte NOTE_OUT_DIT      = 62;  // D4
const byte NOTE_OUT_DAH      = 64;  // E4

// ============================================================
// DEBOUNCE
// ============================================================
// Mechanical switches bounce for a few milliseconds when they
// make or break contact. This delay filters out the noise.

/** Debounce interval in milliseconds */
const unsigned long DEBOUNCE_MS = 5;

// ============================================================
// INTERNAL STATE — no need to edit below this line
// ============================================================

/** Tracks the debounced state of one input pin. */
struct InputState {
  int      pin;
  byte     note;
  bool     pressed;
  bool     rawLast;
  unsigned long lastEdge;
};

InputState inputs[3];

/** Map an output note number to its GPIO pin. Returns -1 if not matched. */
int outputPinForNote(byte note) {
  if (note == NOTE_OUT_STRAIGHT) return PIN_OUT_STRAIGHT;
  if (note == NOTE_OUT_DIT)      return PIN_OUT_DIT;
  if (note == NOTE_OUT_DAH)      return PIN_OUT_DAH;
  return -1;
}

// ============================================================
// MIDI CALLBACKS
// ============================================================

/** Called when the PC sends a Note On message. */
void handleNoteOn(byte channel, byte note, byte velocity) {
  if (channel != MIDI_CH) return;
  int pin = outputPinForNote(note);
  if (pin >= 0 && velocity > 0) {
    digitalWrite(pin, HIGH);
  } else if (pin >= 0) {
    // Velocity 0 = Note Off
    digitalWrite(pin, LOW);
  }
}

/** Called when the PC sends a Note Off message. */
void handleNoteOff(byte channel, byte note, byte velocity) {
  if (channel != MIDI_CH) return;
  int pin = outputPinForNote(note);
  if (pin >= 0) {
    digitalWrite(pin, LOW);
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  // Configure input pins with internal pull-up resistors
  pinMode(PIN_IN_STRAIGHT, INPUT_PULLUP);
  pinMode(PIN_IN_DIT,      INPUT_PULLUP);
  pinMode(PIN_IN_DAH,      INPUT_PULLUP);

  // Configure output pins — start LOW (off)
  pinMode(PIN_OUT_STRAIGHT, OUTPUT);
  pinMode(PIN_OUT_DIT,      OUTPUT);
  pinMode(PIN_OUT_DAH,      OUTPUT);
  digitalWrite(PIN_OUT_STRAIGHT, LOW);
  digitalWrite(PIN_OUT_DIT,      LOW);
  digitalWrite(PIN_OUT_DAH,      LOW);

  // Onboard LED
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  // Initialise input state tracking
  inputs[0] = { PIN_IN_STRAIGHT, NOTE_IN_STRAIGHT, false, false, 0 };
  inputs[1] = { PIN_IN_DIT,      NOTE_IN_DIT,      false, false, 0 };
  inputs[2] = { PIN_IN_DAH,      NOTE_IN_DAH,      false, false, 0 };

  // Initialise USB MIDI
  usbMidi.setStringDescriptor("MCS MIDI Interface");
  MIDI.begin(MIDI_CH);
  MIDI.setHandleNoteOn(handleNoteOn);
  MIDI.setHandleNoteOff(handleNoteOff);

  // Wait for USB to be ready
  while (!TinyUSBDevice.mounted()) {
    delay(1);
  }
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  unsigned long now = millis();
  bool anyInputPressed = false;

  // --- 1. Scan input pins (debounced) ---
  for (int i = 0; i < 3; i++) {
    bool raw = (digitalRead(inputs[i].pin) == LOW);

    if (raw != inputs[i].rawLast) {
      inputs[i].rawLast  = raw;
      inputs[i].lastEdge = now;
    }

    if ((now - inputs[i].lastEdge) >= DEBOUNCE_MS) {
      if (raw != inputs[i].pressed) {
        inputs[i].pressed = raw;
        if (raw) {
          MIDI.sendNoteOn(inputs[i].note, MIDI_VELOCITY, MIDI_CH);
        } else {
          MIDI.sendNoteOff(inputs[i].note, 0, MIDI_CH);
        }
      }
    }

    if (inputs[i].pressed) anyInputPressed = true;
  }

  // --- 2. Process incoming MIDI messages (triggers callbacks) ---
  MIDI.read();

  // --- 3. LED: on while any input OR output is active ---
  bool anyOutputActive =
    (digitalRead(PIN_OUT_STRAIGHT) == HIGH) ||
    (digitalRead(PIN_OUT_DIT)      == HIGH) ||
    (digitalRead(PIN_OUT_DAH)      == HIGH);

  digitalWrite(PIN_LED, (anyInputPressed || anyOutputActive) ? HIGH : LOW);
}
