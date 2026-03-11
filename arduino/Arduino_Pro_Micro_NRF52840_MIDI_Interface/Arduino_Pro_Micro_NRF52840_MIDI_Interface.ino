/**
 * Arduino Pro Micro (nRF52840) MIDI Interface for Morse Code Studio
 *
 * ============================================================
 * OVERVIEW
 * ============================================================
 * This sketch turns an nRF52840-based Pro Micro board (such as
 * the Supermini nRF52840, nice!nano, or similar) into a USB
 * MIDI device that bridges physical momentary switches (morse
 * keys, paddles, foot switches, etc.) with Morse Code Studio
 * running in a browser.
 *
 * This is the nRF52840 variant. For the classic ATmega32U4
 * Pro Micro, use the other sketch instead.
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
 * The onboard LEDs are NOT used by this sketch — the PCA10056
 *           board definition maps LED constants to different GPIO
 *           pins than those on the Supermini/nice!nano, causing
 *           conflicts. GPIO operations use the nRF HAL directly.
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
 *      "Nordic Semiconductor nRF52840 DK (PCA10056)"
 *
 *    NOTE: The Adafruit BSP doesn't include a board definition
 *    for the Supermini or nice!nano. Do NOT select "Adafruit
 *    Feather" or "ItsyBitsy" — they remap pin numbers and
 *    cause hard faults on clone boards. The Nordic DK definition
 *    is used here, but its Arduino pin map does NOT match the
 *    Supermini GPIO layout. This sketch therefore bypasses
 *    Arduino's pinMode/digitalWrite/digitalRead and calls the
 *    nRF HAL GPIO functions directly with the real hardware
 *    GPIO numbers.
 *
 * 3. Tools → USB Stack → "TinyUSB"
 *
 * ============================================================
 * ARDUINO PRO MICRO PINOUT
 * ============================================================
 * The nRF52840 Pro Micro (Supermini / nice!nano) has the same
 * physical footprint as the ATmega32U4 Pro Micro, but the
 * silkscreen labels do NOT match the nRF52840 GPIO numbers.
 * This sketch uses raw GPIO numbers for the Nordic DK board
 * definition.
 *
 *   PIN  Silk  nRF GPIO   Dir  Ch  Note
 *   ───  ────  ────────   ───  ──  ────
 *    1   "2"   P0.17 (17) IN   1  C4  (60)
 *    2   "3"   P0.20 (20) IN   1  D4  (62)
 *    3   "4"   P0.22 (22) IN   1  E4  (64)
 *    4   "5"   P0.24 (24) IN   1  F#4 (66)
 *    5   "6"   P1.00 (32) IN   1  G#4 (68)
 *    6   "7"   P0.11 (11) IN   2  A#4 (70)
 *    7   "8"   P1.04 (36) IN   2  C5  (72)
 *    8   "9"   P1.06 (38) IN   2  D5  (74)
 *    9   "10"  P0.09  (9) IN   2  E5  (76)
 *   10   "16"  P0.10 (10) IN   2  F#5 (78)
 *   11   "14"  P1.11 (43) OUT  1  G#5 (80)
 *   12   "15"  P1.13 (45) OUT  1  A#5 (82)
 *   13   "A0"  P0.02  (2) OUT  1  C6  (84)
 *   14   "A1"  P0.03  (3) OUT  2  D6  (86)
 *   15   "A2"  P0.28 (28) OUT  2  E6  (88)
 *   16   "A3"  P0.29 (29) OUT  2  F#6 (90)
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

#include <Adafruit_TinyUSB.h>
#include <MIDI.h>
#include <nrf_gpio.h>

// ============================================================
// nRF GPIO HELPERS
// ============================================================
// The PCA10056 board definition has its own pin-number-to-GPIO
// mapping (g_ADigitalPinMap). Arduino's pinMode/digitalWrite/
// digitalRead use that table, so pin 24 does NOT mean GPIO 24.
//
// To use the actual hardware GPIO numbers for the Supermini /
// nice!nano, we call the nRF HAL functions directly. These
// helper functions wrap them with an Arduino-like API.

inline void gpioMode(uint32_t gpio, bool output) {
  if (output) {
    nrf_gpio_cfg_output(gpio);
  } else {
    nrf_gpio_cfg_input(gpio, NRF_GPIO_PIN_PULLUP);
  }
}

inline void gpioWrite(uint32_t gpio, bool high) {
  if (high) {
    nrf_gpio_pin_set(gpio);
  } else {
    nrf_gpio_pin_clear(gpio);
  }
}

inline bool gpioRead(uint32_t gpio) {
  return (nrf_gpio_pin_read(gpio) != 0);
}

// ============================================================
// USB MIDI SETUP
// ============================================================
Adafruit_USBD_MIDI usbMidi;
MIDI_CREATE_INSTANCE(Adafruit_USBD_MIDI, usbMidi, MIDI);

// ============================================================
// PIN CONFIGURATION  —  RAW GPIO NUMBERS
// ============================================================
// Because the Nordic DK board definition is selected (no pin
// remapping), we must use the actual nRF52840 GPIO numbers,
// NOT the silkscreen labels printed on the board.
//
// Each slot below defines one pin with four properties:
//
//   PIN_n  — raw nRF52840 GPIO number
//   DIR_n  — direction: 0 = input, 1 = output
//   CH_n   — MIDI channel (1–16; the MIDI Library is 1-based,
//            so 1 here = channel 0 in the ATmega sketch / MCS)
//   NOTE_n — MIDI note number (0–127)
//
// Change any value to reconfigure the board. Slots whose
// direction is set to input will use debounced switch
// reading; slots set to output will respond to incoming
// MIDI messages matching their channel + note.
//
// Silkscreen → GPIO mapping (nice!nano / Supermini nRF52840):
//   "2"→17  "3"→20  "4"→22  "5"→24  "6"→32  "7"→11
//   "8"→36  "9"→38  "10"→9  "16"→10  "14"→43  "15"→45
//   "A0"→2  "A1"→3  "A2"→28  "A3"→29

/** Total number of configurable pin slots */
const int NUM_PINS = 16;

