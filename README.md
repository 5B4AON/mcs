<h1><img src="public/favicon.svg" alt="" width="36" style="vertical-align: middle;">&nbsp; Morse Code Studio</h1>

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Live App](https://img.shields.io/badge/Live_App-morse--code--studio.web.app-green)](https://morse-code-studio.web.app/)
[![Changelog](https://img.shields.io/badge/Changelog-CHANGELOG.md-orange)](CHANGELOG.md)

A browser-based Morse code encoder, decoder and keyer that runs entirely in the browser with no installation required. Built with Angular 19 and the Web Audio API, it provides real-time CW encoding/decoding with sub-millisecond timing precision suitable for on-air operating at 5–50+ WPM.

## What It Does

**Decode** — Listens to incoming Morse code from a physical key (via ultrasonic pilot tone through the mic input) or from a radio receiver's audio (via CW tone detection), and displays the decoded text on screen in real time. Dual RX/TX calibration pools auto-calibrate independently so your sending speed and the other station's speed never interfere with each other.

**Encode** — Converts typed text into perfectly timed Morse code audio. Supports "Send on Enter" (compose then send) and "Live" (send as you type) modes.

**Key** — Turns your computer keyboard, mouse or touchscreen into a Morse key with five modes: straight key, Iambic A, Iambic B, Ultimatic, and Single Lever, with full dit/dah memory and per-keyer reverse paddles.

**Key Your Radio** — Drives your transmitter's keying line via an optocoupler (sound card output in DC or AC mode) or a USB-serial adapter (DTR/RTS toggling via the Web Serial API).

**WinKeyer Output** — Forwards decoded text to a K1EL WinKeyer (WK2/WK3/WKUSB) device via its serial port. WinKeyer generates perfectly timed CW keying — choose to forward RX (received) text, TX (transmitted) text, or both. Useful for relay, practice, or driving an external transmitter with hardware-precision timing.

**Firebase Realtime Database** — Relay decoded Morse characters between app instances in real time over the internet. Subscribe to a named channel to receive remote characters (routed to any output whose forward mode includes RX), or publish your decoded/encoded characters for others to read. Each character carries the WPM speed used to generate it, so the receiving station plays it back at the sender's original rhythm. Channels use a name + secret pair for access control. Each line in the fullscreen conversation is prefixed with the sender's callsign (e.g. [5B4AON]) for clear attribution. Auto-reconnect with exponential backoff handles transient network interruptions.

**Haptic Vibration** — Optional vibration output mirrors the sidetone: the device vibrates while the key is down. Configurable via the "Active on" selector (TX only, RX only, or Both). Enhanced haptic timing overcomes Android motor spin-up latency for clear dits at higher speeds. Android only — supported in Chrome, Firefox and Edge for Android.

**Screen Wake Lock** — Optional setting (under the "Other" tab) that prevents the device screen from locking due to inactivity. On mobile devices, screen lock suspends network connectivity which interrupts Firebase RTDB relay and other live features. Uses the Screen Wake Lock API (Chrome 84+, Edge 84+, Safari 16.4+).

**Per-Output Routing** — Every output (optocoupler, serial port, WinKeyer, sidetone, vibration, Firebase RTDB) has an independent forward / active-on selector controlling whether it fires on TX signals, RX signals, or both. Automatic loop detection suppresses output routing when a feedback loop is detected between outputs and inputs.

**Decoder Source Routing** — Each input (Mic, CW Tone, Keyboard, Mouse, Touch) can be independently assigned to the RX or TX decoder pool, controlling both calibration and colour tagging in the fullscreen conversation view.

## Hardware Interfaces — Connecting to Your Key and Radio

Morse Code Studio supports several ways to connect physical keys and key your radio transmitter. Each has different trade-offs in responsiveness, background operation, and browser support.

### Arduino MIDI (Recommended)

The **preferred interface** is a simple Arduino-based USB MIDI adapter. An Arduino Pro Micro (ATmega32U4 or nRF52840) enumerates as a standard USB MIDI device — no drivers needed — and provides both **paddle/key input** and **optocoupler keying output** over a single USB connection. The Web MIDI API delivers input events asynchronously (no polling), so timing is crisp and responsive even at high WPM. Crucially, **MIDI works when the browser is in the background or minimised**, unlike keyboard and mouse keyers which require the app to be in focus. This makes MIDI the most practical interface for on-air use where you may need to switch between applications while operating.

The [`arduino/`](arduino/) folder contains ready-made sketches for both board variants, with wiring diagrams for straight keys, iambic paddles, and optocoupler output circuits. See the [Arduino README](arduino/README.md) for build details.

### Serial Port (DTR/RTS)

A USB-serial adapter can key your transmitter via DTR/RTS line toggling (Web Serial API — Chrome/Edge only). This provides reliable keying **output**, but serial port access requires the app tab to be in focus for initial connection, and the protocol is inherently output-only — there is no event-driven input path, so it cannot replace MIDI for paddle input.

### WinKeyer

For stations already using a K1EL WinKeyer (WK2/WK3/WKUSB), the app can forward decoded text to the WinKeyer over its serial port. The WinKeyer then generates hardware-precision CW keying independently.

### Keyboard, Mouse and Touch Keyers

The built-in keyboard, mouse, and touch keyers are convenient for practice and portable use — no extra hardware required. They support all five keyer modes (straight, Iambic A/B, Ultimatic, Single Lever) with full dit/dah memory. The main limitation is that **the browser tab must be in focus** to receive keyboard and mouse events, so these keyers are not suitable for background operation.

### Sound Card (Experimental)

The sound card can serve double duty: an **optocoupler output** (DC or AC mode) keys the transmitter via the headphone jack, while a **microphone input** with ultrasonic pilot-tone detection reads a physical key's closures. Sound-card CW tone decoding of received audio works well and is the primary decode path for most setups. The keying input side (pilot-tone detection) is experimental and sensitive to audio hardware latency and noise, so MIDI remains the more robust choice for key input.

## Progressive Web App

Morse Code Studio is a fully installable Progressive Web App (PWA). When served over HTTPS, browsers will offer an "Install" prompt so you can run it like a native app — on desktop (Chrome, Edge) and mobile (Android Chrome, iOS Safari "Add to Home Screen"). Once installed, the Angular service worker caches the app shell and assets for offline access.

## Getting Started

1. Open the app in **Chrome** or **Edge** (required for full feature support including device selection and serial ports).
2. Click **Start Audio** — grant microphone permission when prompted.
3. Expand **Settings** to configure your input/output devices, keyer bindings, and WPM.
4. Click **Save Settings** — your configuration is saved per device profile and persists across sessions.
5. Click the **Help** button from top right kebab menu for detailed Help documentation covering every feature, wiring diagrams, and real-world use-case examples.

## Development

```bash
npm install
ng serve
```

Navigate to `http://localhost:4200/`. The app reloads automatically on source changes.

## Browser Compatibility

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome  | Yes | Full support including Web Serial API |
| Edge    | Yes | Full support including Web Serial API |
| Firefox | Partial | No Web Serial API — serial keying unavailable |
| Safari  | Partial | No Web Serial API — serial keying unavailable |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit issues, feature requests, and pull requests.

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md).

## License

GPL-3.0 — see [LICENSE](LICENSE) for details.

© 2026 5B4AON — Mike
