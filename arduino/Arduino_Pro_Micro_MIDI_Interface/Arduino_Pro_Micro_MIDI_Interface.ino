/**
 * Arduino Pro Micro MIDI Interface for Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 *
 * ============================================================
 * OVERVIEW
 * ============================================================
 * This sketch turns an Arduino Pro Micro (ATmega32U4) into a
 * USB MIDI device that bridges physical morse keys/paddles with
 * Morse Code Studio running in a browser.
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
 * LEDS    — The onboard RX LED flashes when any input key is
 *           pressed. The TX LED flashes when any output pin is
 *           driven by an incoming MIDI message from the PC.
 *
 * ============================================================
 * REQUIRED LIBRARY
 * ============================================================
 * Install "MIDIUSB" by Gary Grewal via the Arduino Library
 * Manager (Sketch → Include Library → Manage Libraries).
 *
 * ============================================================
 * BOARD SELECTION
 * ============================================================
 * In the Arduino IDE:
 *   Tools → Board → Arduino AVR Boards → Arduino Micro
 *   (or "SparkFun Pro Micro" if you installed SparkFun's board
 *   package — select 5V/16MHz or 3.3V/8MHz to match your board)
 *
 * ============================================================
 * PIN LAYOUT  (left side of the board, USB connector at top)
 * ============================================================
 *
 *   ┌─────────────────────────────────────┐
 *   │            USB Connector            │
 *   ├──────────┬──────────────────────────┤
 *   │  TX0     │     RAW                  │
 *   │  RX1     │     GND ← output ground  │
 *   │  GND ◄── │ ── input ground          │
 *   │  GND     │     RST                  │
 *   │  Pin 2 ← │ ── Straight Key IN       │
 *   │  Pin 3 ← │ ── Dit Paddle IN         │
 *   │  Pin 4 ← │ ── Dah Paddle IN         │
 *   │  Pin 5 → │ ── Straight Key OUT      │
 *   │  Pin 6 → │ ── Dit OUT               │
 *   │  Pin 7 → │ ── Dah OUT               │
 *   │  Pin 8   │     ...                  │
 *   │  Pin 9   │     ...                  │
 *   └──────────┴──────────────────────────┘
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

#include "MIDIUSB.h"

// ============================================================
// PIN CONFIGURATION
// ============================================================
// Change these if you wire your board differently.
// All input pins are on the left side of the Pro Micro,
// directly above the output pins, with GND between them
// for convenient wiring.

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
// MIDI CONFIGURATION
// ============================================================
// These defaults match the Morse Code Studio MIDI settings.
// Change them here if you customise MCS to use different values.

/**
 * MIDI channel (0–15).
 * 0 corresponds to "Channel 1" in most MIDI software.
 */
const byte MIDI_CH = 0;

/** MIDI velocity for Note On messages (0–127). */
const byte MIDI_VELOCITY = 127;

// --- Input note numbers (sent TO the PC when a key is pressed) ---
const byte NOTE_IN_STRAIGHT = 60;   // C4
const byte NOTE_IN_DIT      = 62;   // D4
const byte NOTE_IN_DAH      = 64;   // E4

// --- Output note numbers (received FROM the PC to drive pins) ---
// These can be the same as the input notes (no collision — they
// travel in opposite directions). Change them independently if
// your setup requires different mappings.
const byte NOTE_OUT_STRAIGHT = 60;  // C4
const byte NOTE_OUT_DIT      = 62;  // D4
const byte NOTE_OUT_DAH      = 64;  // E4

// ============================================================
// DEBOUNCE
// ============================================================
// Mechanical switches bounce for a few milliseconds when they
// make or break contact. This delay filters out the noise.
// Increase it if you see ghost characters; decrease for faster
// response with high-quality switches.

/** Debounce interval in milliseconds */
const unsigned long DEBOUNCE_MS = 5;

// ============================================================
// LED INDICATORS
// ============================================================
// The Pro Micro has two onboard LEDs controlled by these macros:
//   RXLED0 = RX LED on,  RXLED1 = RX LED off  (active LOW)
//   TXLED0 = TX LED on,  TXLED1 = TX LED off  (active LOW)
//
// RX LED → lights while any INPUT key/paddle is pressed
// TX LED → lights while any OUTPUT pin is driven HIGH

// ============================================================
// INTERNAL STATE — no need to edit below this line
// ============================================================

/** Tracks the debounced state of one input pin. */
struct InputState {
  int      pin;           // GPIO pin number
  byte     note;          // MIDI note to send
  bool     pressed;       // current debounced state (true = key down)
  bool     rawLast;       // last raw reading
  unsigned long lastEdge; // millis() of last raw state change
};

