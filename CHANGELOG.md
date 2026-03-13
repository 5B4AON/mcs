# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-03-14

### Added

- **Serial Input Multi-Mapping** — Serial input now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI input
  pattern. Each mapping has its own serial port, mode (straight key or
  paddle), pin assignments, poll interval, debounce, decoder source (RX/TX),
  invert, reverse paddles, and paddle mode (Iambic B/A, Ultimatic, Single
  Lever). Add, edit, or remove mappings freely via the new edit modal.
  Each mapping runs its own independent iambic keyer, completely independent
  of the keyboard/mouse/touch keyer. Default mapping: straight key on DSR,
  paddle on CTS/DCD.
- **Serial Input Name & Colour** — Each serial input mapping can now have an
  optional **Name** (e.g. a callsign) and **Colour**, enabling multi-user
  conversation views where each operator's decoded text appears on separate
  colour-coded lines in the fullscreen display — same as MIDI and keyboard
  input.
- **Serial Output Multi-Mapping** — Serial output now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI output
  pattern. Each mapping has its own serial port, output pin (DTR or RTS),
  invert setting, and **per-mapping forward selector** (TX only, RX only, or
  Both). Multiple mappings can target different ports or different pins on
  the same port. Add, edit, or remove mappings via the new edit modal.
- **Serial Input Edit Modal** — New dedicated edit modal for configuring
  serial input mappings, with port selection, mode/pin pickers, live signal
  LED indicators, polling/debounce settings, name/colour fields, and
  estimated maximum WPM display.
- **Serial Output Edit Modal** — New dedicated edit modal for configuring
  serial output mappings, with port selection, pin picker, invert toggle,
  forward selector, and test button.
- **Per-Entry Connectivity Icons (Serial & MIDI)** — Each mapping row in the
  Serial Input, Serial Output, MIDI Input, and MIDI Output cards now shows a
  per-entry connectivity icon (connected/disconnected) matching the card
  header icon style. This replaces the text-based "✔ Connected" / "✖ Not
  connected" status that was previously shown at the bottom of MIDI cards.
- **Silent Port-Already-Open Handling** — When a serial port is already open
  (e.g. from a previous connection), both Serial Input and Serial Output now
  silently adopt the port instead of showing an error. Serial Input checks
  for output port sharing (piggyback) or adopts the port as owned. Serial
  Output adopts the port, registers a disconnect handler, and adds it to
  the open ports map.

### Changed

- **Serial Output Architecture** — Replaced scalar serial output settings
  (`serialPortIndex`, `serialPin`, `serialInvert`, `serialForward`) with a
  `serialOutputMappings` array of `SerialOutputMapping` objects. The service
  now manages multiple open ports via an `openPorts` signal
  (Map&lt;number,&nbsp;PortState&gt;) with per-mapping key state and holdoff
  timers.
- **Serial Input Architecture** — Replaced scalar serial input settings with
  a `serialInputMappings` array of `SerialInputMapping` objects. The service
  manages multiple ports with per-mapping independent iambic keyers and
  signal polling.
- **Serial Port Sharing** — Serial Input now piggybacks on Serial Output via
  `SerialKeyOutputService.getOpenPort(portIndex)` (was `openPort()`), and
  watches the `openPorts()` signal for reactivity. Deferral logic checks
  `serialOutputMappings.some(m => m.enabled && m.portIndex === portIndex)`.
- **Serial Output Holdoff** — The 30 ms `isSending` holdoff is now tracked
  per mapping, so mappings on different ports operate independently.
- **Mouse Keyer Paddle Mode** — Added `mousePaddleMode` and
  `touchPaddleMode` settings with a UI selector.

### Fixed

- **Serial Input Name/Colour Not Showing in Fullscreen** — Fixed all six
  `decoder.onKeyDown`/`onKeyUp` call sites in `SerialKeyInputService` to
  pass `name` and `color` from the mapping, so named serial input mappings
  now appear correctly in the fullscreen conversation views.

---

## [1.2.0] - 2026-03-13

### Added

- **Keyboard Keyer Multi-Mapping** — The keyboard keyer now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI input
  pattern. Each mapping has its own mode (straight key or paddle), key
  bindings, decoder source (RX/TX), reverse paddles toggle, paddle mode
  (Iambic B/A, Ultimatic, Single Lever), and optional Name and Colour.
  Add, edit, duplicate, reorder, or remove mappings freely. Default mappings:
  Space as straight key (TX), `[`/`]` as Iambic B paddles (TX), and
  Left Ctrl/Right Ctrl as Iambic B paddles (TX).
- **Per-Mapping Paddle Mode (Keyboard)** — Each keyboard paddle mapping now
  carries its own paddle mode, replacing the previous shared setting. This
  allows different keyer behaviours per mapping (e.g. one mapping in Iambic B
  and another in Ultimatic).
