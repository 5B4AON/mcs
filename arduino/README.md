# Arduino Pro Micro MIDI Interface

A USB MIDI hardware interface for [Morse Code Studio](../README.md), built on the **Arduino Pro Micro**. It bridges physical morse keys and paddles with the browser application over standard USB MIDI — no drivers required.

Two sketch variants are provided:

| Folder | Board | Chip | USB Library |
|--------|-------|------|-------------|
| [`Arduino_Pro_Micro_MIDI_Interface/`](Arduino_Pro_Micro_MIDI_Interface/) | Classic Pro Micro | ATmega32U4 | MIDIUSB |
| [`Arduino_Pro_Micro_NRF52840_MIDI_Interface/`](Arduino_Pro_Micro_NRF52840_MIDI_Interface/) | Pro Micro nRF52840 (Supermini, nice!nano, etc.) | nRF52840 | Adafruit TinyUSB + MIDI Library |

Both use the **same pin positions and wiring** — only the software differs.

---

## What it does

| Direction | Function |
|-----------|----------|
| **Input** | A straight key or iambic paddles connected to the Arduino send MIDI Note On/Off messages to Morse Code Studio when contacts close or open. |
| **Output** | Morse Code Studio sends MIDI Note On/Off messages to the Arduino, which drives output pins HIGH/LOW — typically through an optocoupler to key a radio transmitter. |

---

## ⚠️ Upgrading from v1.0.0

If you are upgrading from the v1.0.0 sketch (3 inputs + 3 outputs on pins 2–7):

- **Inputs on pins 2, 3, 4 still work** — these pins remain inputs with the same MIDI notes (60, 62, 64). No rewiring needed for keys/paddles.
- **Outputs have moved** — outputs are no longer on pins 5, 6, 7. They are now on pins 11–16 (GPIO 14, 15, A0, A1, A2, A3 on ATmega32U4). You must **rewire output connections** to the new pins.
- **Output MIDI notes have changed** — from F♯4/G♯4/A♯4 (66/68/70) to G♯5/A♯5/C6 (80/82/84). Update your **MIDI Output mappings** in Morse Code Studio to match (new profiles already use the correct defaults).
- **Reprogramming required** — upload the new v1.1.0 sketch to your Arduino.

---

## Pin assignments (v1.1.0)

Both board variants now support **16 configurable pins** — 10 inputs and 6 outputs by default, split across two MIDI channels. Every pin's direction, MIDI channel, and note are fully configurable at the top of each sketch.

| Pin | GPIO (ATmega32U4) | Dir | Ch | Note |
|-----|-------------------|-----|----|------|
| 1 | 2 | IN | 1 | C4 (60) |
| 2 | 3 | IN | 1 | D4 (62) |
| 3 | 4 | IN | 1 | E4 (64) |
| 4 | 5 | IN | 1 | F♯4 (66) |
| 5 | 6 | IN | 1 | G♯4 (68) |
| 6 | 7 | IN | 2 | A♯4 (70) |
| 7 | 8 | IN | 2 | C5 (72) |
| 8 | 9 | IN | 2 | D5 (74) |
| 9 | 10 | IN | 2 | E5 (76) |
| 10 | 16 | IN | 2 | F♯5 (78) |
| 11 | 14 | OUT | 1 | G♯5 (80) |
| 12 | 15 | OUT | 1 | A♯5 (82) |
| 13 | A0 | OUT | 1 | C6 (84) |
| 14 | A1 | OUT | 2 | D6 (86) |
| 15 | A2 | OUT | 2 | E6 (88) |
| 16 | A3 | OUT | 2 | F♯6 (90) |

GND is available on both sides of the board.

### ATmega32U4 Pin Overview

```mermaid
flowchart TB
    subgraph board["Arduino Pro Micro ATmega32U4 — Pin Assignments (v1.1.0)"]
        direction TB

        subgraph inputs["⬅️ INPUTS (10 pins) — active LOW, internal pull-up"]
            P1["Pin 1: GPIO 2 → Ch1, C4 (60)"]
            P2["Pin 2: GPIO 3 → Ch1, D4 (62)"]
            P3["Pin 3: GPIO 4 → Ch1, E4 (64)"]
            P4["Pin 4: GPIO 5 → Ch1, F#4 (66)"]
            P5["Pin 5: GPIO 6 → Ch1, G#4 (68)"]
            P6["Pin 6: GPIO 7 → Ch2, A#4 (70)"]
            P7["Pin 7: GPIO 8 → Ch2, C5 (72)"]
            P8["Pin 8: GPIO 9 → Ch2, D5 (74)"]
            P9["Pin 9: GPIO 10 → Ch2, E5 (76)"]
            P10["Pin 10: GPIO 16 → Ch2, F#5 (78)"]
            GND_IN["GND → Common ground for keys/paddles"]
        end

        subgraph outputs["➡️ OUTPUTS (6 pins) — active HIGH"]
            P11["Pin 11: GPIO 14 → Ch1, G#5 (80)"]
            P12["Pin 12: GPIO 15 → Ch1, A#5 (82)"]
            P13["Pin 13: GPIO A0 → Ch1, C6 (84)"]
            P14["Pin 14: GPIO A1 → Ch2, D6 (86)"]
            P15["Pin 15: GPIO A2 → Ch2, E6 (88)"]
            P16["Pin 16: GPIO A3 → Ch2, F#6 (90)"]
            GND_OUT["GND → Common ground for optocouplers"]
        end

        subgraph leds["💡 ONBOARD LEDs"]
            RX["RX LED → Lights when any input key is pressed"]
            TX["TX LED → Lights when any output is driven by PC"]
        end
    end
```