InputState inputs[3];

/** Map an output note number to its GPIO pin. Returns -1 if not matched. */
int outputPinForNote(byte note) {
  if (note == NOTE_OUT_STRAIGHT) return PIN_OUT_STRAIGHT;
  if (note == NOTE_OUT_DIT)      return PIN_OUT_DIT;
  if (note == NOTE_OUT_DAH)      return PIN_OUT_DAH;
  return -1;
}

/** Send a MIDI Note On message. */
void sendNoteOn(byte channel, byte note, byte velocity) {
  midiEventPacket_t event = { 0x09, (byte)(0x90 | channel), note, velocity };
  MidiUSB.sendMIDI(event);
  MidiUSB.flush();
}

/** Send a MIDI Note Off message. */
void sendNoteOff(byte channel, byte note) {
  midiEventPacket_t event = { 0x08, (byte)(0x80 | channel), note, 0 };
  MidiUSB.sendMIDI(event);
  MidiUSB.flush();
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  // Configure input pins with internal pull-up resistors.
  // When a key is open the pin reads HIGH; when shorted to
  // GND (key pressed) it reads LOW.
  pinMode(PIN_IN_STRAIGHT, INPUT_PULLUP);
  pinMode(PIN_IN_DIT,      INPUT_PULLUP);
  pinMode(PIN_IN_DAH,      INPUT_PULLUP);

  // Configure output pins — start LOW (off).
  pinMode(PIN_OUT_STRAIGHT, OUTPUT);
  pinMode(PIN_OUT_DIT,      OUTPUT);
  pinMode(PIN_OUT_DAH,      OUTPUT);
  digitalWrite(PIN_OUT_STRAIGHT, LOW);
  digitalWrite(PIN_OUT_DIT,      LOW);
  digitalWrite(PIN_OUT_DAH,      LOW);

  // Initialise input state tracking
  inputs[0] = { PIN_IN_STRAIGHT, NOTE_IN_STRAIGHT, false, false, 0 };
  inputs[1] = { PIN_IN_DIT,      NOTE_IN_DIT,      false, false, 0 };
  inputs[2] = { PIN_IN_DAH,      NOTE_IN_DAH,      false, false, 0 };

  // Turn off onboard LEDs
  RXLED1;  // RX LED off
  TXLED1;  // TX LED off
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  unsigned long now = millis();
  bool anyInputPressed = false;

  // --- 1. Scan input pins (debounced) ---
  for (int i = 0; i < 3; i++) {
    bool raw = (digitalRead(inputs[i].pin) == LOW);  // LOW = pressed

    // Detect raw state change → reset debounce timer
    if (raw != inputs[i].rawLast) {
      inputs[i].rawLast  = raw;
      inputs[i].lastEdge = now;
    }

    // Accept new state only after it has been stable for DEBOUNCE_MS
    if ((now - inputs[i].lastEdge) >= DEBOUNCE_MS) {
      if (raw != inputs[i].pressed) {
        inputs[i].pressed = raw;
        if (raw) {
          sendNoteOn(MIDI_CH, inputs[i].note, MIDI_VELOCITY);
        } else {
          sendNoteOff(MIDI_CH, inputs[i].note);
        }
      }
    }

    if (inputs[i].pressed) anyInputPressed = true;
  }

  // --- 2. RX LED: on while any input key is pressed ---
  if (anyInputPressed) {
    RXLED0;  // on
  } else {
    RXLED1;  // off
  }

  // --- 3. Process incoming MIDI messages (from PC) ---
  bool anyOutputActive = false;

  midiEventPacket_t rx = MidiUSB.read();
  while (rx.header != 0) {
    byte status  = rx.byte1 & 0xF0;
    byte channel = rx.byte1 & 0x0F;
    byte note    = rx.byte2;
    byte velocity = rx.byte3;

    if (channel == MIDI_CH) {
      int pin = outputPinForNote(note);
      if (pin >= 0) {
        if (status == 0x90 && velocity > 0) {
          // Note On → drive output HIGH
          digitalWrite(pin, HIGH);
        } else if (status == 0x80 || (status == 0x90 && velocity == 0)) {
          // Note Off (or Note On with velocity 0) → drive output LOW
          digitalWrite(pin, LOW);
        }
      }
    }

    rx = MidiUSB.read();
  }

  // --- 4. TX LED: on while any output pin is HIGH ---
  if (digitalRead(PIN_OUT_STRAIGHT) == HIGH ||
      digitalRead(PIN_OUT_DIT)      == HIGH ||
      digitalRead(PIN_OUT_DAH)      == HIGH) {
    TXLED0;  // on
  } else {
    TXLED1;  // off
  }
}
