<h1><img src="public/favicon.svg" alt="" width="36" style="vertical-align: middle;">&nbsp; Morse Code Studio</h1>

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](LICENSE)
[![Live App](https://img.shields.io/badge/Live_App-morse--code--studio.web.app-green)](https://morse-code-studio.web.app/)
[![Changelog](https://img.shields.io/badge/Changelog-CHANGELOG.md-orange)](CHANGELOG.md)

A browser-based Morse code encoder, decoder and keyer built with Angular 19. Runs entirely in the browser — no installation, no backend. Provides real-time CW encoding and decoding with sub-millisecond timing precision, suitable for on-air operating at 5–50+ WPM.

Connect a physical key or paddle, and decoded Morse code appears instantly on a fullscreen display with customisable letter size and colours — ideal for live demonstrations, training sessions, and events promoting interest in Morse code.

## Features

**Decode** — Decodes incoming Morse code in real time from a radio receiver's audio via CW tone detection. Dual RX/TX calibration pools auto-calibrate independently so your sending speed and the other station's speed never interfere with each other.

**Encode** — Converts typed text into perfectly timed Morse code audio. Supports "Send on Enter" (compose then send) and "Live" (send as you type) modes.

**Key** — Five keyer modes: straight key, Iambic A, Iambic B, Ultimatic, and Single Lever, with full dit/dah memory and per-keyer reverse paddles. Input from an Arduino MIDI paddle interface (multiple mappings with independent settings), USB-serial adapter (multiple mappings with independent ports, pins, and polling — DSR/CTS/DCD/RI via Web Serial API), computer keyboard (multiple mappings with per-mapping paddle mode), mouse, or touchscreen. MIDI, serial, and keyboard input mappings support optional **Name** and **Colour** per mapping for multi-user conversation views. Experimental: physical key input via microphone with ultrasonic pilot-tone detection.

**Key Your Radio** — Drives your transmitter's keying line through multiple output methods: Arduino MIDI optocoupler (multiple mappings with per-mapping forward selectors), sound card optocoupler (DC or AC mode), USB-serial adapter (multiple mappings with per-mapping DTR/RTS pin, invert, and forward selectors via Web Serial API), or WinKeyer.

**Online Relay** — Relay Morse characters between app instances in real time over the internet via Firebase Realtime Database. Each character carries the sender's WPM and optional colour so the receiving station plays it back at the original rhythm. Channels use a name + secret pair for access control, with callsign-prefixed lines in the fullscreen conversation view. Input-specific names and colours are forwarded by default, with optional overrides on both the sending and receiving side.

## Connecting Your Key and Radio

The app supports several hardware interfaces for physical key input and transmitter keying output. Each has different trade-offs in responsiveness, background operation, and browser support.

### Arduino MIDI (Recommended)

The **preferred interface** is a simple Arduino-based USB MIDI adapter. An Arduino Pro Micro (ATmega32U4 or nRF52840) enumerates as a standard USB MIDI device — no drivers needed — and provides both **paddle/key input** and **optocoupler keying output** over a single USB connection. The v1.1.0 sketches support **16 configurable pins** (10 inputs and 6 outputs by default) across two MIDI channels. The Web MIDI API delivers input events asynchronously (no polling), so timing is crisp and responsive even at high WPM. Crucially, **MIDI works when the browser is in the background or minimised**, unlike keyboard and mouse keyers which require the app to be in focus. This makes MIDI the most practical interface for on-air use where you may need to switch between applications while operating.

The [`arduino/`](arduino/) folder contains ready-made sketches for both board variants, with wiring diagrams for straight keys, iambic paddles, and optocoupler output circuits. See the [Arduino README](arduino/README.md) for build details.

Multiple MIDI devices can be used simultaneously — each MIDI Input and MIDI Output mapping is independently configurable with its own device, channel, notes, and routing. MIDI Input mappings also support optional **Name** and **Colour** fields, enabling multi-user conversation views where each operator's decoded text appears on separate colour-coded lines in the fullscreen display.

### Keyboard, Mouse and Touch

The built-in keyboard, mouse, and touch keyers require no extra hardware — convenient for practice and portable use. All five keyer modes are supported. The keyboard keyer supports **multiple independent mappings**, each with its own mode (straight key or paddle), key bindings, paddle mode, decoder source (RX/TX), reverse paddles toggle, and optional **Name** and **Colour** for multi-user conversation views. The mouse and touch keyers also support optional **Name** and **Colour**. The main limitation is that **the browser tab must be in focus** to receive these events, so they are not suitable for background operation.

### Serial Port (Web Serial API)

A USB-serial adapter provides **both input and output** via the Web Serial API (Chrome/Edge only). Serial adapters are significantly cheaper than an Arduino MIDI interface (often under $2), but come with trade-offs. Like MIDI, **serial port access works when the browser is in the background**, making it suitable for on-air use.

- **Output (DTR/RTS)** — keys your transmitter by toggling DTR or RTS. Multiple output mappings are supported, each with its own port, pin (DTR or RTS), invert setting, and forward selector (TX, RX, or both). Reliable, sub-millisecond switching.
- **Input (DSR/CTS/DCD/RI)** — reads straight key or paddle closures from the adapter's input status pins via polling. Multiple input mappings are supported, each with its own port, pin assignments, poll interval, debounce, and decoder source. Supports all five keyer modes with an independent iambic keyer per mapping. Serial input mappings also support optional **Name** and **Colour** for multi-user conversation views.

When input and output are configured on the same port, the input service piggybacks on the output's open connection — no second port handle needed. Automatic mute suppression and decoder output routing prevent feedback when both are active simultaneously.

Common adapters (FTDI FT232R, CH340, CP2102, PL2303) are supported. Works with any adapter that exposes standard modem-status pins.

**Limitations compared to MIDI:**

- **Desktop only** — the Web Serial API is not available on Android or iOS. Chrome on Android does not enumerate USB-serial adapters even with USB OTG. If you need mobile support, use the Arduino MIDI interface instead.
- **Polling latency** — serial input relies on polling `getSignals()` rather than asynchronous events. With the default 10 ms poll interval and 5 ms debounce, expect up to ~15 ms of input latency. This is fine for most operators, but fast CW operators (above ~40 WPM) may notice a perceivable lag compared to MIDI's event-driven input which has near-zero latency. Reducing the poll interval to 5 ms and debounce to 2 ms improves responsiveness but increases CPU usage.

### WinKeyer

For stations using a K1EL WinKeyer (WK2/WK3/WKUSB), the app can forward decoded or encoded text to the WinKeyer over its serial port. The WinKeyer generates hardware-precision CW keying independently — useful for relay, practice, or driving an external transmitter. The connection is established automatically on page load and the app attempts to reconnect when a USB device is unplugged and reconnected. Whether the browser remembers a previously granted port after re-plug depends on the device and browser — devices with a unique USB serial number (e.g. genuine FTDI adapters) are reliably matched, while some budget chipsets may require re-granting the port.

### Sound Card (Experimental)

The sound card can serve double duty: an **optocoupler output** (DC or AC mode) keys the transmitter via the headphone jack, while **microphone input** with ultrasonic pilot-tone detection reads a physical key's closures. CW tone decoding of received audio works well and is the primary decode path for most setups; both the CW tone detector and the pilot-tone key input support optional **Name** and **Colour** for multi-user conversation views. The keying input side (pilot-tone detection) is experimental and sensitive to audio hardware latency, so MIDI remains the more robust choice for key input.

## Signal Routing

Every output (optocoupler, serial port, WinKeyer, sidetone, vibration, Firebase RTDB, MIDI) has an independent **forward / active-on** selector controlling whether it fires on TX signals, RX signals, or both. Each input (Mic, CW Tone, Keyboard, Mouse, Touch, Serial, MIDI) can be assigned to the RX or TX decoder pool, controlling both calibration and colour tagging in the fullscreen conversation view. Automatic loop detection suppresses output routing when a feedback loop is detected between outputs and inputs.

## Additional Features

- **Text Blurring** — Hides decoded and/or encoded text behind a blur filter for copy-receiving practice. Configurable for RX only, TX only, or both. Press and hold the eye button to momentarily reveal the answer.
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


## AI-Generation Notice
This project includes content that was **fully or partially generated with AI tools** (GitHub Copilot). 

Some files may have been **edited, curated, or integrated by humans**, while others may be largely machine-generated.
The project includes `.github/copilot-instructions.md` as an aid to others who may use GitHub Copilot on the codebase.

Development followed an **AI-assisted, human-led** methodology where human creativity directed the architecture, system design, and hardware integration, while GitHub Copilot accelerated implementation and troubleshooting.  
This approach compressed the development lifecycle from months into approximately 100 hours, enabling rapid iteration and extensive cross-device testing without sacrificing robust architecture or maintainability.  
By shifting focus from boilerplate coding to high-level engineering — such as complex signals processing and loop detection — AI assistance made exploring new concepts faster, testing easier, and continuous refinement almost effortless *(31 iterations in PRE-RELEASE-CHANGELOG)*.


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
To maximize freedom for downstream users, and because portions of AI-generated material may not be eligible for copyright protection in some jurisdictions, we dedicate this project to the **public domain** using **CC0 1.0 Universal**. 

If any rights do exist, we **waive them** to the fullest extent permitted by law.

<a href="https://github.com/5B4AON/mcs">Morse Code Studio</a> is marked <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a><img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/zero.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;">
 — see [LICENSE](LICENSE) for details.  


### Third‑Party Licenses (Angular & npm Dependencies)

This project uses the Angular framework and various npm packages, many of which are licensed under the **MIT License**, which requires preserving their original copyright and license notices in distributed builds. 

During a production build, Angular extracts all dependency license texts into:
`dist/3rdpartylicenses.txt`

This is enabled by setting `"extractLicenses": true` in `angular.json`, which is the recommended way to ensure all license obligations are met.


