/**
 * Arduino Pro Micro MIDI Interface for Morse Code Studio
 * Version 1.1.0
 *
 * ============================================================
 * OVERVIEW
 * ============================================================
 * This sketch turns an Arduino Pro Micro (ATmega32U4) into a
 * USB MIDI device that bridges physical momentary switches
 * (morse keys, paddles, foot switches, etc.) with Morse Code
 * Studio running in a browser.
 *
 * All 16 usable GPIO pins are configurable. Each pin has four
 * settings: GPIO number, direction (input or output), MIDI
 * channel, and MIDI note. Change any combination to suit your
 * wiring and MIDI mapping.
 *
 * INPUTS  — When a contact closes (shorts to GND), the
 *           Arduino sends a MIDI Note On. When it opens, it
 *           sends Note Off.
 *
 * OUTPUTS — When the PC sends a MIDI Note On matching a pin's
 *           channel + note, the Arduino drives that pin HIGH.
 *           On Note Off the pin goes LOW again.
 *
 * LEDS    — The onboard RX LED lights while any input is
 *           pressed. The TX LED lights while any output pin is
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
 * ARDUINO PRO MICRO PINOUT
 * ============================================================
 *
 *   PIN  GPIO  Dir  Ch  Note
 *   ───  ────  ───  ──  ────
 *    1     2   IN    0  C4  (60)
 *    2     3   IN    0  D4  (62)
 *    3     4   IN    0  E4  (64)
 *    4     5   IN    0  F#4 (66)
 *    5     6   IN    0  G#4 (68)
 *    6     7   IN    1  A#4 (70)
 *    7     8   IN    1  C5  (72)
 *    8     9   IN    1  D5  (74)
 *    9    10   IN    1  E5  (76)
 *   10    16   IN    1  F#5 (78)
 *   11    14   OUT   0  G#5 (80)
 *   12    15   OUT   0  A#5 (82)
 *   13    A0   OUT   0  C6  (84)
 *   14    A1   OUT   1  D6  (86)
 *   15    A2   OUT   1  E6  (88)
 *   16    A3   OUT   1  F#6 (90)
 *
 *   GND is available on both sides of the board.
 *
 *   Every pin's direction, MIDI channel, and note are fully
 *   configurable — edit the PIN/DIR/CH/NOTE constants below.
 *
 *   Input pins use internal pull-up resistors (no external
 *   components needed — just wire the switch between the pin
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
// The Pro Micro (ATmega32U4) has 16 usable GPIO pins.
// Each slot below defines one pin with four properties:
//
//   PIN_n  — GPIO pin number
//   DIR_n  — direction: 0 = input, 1 = output
//   CH_n   — MIDI channel (0–15; 0 = "Channel 1")
//   NOTE_n — MIDI note number (0–127)
//
// Change any value to reconfigure the board. Slots whose
// direction is set to input will use debounced switch
// reading; slots set to output will respond to incoming
// MIDI messages matching their channel + note.

/** Total number of configurable pin slots */
const int NUM_PINS = 16;

/** Direction constants */
const byte DIR_IN  = 0;
const byte DIR_OUT = 1;

//        Pin   Dir      Ch  Note
// ─────────────────────────────────────
const int  PIN_1  =  2;  const byte DIR_1  = DIR_IN;   const byte CH_1  = 0;  const byte NOTE_1  = 60;  // C4
const int  PIN_2  =  3;  const byte DIR_2  = DIR_IN;   const byte CH_2  = 0;  const byte NOTE_2  = 62;  // D4
const int  PIN_3  =  4;  const byte DIR_3  = DIR_IN;   const byte CH_3  = 0;  const byte NOTE_3  = 64;  // E4
const int  PIN_4  =  5;  const byte DIR_4  = DIR_IN;   const byte CH_4  = 0;  const byte NOTE_4  = 66;  // F#4
const int  PIN_5  =  6;  const byte DIR_5  = DIR_IN;   const byte CH_5  = 0;  const byte NOTE_5  = 68;  // G#4
const int  PIN_6  =  7;  const byte DIR_6  = DIR_IN;   const byte CH_6  = 1;  const byte NOTE_6  = 70;  // A#4
const int  PIN_7  =  8;  const byte DIR_7  = DIR_IN;   const byte CH_7  = 1;  const byte NOTE_7  = 72;  // C5
const int  PIN_8  =  9;  const byte DIR_8  = DIR_IN;   const byte CH_8  = 1;  const byte NOTE_8  = 74;  // D5
const int  PIN_9  = 10;  const byte DIR_9  = DIR_IN;   const byte CH_9  = 1;  const byte NOTE_9  = 76;  // E5
const int  PIN_10 = 16;  const byte DIR_10 = DIR_IN;   const byte CH_10 = 1;  const byte NOTE_10 = 78;  // F#5
const int  PIN_11 = 14;  const byte DIR_11 = DIR_OUT;  const byte CH_11 = 0;  const byte NOTE_11 = 80;  // G#5
const int  PIN_12 = 15;  const byte DIR_12 = DIR_OUT;  const byte CH_12 = 0;  const byte NOTE_12 = 82;  // A#5
const int  PIN_13 = 18;  const byte DIR_13 = DIR_OUT;  const byte CH_13 = 0;  const byte NOTE_13 = 84;  // C6
const int  PIN_14 = 19;  const byte DIR_14 = DIR_OUT;  const byte CH_14 = 1;  const byte NOTE_14 = 86;  // D6
const int  PIN_15 = 20;  const byte DIR_15 = DIR_OUT;  const byte CH_15 = 1;  const byte NOTE_15 = 88;  // E6
const int  PIN_16 = 21;  const byte DIR_16 = DIR_OUT;  const byte CH_16 = 1;  const byte NOTE_16 = 90;  // F#6