/** Direction constants */
const byte DIR_IN  = 0;
const byte DIR_OUT = 1;

//        Pin    Dir      Ch  Note
// ──────────────────────────────────────
const int  PIN_1  = 17;  const byte DIR_1  = DIR_IN;   const byte CH_1  = 1;  const byte NOTE_1  = 60;  // C4
const int  PIN_2  = 20;  const byte DIR_2  = DIR_IN;   const byte CH_2  = 1;  const byte NOTE_2  = 62;  // D4
const int  PIN_3  = 22;  const byte DIR_3  = DIR_IN;   const byte CH_3  = 1;  const byte NOTE_3  = 64;  // E4
const int  PIN_4  = 24;  const byte DIR_4  = DIR_IN;   const byte CH_4  = 1;  const byte NOTE_4  = 66;  // F#4
const int  PIN_5  = 32;  const byte DIR_5  = DIR_IN;   const byte CH_5  = 1;  const byte NOTE_5  = 68;  // G#4
const int  PIN_6  = 11;  const byte DIR_6  = DIR_IN;   const byte CH_6  = 2;  const byte NOTE_6  = 70;  // A#4
const int  PIN_7  = 36;  const byte DIR_7  = DIR_IN;   const byte CH_7  = 2;  const byte NOTE_7  = 72;  // C5
const int  PIN_8  = 38;  const byte DIR_8  = DIR_IN;   const byte CH_8  = 2;  const byte NOTE_8  = 74;  // D5
const int  PIN_9  =  9;  const byte DIR_9  = DIR_IN;   const byte CH_9  = 2;  const byte NOTE_9  = 76;  // E5
const int  PIN_10 = 10;  const byte DIR_10 = DIR_IN;   const byte CH_10 = 2;  const byte NOTE_10 = 78;  // F#5
const int  PIN_11 = 43;  const byte DIR_11 = DIR_OUT;  const byte CH_11 = 1;  const byte NOTE_11 = 80;  // G#5
const int  PIN_12 = 45;  const byte DIR_12 = DIR_OUT;  const byte CH_12 = 1;  const byte NOTE_12 = 82;  // A#5
const int  PIN_13 =  2;  const byte DIR_13 = DIR_OUT;  const byte CH_13 = 1;  const byte NOTE_13 = 84;  // C6
const int  PIN_14 =  3;  const byte DIR_14 = DIR_OUT;  const byte CH_14 = 2;  const byte NOTE_14 = 86;  // D6
const int  PIN_15 = 28;  const byte DIR_15 = DIR_OUT;  const byte CH_15 = 2;  const byte NOTE_15 = 88;  // E6
const int  PIN_16 = 29;  const byte DIR_16 = DIR_OUT;  const byte CH_16 = 2;  const byte NOTE_16 = 90;  // F#6

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