<img width="500" height="500" alt="image" src="https://github.com/user-attachments/assets/4e7b99f3-224f-415e-b1a8-87df6932f882" />


### nRF52840 Pin Overview

The nRF52840 Pro Micro has the same pin layout plus 3 bottom pads (B+, B−, RST for battery). The onboard LEDs are **not used** by this sketch — the PCA10056 board definition maps LED constants to different GPIO pins than those on the Supermini/nice!nano, causing conflicts.

```mermaid
flowchart TB
    subgraph board["Pro Micro nRF52840 — Pin Assignments (v1.1.0)"]
        direction TB

        subgraph inputs["⬅️ INPUTS (10 pins) — active LOW, internal pull-up"]
            P1["Pin 1: P0.17 → Ch1, C4 (60)"]
            P2["Pin 2: P0.20 → Ch1, D4 (62)"]
            P3["Pin 3: P0.22 → Ch1, E4 (64)"]
            P4["Pin 4: P0.24 → Ch1, F#4 (66)"]
            P5["Pin 5: P1.00 → Ch1, G#4 (68)"]
            P6["Pin 6: P0.11 → Ch2, A#4 (70)"]
            P7["Pin 7: P1.04 → Ch2, C5 (72)"]
            P8["Pin 8: P1.06 → Ch2, D5 (74)"]
            P9["Pin 9: P0.09 → Ch2, E5 (76)"]
            P10["Pin 10: P0.10 → Ch2, F#5 (78)"]
            GND_IN["GND → Common ground for keys/paddles"]
        end

        subgraph outputs["➡️ OUTPUTS (6 pins) — active HIGH"]
            P11["Pin 11: P1.11 → Ch1, G#5 (80)"]
            P12["Pin 12: P1.13 → Ch1, A#5 (82)"]
            P13["Pin 13: P0.02 → Ch1, C6 (84)"]
            P14["Pin 14: P0.03 → Ch2, D6 (86)"]
            P15["Pin 15: P0.28 → Ch2, E6 (88)"]
            P16["Pin 16: P0.29 → Ch2, F#6 (90)"]
            GND_OUT["GND → Common ground for optocouplers"]
        end

        subgraph leds["💡 ONBOARD LEDs"]
            LED_NOTE["Neither LED is used — PCA10056 BSP pin conflict"]
        end

        subgraph bottom["⬇️ BOTTOM PADS"]
            BP["B+  ·  B−  ·  RST"]
        end
    end
```

<img width="486" height="410" alt="image" src="https://github.com/user-attachments/assets/89838fd7-c45b-4380-b024-0340e8df165d" />



---

## MIDI defaults

| Parameter | Value |
|-----------|-------|
| Velocity | 127 |
| Debounce | 5 ms |
| **Input** notes (Arduino → PC): | |
| Straight Key (Pin 1) | Ch 1, 60 (C4) |
| Dit Paddle (Pin 2) | Ch 1, 62 (D4) |
| Dah Paddle (Pin 3) | Ch 1, 64 (E4) |
| Pins 4–10 | Ch 1–2, 66–78 (configurable) |
| **Output** notes (PC → Arduino): | |
| Straight Key (Pin 11) | Ch 1, 80 (G♯5) |
| Dit (Pin 12) | Ch 1, 82 (A♯5) |
| Dah (Pin 13) | Ch 1, 84 (C6) |
| Pins 14–16 | Ch 2, 86–90 (configurable) |

Input and output notes are deliberately different to prevent feedback loops when both MIDI input and MIDI output are enabled on the same device.

All values are configurable at the top of each sketch before uploading.

---

## Wiring diagrams

### Straight Key Input

Connect a straight key (or any normally-open switch) between **Pin 1** (GPIO 2) and **GND**. No external resistors are needed — the Arduino's internal pull-up keeps the pin HIGH when the key is open.

```mermaid
flowchart LR
    subgraph key["🔘 Straight Key"]
        T1["Terminal 1"]
        T2["Terminal 2"]
    end

    subgraph board["Arduino Pro Micro"]
        P2["Pin 1 (GPIO 2)"]
        GND["GND"]
    end

    T1 -- "wire" --> P2
    T2 -- "wire" --> GND
```