// ============================================================
// MIDI VELOCITY
// ============================================================

/** MIDI velocity for Note On messages (0–127). */
const byte MIDI_VELOCITY = 127;

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
// RX LED → lights while any input switch is pressed
// TX LED → lights while any output pin is driven HIGH

// ============================================================
// INTERNAL STATE — no need to edit below this line
// ============================================================

/** Tracks the debounced state of one input pin. */
struct InputState {
  int      pin;           // GPIO pin number
  byte     channel;       // MIDI channel
  byte     note;          // MIDI note to send
  bool     pressed;       // current debounced state (true = closed)
  bool     rawLast;       // last raw reading
  unsigned long lastEdge; // millis() of last raw state change
};

/** Maps one output channel+note combination to its GPIO pin. */
struct OutputMapping {
  int  pin;      // GPIO pin number
  byte channel;  // MIDI channel
  byte note;     // MIDI note that triggers this output
};

/** Runtime arrays — sized to NUM_PINS (worst case all one direction). */
InputState    inputs[NUM_PINS];
OutputMapping outputMaps[NUM_PINS];
int numInputs  = 0;
int numOutputs = 0;

/**
 * Find the output GPIO pin for a given MIDI channel and note.
 * Returns -1 if no output is mapped to that combination.
 */
int outputPinForMessage(byte channel, byte note) {
  for (int i = 0; i < numOutputs; i++) {
    if (outputMaps[i].channel == channel && outputMaps[i].note == note) {
      return outputMaps[i].pin;
    }
  }
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
  // Collect all slot definitions into local arrays for iteration
  const int  pins[]  = { PIN_1,  PIN_2,  PIN_3,  PIN_4,  PIN_5,  PIN_6,
                          PIN_7,  PIN_8,  PIN_9,  PIN_10, PIN_11, PIN_12,
                          PIN_13, PIN_14, PIN_15, PIN_16 };
  const byte dirs[]  = { DIR_1,  DIR_2,  DIR_3,  DIR_4,  DIR_5,  DIR_6,
                          DIR_7,  DIR_8,  DIR_9,  DIR_10, DIR_11, DIR_12,
                          DIR_13, DIR_14, DIR_15, DIR_16 };
  const byte chs[]   = { CH_1,   CH_2,   CH_3,   CH_4,   CH_5,   CH_6,
                          CH_7,   CH_8,   CH_9,   CH_10,  CH_11,  CH_12,
                          CH_13,  CH_14,  CH_15,  CH_16  };
  const byte notes[] = { NOTE_1,  NOTE_2,  NOTE_3,  NOTE_4,  NOTE_5,  NOTE_6,
                          NOTE_7,  NOTE_8,  NOTE_9,  NOTE_10, NOTE_11, NOTE_12,
                          NOTE_13, NOTE_14, NOTE_15, NOTE_16 };

  numInputs  = 0;
  numOutputs = 0;

  for (int i = 0; i < NUM_PINS; i++) {
    if (dirs[i] == DIR_IN) {
      // Input: enable internal pull-up; when switch is open the
      // pin reads HIGH, when shorted to GND it reads LOW.
      pinMode(pins[i], INPUT_PULLUP);
      inputs[numInputs] = { pins[i], chs[i], notes[i], false, false, 0 };
      numInputs++;
    } else {
      // Output: start LOW (off).
      pinMode(pins[i], OUTPUT);
      digitalWrite(pins[i], LOW);
      outputMaps[numOutputs] = { pins[i], chs[i], notes[i] };
      numOutputs++;
    }
  }

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
  for (int i = 0; i < numInputs; i++) {
    bool raw = (digitalRead(inputs[i].pin) == LOW);  // LOW = closed

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
          sendNoteOn(inputs[i].channel, inputs[i].note, MIDI_VELOCITY);
        } else {
          sendNoteOff(inputs[i].channel, inputs[i].note);
        }
      }
    }

    if (inputs[i].pressed) anyInputPressed = true;
  }

  // --- 2. RX LED: on while any input is pressed ---
  if (anyInputPressed) {
    RXLED0;  // on
  } else {
    RXLED1;  // off
  }

  // --- 3. Process incoming MIDI messages (from PC) ---
  midiEventPacket_t rx = MidiUSB.read();
  while (rx.header != 0) {
    byte status   = rx.byte1 & 0xF0;
    byte channel  = rx.byte1 & 0x0F;
    byte note     = rx.byte2;
    byte velocity = rx.byte3;

    int pin = outputPinForMessage(channel, note);
    if (pin >= 0) {
      if (status == 0x90 && velocity > 0) {
        // Note On → drive output HIGH
        digitalWrite(pin, HIGH);
      } else if (status == 0x80 || (status == 0x90 && velocity == 0)) {
        // Note Off (or Note On with velocity 0) → drive output LOW
        digitalWrite(pin, LOW);
      }
    }

    rx = MidiUSB.read();
  }

  // --- 4. TX LED: on while any output pin is HIGH ---
  bool anyOutputActive = false;
  for (int i = 0; i < numOutputs; i++) {
    if (digitalRead(outputMaps[i].pin) == HIGH) {
      anyOutputActive = true;
      break;
    }
  }
  if (anyOutputActive) {
    TXLED0;  // on
  } else {
    TXLED1;  // off
  }
}