/** Debounce interval in milliseconds */
const unsigned long DEBOUNCE_MS = 5;

// ============================================================
// INTERNAL STATE — no need to edit below this line
// ============================================================

/** Tracks the debounced state of one input pin. */
struct InputState {
  int      pin;           // raw nRF GPIO number
  byte     channel;       // MIDI channel (1-based)
  byte     note;          // MIDI note to send
  bool     pressed;       // current debounced state (true = closed)
  bool     rawLast;       // last raw reading
  unsigned long lastEdge; // millis() of last raw state change
};

/** Maps one output channel+note combination to its GPIO pin. */
struct OutputMapping {
  int  pin;      // raw nRF GPIO number
  byte channel;  // MIDI channel (1-based)
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

// ============================================================
// MIDI CALLBACKS
// ============================================================

/** Called when the PC sends a Note On message. */
void handleNoteOn(byte channel, byte note, byte velocity) {
  int pin = outputPinForMessage(channel, note);
  if (pin >= 0 && velocity > 0) {
    gpioWrite(pin, true);
  } else if (pin >= 0) {
    // Velocity 0 = Note Off
    gpioWrite(pin, false);
  }
}

/** Called when the PC sends a Note Off message. */
void handleNoteOff(byte channel, byte note, byte velocity) {
  int pin = outputPinForMessage(channel, note);
  if (pin >= 0) {
    gpioWrite(pin, false);
  }
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
      // Input: enable internal pull-up via nRF HAL; when switch
      // is open the pin reads HIGH, when shorted to GND it reads LOW.
      gpioMode(pins[i], false);
      inputs[numInputs] = { pins[i], chs[i], notes[i], false, false, 0 };
      numInputs++;
    } else {
      // Output: start LOW (off) via nRF HAL.
      gpioMode(pins[i], true);
      gpioWrite(pins[i], false);
      outputMaps[numOutputs] = { pins[i], chs[i], notes[i] };
      numOutputs++;
    }
  }

  // Initialise USB MIDI
  usbMidi.setStringDescriptor("MCS MIDI Interface");
  usbMidi.begin();  // Register MIDI interface with TinyUSB

  // Wait for USB to be ready
  while (!TinyUSBDevice.mounted()) {
    delay(1);
  }

  // Initialise MIDI Library (used for sending only)
  MIDI.begin(MIDI_CHANNEL_OMNI);
  MIDI.turnThruOff();
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  unsigned long now = millis();

  // --- 1. Scan input pins (debounced) ---
  for (int i = 0; i < numInputs; i++) {
    bool raw = !gpioRead(inputs[i].pin);  // active LOW: pressed = pin reads 0

    if (raw != inputs[i].rawLast) {
      inputs[i].rawLast  = raw;
      inputs[i].lastEdge = now;
    }

    if ((now - inputs[i].lastEdge) >= DEBOUNCE_MS) {
      if (raw != inputs[i].pressed) {
        inputs[i].pressed = raw;
        if (raw) {
          MIDI.sendNoteOn(inputs[i].note, MIDI_VELOCITY, inputs[i].channel);
        } else {
          MIDI.sendNoteOff(inputs[i].note, 0, inputs[i].channel);
        }
      }
    }
  }

  // --- 2. Process incoming MIDI via raw TinyUSB C API ---
  // The MIDI Library's read() does not reliably receive on
  // the Adafruit nRF52 TinyUSB transport, so we read raw
  // USB MIDI packets directly.
  uint8_t packet[4];
  while (tud_midi_available()) {
    if (tud_midi_packet_read(packet)) {
      uint8_t status  = packet[1];
      uint8_t note    = packet[2];
      uint8_t vel     = packet[3];
      uint8_t msgType = status & 0xF0;
      uint8_t chan    = (status & 0x0F) + 1;  // 1-based

      if (msgType == 0x90 && vel > 0) {
        handleNoteOn(chan, note, vel);
      } else if (msgType == 0x80 || (msgType == 0x90 && vel == 0)) {
        handleNoteOff(chan, note, vel);
      }
    }
  }
}