### Iambic Paddle Input

Connect an iambic paddle's **dit** contact to **Pin 2** (GPIO 3), **dah** contact to **Pin 3** (GPIO 4), and **common** to **GND**.

```mermaid
flowchart LR
    subgraph paddles["🎛️ Iambic Paddles"]
        LP["Left Paddle — Dit"]
        RP["Right Paddle — Dah"]
        COM["Common"]
    end

    subgraph board["Arduino Pro Micro"]
        P3["Pin 2 (GPIO 3)"]
        P4["Pin 3 (GPIO 4)"]
        GND["GND"]
    end

    LP -- "wire" --> P3
    RP -- "wire" --> P4
    COM -- "wire" --> GND
```

### Output via Optocoupler

To key a radio transmitter, connect an output pin through a **220 Ω resistor** to the anode of an optocoupler (e.g. 4N25). The optocoupler's output side connects to the radio's key line, providing electrical isolation.

This diagram shows one channel — repeat for each output pin you need (Pin 11, 12, or 13 on ATmega32U4 / corresponding nRF52840 pins).

```mermaid
flowchart LR
    subgraph board["Arduino Pro Micro"]
        P5["Pin 11 (GPIO 14) — or 12 / 13"]
        GND["GND"]
    end

    P5 -- "220 Ω resistor" --> ANODE

    subgraph opto["Optocoupler — e.g. 4N25"]
        ANODE["Pin 1  Anode +"]
        CATHODE["Pin 2  Cathode −"]
        COLLECTOR["Pin 5  Collector"]
        EMITTER["Pin 4  Emitter"]
    end

    CATHODE -- "wire" --> GND

    subgraph radio["Radio / Device"]
        KEY_LINE["Key Line"]
        KEY_GND["Key Ground"]
    end

    COLLECTOR -- "wire" --> KEY_LINE
    EMITTER -- "wire" --> KEY_GND
```

---

## Requirements

### ATmega32U4 variant

- **Board:** Arduino Pro Micro 5V/16MHz (or any ATmega32U4 board with native USB)
- **Library:** [MIDIUSB](https://github.com/arduino-libraries/MIDIUSB) by Gary Grewal
- **Arduino IDE:** Tools → Board → "Arduino Micro"

### nRF52840 variant

- **Board:** Pro Micro nRF52840, Supermini nRF52840, nice!nano, or similar
- **Board package:** [Adafruit nRF52](https://github.com/adafruit/Adafruit_nRF52_Arduino) — add the Adafruit board URL in Preferences, then install via Boards Manager
- **Libraries:**
  - [Adafruit TinyUSB Library](https://github.com/adafruit/Adafruit_TinyUSB_Arduino)
  - [MIDI Library](https://github.com/FortySevenEffects/arduino_midi_library) by Forty Seven Effects
- **Arduino IDE:** Tools → Board → Adafruit nRF52 Boards → **"Nordic Semiconductor nRF52840 DK (PCA10056)"**; Tools → USB Stack → "TinyUSB"
- **Important:** Do NOT select "Adafruit Feather" or "ItsyBitsy" — they remap pin numbers and cause hard faults on clone boards. The Nordic DK definition uses raw GPIO numbers, which the sketch is configured for.

---

## Quick start

1. Open the appropriate sketch folder in the Arduino IDE:
   - **ATmega32U4:** `Arduino_Pro_Micro_MIDI_Interface/`
   - **nRF52840:** `Arduino_Pro_Micro_NRF52840_MIDI_Interface/`
2. Install the required libraries (see above).
3. Select your board and port under **Tools**.
4. Review the pin and MIDI configuration constants at the top of the sketch — all 16 pins are configurable with custom direction, channel, and note.
5. Upload the sketch.
6. Wire your key/paddles to the input pins (see diagrams above).
7. In Morse Code Studio, enable **MIDI Input** and/or **MIDI Output** in Settings and select the Arduino device.

---

## Mermaid diagram source files

The diagrams above are also available as standalone Mermaid files in [`diagrams/`](diagrams/) for editing or conversion to SVG:

| File | Description |
|------|-------------|
| [`pin-overview.mmd`](diagrams/pin-overview.mmd) | ATmega32U4 pin assignments |
| [`pin-overview-nrf52840.mmd`](diagrams/pin-overview-nrf52840.mmd) | nRF52840 pin assignments |
| [`input-straight-key.mmd`](diagrams/input-straight-key.mmd) | Straight key wiring |
| [`input-paddles.mmd`](diagrams/input-paddles.mmd) | Iambic paddle wiring |
| [`output-optocoupler.mmd`](diagrams/output-optocoupler.mmd) | Optocoupler output wiring |

---

## License
<a href="https://github.com/5B4AON/mcs">Morse Code Studio</a> is marked <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a><img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/zero.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;">  
CC0 1.0 Universal — see [LICENSE](../LICENSE) for details.