- **Keyboard Keyer Name & Colour** — Each keyboard mapping can now have an
  optional Name and Colour, enabling multi-user conversation views where each
  operator's decoded text appears on separate colour-coded lines in the
  fullscreen display — same as MIDI input.
- **Per-Mapping Keyer Loops (Keyboard & MIDI)** — Each keyboard and MIDI
  paddle mapping now runs its own independent iambic keyer engine with
  separate state, timing, and decoder pipeline. Previously, all keyboard
  paddle mappings shared a single decoder pipeline, which could cause
  output ref-count leaks and stuck audio when two mappings overlapped.
- **Modifier Key Combo Detection** — When a mapped modifier key (Ctrl, Alt,
  Shift, Meta) is involved in a simultaneous multi-key press, the browser may
  swallow `keyup` events for one of the keys. The keyer now detects these
  stuck states by cross-checking keyboard event modifier flags on every
  key release, and automatically releases any stranded paddle or straight-key
  state — preventing the continuous-tone bug that occurred when pressing e.g.
  `[` and Ctrl simultaneously.

### Changed

- **Keyboard Keyer Settings UI** — The single key-binding buttons have been
  replaced by a mapping table with enable checkbox, name, mode, key summary,
  source badge, reverse indicator, and paddle mode label. An edit modal
  (matching MIDI input's pattern) provides the full configuration for each
  mapping.
- **Independent Decoder Pipelines** — Keyboard paddle mappings now use indexed
  input paths (`keyboardPaddle:0`, `keyboardPaddle:1`, …) and MIDI mappings
  use indexed paths (`midiPaddle:0`, `midiStraightKey:0`, …) so each mapping
  gets its own independent decoder pipeline. This prevents ref-count leaks
  in shared audio/serial/vibration/MIDI output when multiple mappings overlap.

### Fixed

- **Stuck Continuous Tone** — Fixed a bug where pressing keys from two
  different keyboard paddle mappings simultaneously (e.g. `[` and Right Ctrl)
  caused a permanent continuous tone that persisted even after all keys were
  released. Root cause: all keyboard paddle mappings shared a single decoder
  pipeline (`keyboardPaddle`), so overlapping `onKeyDown`/`onKeyUp` calls
  leaked the audio output ref count. Now each mapping has its own pipeline.
- **Modifier Key `keyup` Not Firing** — Added active detection of stuck
  modifier keys via `KeyboardEvent` flag cross-checks and a `window.blur`
  handler, so lost `keyup` events for Ctrl, Alt, Shift, and Meta no longer
  leave paddle or straight-key state permanently stuck.

---

## [1.1.0] - 2026-03-11

### Added — Application

- **MIDI Input Multi-Mapping** — MIDI input now supports multiple independent
  mappings in a table-based interface. Each mapping has its own device,
  channel, mode (straight key or paddle), note assignment, decoder source
  (RX/TX), and reverse-paddles toggle. Add, edit, duplicate, reorder, or
  remove mappings freely. The previous single-mapping MIDI input has been
  replaced by a configurable mapping table with an edit modal for each row.
  Default mappings: straight key on note C4 (60) and paddle on D4/E4
  (62/64), both on channel 1 (omni).
- **MIDI Input Name & Colour** — Each MIDI input mapping can now have an
  optional **Name** (e.g. a callsign) and **Colour** (CSS colour string).
  When a name is set, it triggers automatic line breaks in the fullscreen
  conversation views — the name appears as a prefix (like Firebase RTDB
  user names), and the text is rendered in the chosen colour instead of the
  default RX/TX colour. This enables **multi-user conversations** where
  several operators key into the same app instance via separate MIDI
  devices, and each operator's text appears on its own colour-coded line
  in the fullscreen decoder/encoder views.
- **MIDI Output Multi-Mapping** — MIDI output now supports multiple
  independent mappings in the same table + edit modal pattern as MIDI
  input. Each mapping has its own device, channel, mode (straight key or
  paddle), note assignment, and **per-mapping forward selector** (TX only,
  RX only, or Both). Default mappings: straight key on G♯5 (80) and
  paddle on A♯5/C6 (82/84), both on channel 1, forward TX.
- **MIDI Output Paddle Mode for Local Keyers** — Keyboard, mouse, and
  touch keyer inputs now correctly drive MIDI output paddle-mode mappings
  via the character-based playback path. Previously, local keyer inputs
  only fired straight-key MIDI output notes in real time; paddle-mode
  mappings were skipped. The fix passes a `paddleOnly` flag through the
  forwarding chain so that paddle mappings receive decoded characters
  while straight-key mappings continue to fire in real time without
  double-firing.
- **MIDI Device Enumeration When Disabled** — Both MIDI Input and MIDI
  Output cards now enumerate available MIDI devices for the device
  dropdown even when the respective feature is disabled, making
  configuration easier before enabling.

### Changed — Application

- **MIDI Output Notes Updated** — Default MIDI output note assignments have
  changed from F♯4/G♯4/A♯4 (66/68/70) to G♯5/A♯5/C6 (80/82/84) to match
  the updated Arduino sketch pin assignments. Existing saved profiles are
  not affected — only new profiles or factory resets use the new defaults.
- **Firebase RTDB Field Rename** — The `userName` field has been renamed to
  `name` and `rtdbOutputUserName` to `rtdbOutputName` throughout the
  codebase and Firebase protocol for consistency.
- **Settings Tab Reorder** — The Inputs tab now appears before Outputs in the
  settings modal (previously Outputs was first).
- **Audio Output Card Renamed** — "Audio Output" renamed to "Audio Key
  Output" for clarity.

### Added — Arduino Sketches (v1.1.0)

- **16 Configurable Pins** — Both the ATmega32U4 and nRF52840 sketches now
  expose all 16 usable GPIO pins as individually configurable slots, each
  with a direction (input/output), MIDI channel, and MIDI note. The previous
  3-input / 3-output fixed assignment has been replaced by a fully
  table-driven configuration at the top of each sketch.
- **Dual MIDI Channels** — Pins are split across MIDI channel 1 (pins 1–5
  and 11–13) and channel 2 (pins 6–10 and 14–16), allowing logical grouping
  of inputs and outputs.
- **Configurable Debounce** — A `DEBOUNCE_MS` constant (default 5 ms)
  replaces the hardcoded debounce, allowing easy tuning for different
  switch types.
- **Configurable Velocity** — A `MIDI_VELOCITY` constant (default 127)
  is now exposed for easy adjustment.

### Changed — Arduino Sketches (v1.1.0)

- **Output Pin Numbers Changed** — Output pins have moved from
  **5, 6, 7** (GPIO) to **14, 15, A0** (ATmega32U4) / **P1.11, P1.13,
  P0.02** (nRF52840). The physical pin positions on the board are now
  pins 11–16 instead of pins 4–6.
- **Output MIDI Notes Changed** — Output notes have changed from
  F♯4/G♯4/A♯4 (66/68/70) to G♯5/A♯5/C6 (80/82/84) on channel 1, with
  three additional outputs on D6/E6/F♯6 (86/88/90) on channel 2.
- **Input MIDI Notes Changed** — Input notes have expanded from
  C4/D4/E4 (60/62/64) on channel 1 to ten inputs spanning
  C4–F♯5 (60–78) across channels 1 and 2.

### ⚠️ Arduino Sketch Compatibility

> **Breaking change for output wiring.** If you are upgrading from the
> v1.0.0 Arduino sketch, **input wiring on pins 2, 3, and 4 will continue
> to work** — these pins remain inputs with the same MIDI notes (60, 62,
> 64). However, **output wiring must be moved** from the old pins (5, 6, 7)
> to the new pins (14, 15, A0 on ATmega32U4 / the corresponding nRF52840
> GPIOs). The MIDI output notes have also changed from 66/68/70 to
> 80/82/84, so **MIDI Output mappings in Morse Code Studio must be
> updated** to match (new profiles already use the correct defaults).
>
> **Reprogramming the Arduino is required.** Upload the new v1.1.0 sketch,
> then rewire output connections to the new pin positions.

---

## [1.0.0] - 2026-03-08

First official public release of Morse Code Studio as an open-source project under the CC0-1.0 Universal license.

### Features

- **Real-Time CW Decoding** — Decodes incoming Morse code from audio via
  Goertzel-based tone detection with dual RX/TX calibration pools.
- **Text-to-Morse Encoding** — Converts typed text into precisely timed Morse
  audio with "Send on Enter" and "Live" input modes.
- **Five Keyer Modes** — Straight key, Iambic A, Iambic B, Ultimatic, and
  Single Lever with full dit/dah memory and reverse paddles.
- **Multiple Input Methods** — Arduino MIDI paddle, USB-serial adapter
  (DSR/CTS/DCD/RI), computer keyboard, mouse, and touchscreen.
- **Multiple Output Methods** — Arduino MIDI optocoupler, sound card
  optocoupler (DC/AC), USB-serial adapter (DTR/RTS), and WinKeyer.
- **Firebase RTDB Relay** — Real-time Morse relay between app instances over
  the internet with per-character WPM and callsign-prefixed conversation view.
- **Fullscreen Display** — Customisable decoded/encoded text display with
  adjustable letter size, colours, and RX/TX colour tagging.
- **Prosign Actions & Emoji Mappings** — Configurable prosign-triggered actions
  and Morse-to-emoji substitutions.
- **Progressive Web App** — Installable on desktop and mobile with offline
  caching via Angular service worker.
- **Haptic Vibration** — Vibrates in sync with the sidetone (Android).
- **Screen Wake Lock** — Prevents screen lock during operation.

For pre-release development history, see [PRE-RELEASE-CHANGELOG.md](PRE-RELEASE-CHANGELOG.md).
