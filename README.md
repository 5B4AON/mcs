<h1><img src="public/favicon.svg" alt="" width="36" style="vertical-align: middle;">&nbsp; Morse Code Studio</h1>

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Live App](https://img.shields.io/badge/Live_App-morse--code--studio.web.app-green)](https://morse-code-studio.web.app/)
[![Changelog](https://img.shields.io/badge/Changelog-CHANGELOG.md-orange)](CHANGELOG.md)

A browser-based Morse code encoder, decoder and keyer built with Angular 19. Runs entirely in the browser — no installation, no backend. Provides real-time CW encoding and decoding with sub-millisecond timing precision, suitable for on-air operating at 5–50+ WPM.

Connect a physical key or paddle, and decoded Morse code appears instantly on a fullscreen display with customisable letter size and colours — ideal for live demonstrations, training sessions, and events promoting interest in Morse code.

## Features

**Decode** — Decodes incoming Morse code in real time from a radio receiver's audio via CW tone detection. Dual RX/TX calibration pools auto-calibrate independently so your sending speed and the other station's speed never interfere with each other.

**Encode** — Converts typed text into perfectly timed Morse code audio. Supports "Send on Enter" (compose then send) and "Live" (send as you type) modes.

**Key** — Five keyer modes: straight key, Iambic A, Iambic B, Ultimatic, and Single Lever, with full dit/dah memory and per-keyer reverse paddles. Input from an Arduino MIDI paddle interface, a computer keyboard, mouse, or touchscreen. Experimental: physical key input via microphone with ultrasonic pilot-tone detection.

**Key Your Radio** — Drives your transmitter's keying line through multiple output methods: Arduino MIDI optocoupler, sound card optocoupler (DC or AC mode), USB-serial adapter (DTR/RTS via Web Serial API), or WinKeyer.

**Online Relay** — Relay Morse characters between app instances in real time over the internet via Firebase Realtime Database. Each character carries the sender's WPM so the receiving station plays it back at the original rhythm. Channels use a name + secret pair for access control, with callsign-prefixed lines in the fullscreen conversation view.

## Connecting Your Key and Radio

The app supports several hardware interfaces for physical key input and transmitter keying output. Each has different trade-offs in responsiveness, background operation, and browser support.

### Arduino MIDI (Recommended)

The **preferred interface** is a simple Arduino-based USB MIDI adapter. An Arduino Pro Micro (ATmega32U4 or nRF52840) enumerates as a standard USB MIDI device — no drivers needed — and provides both **paddle/key input** and **optocoupler keying output** over a single USB connection. The Web MIDI API delivers input events asynchronously (no polling), so timing is crisp and responsive even at high WPM. Crucially, **MIDI works when the browser is in the background or minimised**, unlike keyboard and mouse keyers which require the app to be in focus. This makes MIDI the most practical interface for on-air use where you may need to switch between applications while operating.

The [`arduino/`](arduino/) folder contains ready-made sketches for both board variants, with wiring diagrams for straight keys, iambic paddles, and optocoupler output circuits. See the [Arduino README](arduino/README.md) for build details.

### Keyboard, Mouse and Touch

The built-in keyboard, mouse, and touch keyers require no extra hardware — convenient for practice and portable use. All five keyer modes are supported. The main limitation is that **the browser tab must be in focus** to receive these events, so they are not suitable for background operation.

### Serial Port (DTR/RTS)

A USB-serial adapter can key your transmitter via DTR/RTS line toggling (Web Serial API — Chrome/Edge only). Reliable for keying **output**, but output-only — there is no event-driven input path for paddles.

### WinKeyer

For stations using a K1EL WinKeyer (WK2/WK3/WKUSB), the app can forward decoded or encoded text to the WinKeyer over its serial port. The WinKeyer generates hardware-precision CW keying independently — useful for relay, practice, or driving an external transmitter.

### Sound Card (Experimental)

The sound card can serve double duty: an **optocoupler output** (DC or AC mode) keys the transmitter via the headphone jack, while **microphone input** with ultrasonic pilot-tone detection reads a physical key's closures. CW tone decoding of received audio works well and is the primary decode path for most setups. The keying input side (pilot-tone detection) is experimental and sensitive to audio hardware latency, so MIDI remains the more robust choice for key input.

## Signal Routing

Every output (optocoupler, serial port, WinKeyer, sidetone, vibration, Firebase RTDB, MIDI) has an independent **forward / active-on** selector controlling whether it fires on TX signals, RX signals, or both. Each input (Mic, CW Tone, Keyboard, Mouse, Touch, MIDI) can be assigned to the RX or TX decoder pool, controlling both calibration and colour tagging in the fullscreen conversation view. Automatic loop detection suppresses output routing when a feedback loop is detected between outputs and inputs.

## Additional Features

- **Haptic Vibration** — The device vibrates in sync with the sidetone while the key is down. Configurable for TX only, RX only, or both. Enhanced haptic timing compensates for Android motor spin-up latency. Android only (Chrome, Firefox, Edge).
- **Screen Wake Lock** — Prevents the screen from locking during operation. Important on mobile where screen lock suspends network connectivity, interrupting Firebase relay. Uses the Screen Wake Lock API (Chrome 84+, Edge 84+, Safari 16.4+).
- **Progressive Web App** — Installable as a standalone app on desktop (Chrome, Edge) and mobile (Android Chrome, iOS Safari). The Angular service worker caches the app shell and assets for offline access.

## Getting Started

1. Open the app in **Chrome** or **Edge** (required for full feature support including device selection and serial ports).
2. Click **Start Audio** — grant microphone permission when prompted.
3. Expand **Settings** to configure your input/output devices, keyer bindings, and WPM.
4. Click **Save Settings** — your configuration is saved per device profile and persists across sessions.
5. Click the **Help** button from the top-right kebab menu for detailed documentation covering every feature, wiring diagrams, and real-world use-case examples.

## Browser Compatibility

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome  | Yes | Full support including Web Serial and Web MIDI |
| Edge    | Yes | Full support including Web Serial and Web MIDI |
| Firefox | Partial | No Web Serial or Web MIDI — serial/MIDI unavailable |
| Safari  | Partial | No Web Serial or Web MIDI — serial/MIDI unavailable |

## Development

```bash
npm install
ng serve
```

Navigate to `http://localhost:4200/`. The app reloads automatically on source changes.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit issues, feature requests, and pull requests.

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md).

## License

GPL-3.0 — see [LICENSE](LICENSE) for details.

© 2026 5B4AON — Mike
