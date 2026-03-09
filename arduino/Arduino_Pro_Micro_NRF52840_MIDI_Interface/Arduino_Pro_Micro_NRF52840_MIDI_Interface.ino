/**
 * Arduino Pro Micro (nRF52840) MIDI Interface for Morse Code Studio
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
 * PIN LAYOUT
 * ============================================================
 * The nRF52840 Pro Micro (Supermini / nice!nano) has the same
 * physical footprint as the ATmega32U4 Pro Micro, but the
 * silkscreen labels do NOT match the nRF52840 GPIO numbers.
 * This sketch uses raw GPIO numbers for the Nordic DK board
 * definition.
 *
 * Silkscreen → nRF52840 GPIO mapping (nice!nano / Supermini):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │                  USB Connector                      │
 *   ├────────────────┬────────────────────────────────────┤
 *   │  D1/TX         │     RAW / VIN                     │
 *   │  D0/RX         │     GND  ← output ground          │
 *   │  GND     ◄──── │ ── input ground                   │
 *   │  GND           │     RST                           │
 *   │  "2"  P0.17 ← │ ── Straight Key IN   (GPIO 17)    │
 *   │  "3"  P0.20 ← │ ── Dit Paddle IN     (GPIO 20)    │
 *   │  "4"  P0.22 ← │ ── Dah Paddle IN     (GPIO 22)    │
 *   │  "5"  P0.24 → │ ── Straight Key OUT  (GPIO 24)    │
 *   │  "6"  P1.00 → │ ── Dit OUT           (GPIO 32)    │
 *   │  "7"  P0.11 → │ ── Dah OUT           (GPIO 11)    │
 *   │  "8"  P1.04   │     ...                            │
 *   │  "9"  P1.06   │     ...                            │
 *   │  ...          │     ...                            │
 *   ├────────────────┴────────────────────────────────────┤
 *   │       (B+)      (B−)      (RST)                    │
 *   └─────────────────────────────────────────────────────┘
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
// The table below maps silkscreen → GPIO for the nice!nano /
// Supermini nRF52840. If your board differs, update these.
//
//   Silkscreen "2" → P0.17 → GPIO 17
//   Silkscreen "3" → P0.20 → GPIO 20
//   Silkscreen "4" → P0.22 → GPIO 22
//   Silkscreen "5" → P0.24 → GPIO 24
//   Silkscreen "6" → P1.00 → GPIO 32  (32 + 0)
//   Silkscreen "7" → P0.11 → GPIO 11

/** Straight key input — silkscreen "2", GPIO P0.17 */
const int PIN_IN_STRAIGHT = 17;

/** Dit (dot) paddle input — silkscreen "3", GPIO P0.20 */
const int PIN_IN_DIT      = 20;

/** Dah (dash) paddle input — silkscreen "4", GPIO P0.22 */
const int PIN_IN_DAH      = 22;

/** Straight key output — silkscreen "5", GPIO P0.24 */
const int PIN_OUT_STRAIGHT = 24;

/** Dit output — silkscreen "6", GPIO P1.00 */
const int PIN_OUT_DIT      = 32;

/** Dah output — silkscreen "7", GPIO P0.11 */
const int PIN_OUT_DAH      = 11;

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
// These MUST differ from the input notes to prevent feedback loops
// when both MIDI input and output are enabled simultaneously.
const byte NOTE_OUT_STRAIGHT = 66;  // F#4
const byte NOTE_OUT_DIT      = 68;  // G#4
const byte NOTE_OUT_DAH      = 70;  // A#4

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
    gpioWrite(pin, true);
  } else if (pin >= 0) {
    // Velocity 0 = Note Off
    gpioWrite(pin, false);
  }
}

/** Called when the PC sends a Note Off message. */
void handleNoteOff(byte channel, byte note, byte velocity) {
  if (channel != MIDI_CH) return;
  int pin = outputPinForNote(note);
  if (pin >= 0) {
    gpioWrite(pin, false);
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  // Configure input pins with internal pull-up resistors
  // Using nRF HAL directly to bypass PCA10056 pin map
  gpioMode(PIN_IN_STRAIGHT, false);
  gpioMode(PIN_IN_DIT,      false);
  gpioMode(PIN_IN_DAH,      false);

  // Configure output pins — start LOW (off)
  gpioMode(PIN_OUT_STRAIGHT, true);
  gpioMode(PIN_OUT_DIT,      true);
  gpioMode(PIN_OUT_DAH,      true);
  gpioWrite(PIN_OUT_STRAIGHT, false);
  gpioWrite(PIN_OUT_DIT,      false);
  gpioWrite(PIN_OUT_DAH,      false);


  // Initialise input state tracking
  inputs[0] = { PIN_IN_STRAIGHT, NOTE_IN_STRAIGHT, false, false, 0 };
  inputs[1] = { PIN_IN_DIT,      NOTE_IN_DIT,      false, false, 0 };
  inputs[2] = { PIN_IN_DAH,      NOTE_IN_DAH,      false, false, 0 };

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
  bool anyInputPressed = false;

  // --- 1. Scan input pins (debounced) ---
  for (int i = 0; i < 3; i++) {
    bool raw = !gpioRead(inputs[i].pin);  // active LOW: pressed = pin reads 0

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
