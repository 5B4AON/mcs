# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-03-18

### Added

- **Copy Practice Mode** — new encoder mode (`Copy Practice`) for self-study. The
  encoder generates a random sequence, plays it as Morse audio, and the user
  types what they hear. After the round, an LCS-based fuzzy alignment scores
  each character as correct, incorrect, or missed and displays per-character
  colour-coded feedback with an accuracy percentage.
- **Three Content Modes** — random characters (configurable pool of letters,
  digits, and/or punctuation), common words (filterable by length: 3, 4, 5
  letters), and realistic callsigns (built from an international prefix
  database).
- **Three Feedback Modes** — Listen Only (hear first, then type), Blurred
  Reveal (reference text is shown blurred until the round finishes), and
  Type-Along (type in real time as the Morse plays).
- **Pipeline Selector** — Local (audio-only playback, skipping serial, MIDI,
  RTDB, and vibration outputs) or Full (characters flow through all enabled
  outputs just like normal encoder mode).
- **Practice Settings Card** — new card under Settings → Other with controls
  for content mode, group count (1–10), character group size (1–5), character
  pool toggles, word length filter, feedback mode, pipeline, source
  assignment, and optional display name/colour.
- **Fullscreen Practice UI** — the fullscreen encoder view renders a dedicated
  practice panel with reference text, user input field, Start / Pause /
  Resume / Next Round controls, and colour-coded per-character feedback.
- **Practice Service** (`practice.service.ts`) — singleton service managing
  sequence generation, playback state machine, character push from encoder,
  and user-input scoring.
- **Practice Data Files** — `data/practice-words.ts` (common English words)
  and `data/callsign-prefixes.ts` (international callsign prefix database)
  provide content for the words and callsigns practice modes.

### Documentation

- **Help §3.5 — Copy Practice** — New section in the Encoder chapter
  explaining all content modes, feedback modes, pipeline options, settings,
  and fullscreen UI controls with beginner and contest practice examples.
- **README** — Updated feature list to mention Copy Practice mode.

## [1.7.0] - 2026-03-16

### Added

- **Farnsworth Timing** — New setting under Settings → Other that stretches
  the gaps between characters and words while keeping element durations
  (dit/dah) at full speed. Named after Donald R. "Russ" Farnsworth (W6TTB),
  this proven learning technique lowers the effective WPM without slowing
  individual characters.
- **Wordsworth Mode** — Optional variation that stretches only the gaps
  between words, keeping inter-character spacing at the normal character
  speed. Useful for operators who recognise characters instantly but need
  extra time to process whole words.
- **Two Input Modes** — Choose between *Effective WPM* (set a target overall
  speed from 5 WPM up to the encoder WPM) or *Gap Multiplier* (multiply gap
  durations by 1.00× to 10.00×).
- **Applies To** selector — TX Only, RX Only, or Both. TX affects the
  encoder and all keyed outputs (sidetone, serial, MIDI, vibration). RX
  affects local playback of received characters (e.g. from Firebase RTDB).
- **Affected Outputs** — Sidetone, optocoupler, serial DTR/RTS, MIDI note
  output, and vibration. WinKeyer is excluded (hardware-timed).

### Documentation

- **Help §8.5 — Farnsworth / Wordsworth Timing** — New section explaining
  both timing techniques, all controls, affected outputs, and a beginner
  practice example. Subsequent sections renumbered (§8.5–8.7 → §8.6–8.8).

## [1.6.4] - 2026-03-16

### Changed

- **MIDI Output Same-Note Warning** — The MIDI Output edit modal no longer
  blocks saving when dit and dah paddle notes are set to the same value. The
  hard error has been replaced with a non-blocking warning. This allows
  paddle mode with identical notes to emulate a straight-key output through
  the character-based queue — useful for speed re-encoding via the WPM
  override option.

### Fixed

- **MIDI Output Queue Interruption** — Fixed character playback at a slower
  WPM being cut short when the real-time `keyUp()` path released notes held
  by the character queue. The real-time straight-key path (keyDown/keyUp) and
  the character-based queue now track their active notes independently, so
  releasing a physical key no longer aborts a queue element mid-playback.

### Documentation

- **Help §7.4 — Speed Re-Encoding** — New "Speed Re-Encoding (WPM Override)"
  section in the MIDI Output chapter. Describes using paddle mode with same
  or different notes combined with "Override input WPM with local encoder
  WPM" to re-encode incoming morse at a different speed — e.g. keying at
  25 WPM while the MIDI output replays at 12 WPM for slower listeners.

## [1.6.3] - 2026-03-15

### Fixed

- **MIDI Detect When Disabled** — The "Detect" button now acquires MIDI
  access automatically, so it works even when the MIDI Input card is off.
- **MIDI First Note Lost** — Fixed the first MIDI note being silently dropped
  after adding a new mapping, caused by a race between async port opening and
  handler attachment.
- **MIDI Detect With No Mappings** — Detection now works when no MIDI input
  mappings exist yet. Previously all port listeners were removed when the
  mapping list was empty.
- **MIDI Echo Suppression Too Broad** — The per-mapping echo gate exited the
  entire handler instead of skipping to the next mapping, blocking all
  mappings when the first one was muted.
- **Old Profiles Crash on Relay Fields** — Profiles saved before relay
  support could crash on missing `relayInputIndices`. Added migration
  backfill and defensive checks.

## [1.6.2] - 2026-03-15

### Fixed

- **Text Blur Scales with Font Size** — The fullscreen text-blur training
  mode now uses a font-relative blur radius (`0.2em`) instead of a fixed
  `5px`, so blurred text remains illegible even at the maximum 184 px font
  size. A `brightness(1.5)` filter is also applied so the blurred text glows
  rather than dissolving into the dark background.
- **Input Card Name Colour** — Serial Input and MIDI Input card headers now
  show the mapping name in the correct RX/TX foreground colour from the
  fullscreen modal display settings (green for RX, amber for TX by default).
  A per-mapping custom colour still takes priority when set.
- **Fullscreen Auto-Scroll** — The fullscreen decoder and encoder views now
  always scroll to the bottom when new characters arrive, fixing an issue
  where auto-scroll would stop permanently after smooth-scroll animation lag
  caused the distance-from-bottom threshold to be exceeded.
- **MIDI Auto-Detect Channel** — The "Detect" button in the MIDI Input edit
  modal now always updates the channel dropdown to the detected MIDI channel,
  even when a specific channel was already selected. The note hint text below
  each note field now includes the channel as a prefix (e.g. "Ch 3 / C4 (60)").

## [1.6.1] - 2026-03-15

### Added

- **Per-Mapping Input Relay** — MIDI and Serial output mappings now have a
  "Relay from…" multi-select in their edit modal, letting you choose exactly
  which input mappings are forwarded through each output. Only input mappings
  whose source matches the output's forward direction (RX/TX) are shown,
  giving fine-grained control to prevent feedback loops while still allowing
  deliberate relay between separate hardware paths.
- **RTDB Input Relay** — New "Allow input relay" checkbox on the RTDB Output
  card. When enabled, characters received from the RTDB channel are relayed
  back out (useful for multi-site bridging). Automatically disabled when the
  RTDB input and output share the same channel and secret to prevent echo.
- **Suppress Other Inputs** — New per-mapping checkbox (MIDI Output, Serial
  Output, and RTDB Output) that appears when relay sources are selected.
  When enabled, the output only forwards signals from the explicitly chosen
  relay sources — all other input paths are suppressed.

### Fixed

- **MIDI/Serial Feedback Loop Prevention** — The three anti-echo layers
  (input-service muting, decoder output gating, and forwarding-effect
  filtering) now operate per-mapping instead of globally. This fixes feedback
  loops that occurred when relay was enabled globally but multiple mappings
  shared the same physical bus.
- **Relay Index Cleanup** — Deleting a MIDI or Serial input mapping now
  correctly removes and re-indexes relay references in the corresponding
  output mappings, preventing stale or shifted indices.
- **Loop Detection False Positives on Relay** — Characters from
  relay-allowed input paths (MIDI or Serial inputs configured in an output
  mapping's "Relay from…" list) are now excluded from the loop-detection
  input buffer, preventing false-positive loop suppression when the
  repeated sequence is intentional relay traffic.

### Changed

- **Mapping Conflict Detection Downgraded to Warning** — MIDI Output and
  Serial Output edit modals no longer block saving when two mappings share
  the same note/device/channel (MIDI) or port/pin (Serial). The check is now
  a non-blocking yellow warning, since overlapping mappings are valid when
  they fire under different conditions (e.g. different forward directions or
  relay sources with "Suppress other inputs" enabled).

## [1.6.0] - 2026-03-14

### Added

- **Keyboard Encoder Input Settings** — The keyboard encoder (typed text) is
  now a configurable input source in Settings → Inputs. Assign it to RX or TX
  (default: TX), and optionally tag it with a display name and colour for
  conversation views and Firebase RTDB forwarding. The encoder source setting
  controls which output forward filters (serial, opto, sidetone, vibration,
  MIDI, WinKeyer, RTDB) carry the signal. Other services that use encoder
  functionality (MIDI out, serial out, WinKeyer, RTDB input) remain
  independent of encoder name/colour settings.
- **Straight-Key Sprite as Input** — The straight-key sprite button has been
  moved from Settings → Other to Settings → Inputs and now has its own
  independent RX/TX source, display name, and colour settings — no longer
  inheriting from the touch keyer. Positioned after Touch Keyer in the
  inputs list.
- **Sprite Encoder Animation Trigger** — New "Keyboard encoder" checkbox in
  the sprite animation sources. When enabled, the sprite visually animates
  (depresses) for each dit/dah the encoder plays back. Trigger list reordered
  to: Keyboard key, Keyboard encoder, Mouse key, MIDI key, Serial key, Mic
  key (touch keyer removed since sprite is not visible in fullscreen).

### Changed

- **Swipe Gesture Guard** — Tab-switching swipe gestures in the settings
  modal are now disabled on non-touch devices, preventing accidental tab
  changes from trackpad horizontal scrolling.
- **RTDB Output Card** — Removed the note stating that the encoder has no
  input-specific tagging, since the encoder now supports name and colour.
- **Main Screen Reveal Button** — The blur-reveal eye button on the main
  screen now matches the fullscreen modal's eye button in size (44×44px) and
  icon dimensions (24×24 SVG) for consistent appearance on mobile.
- **Fullscreen Encoder Keyboard Button** — The virtual keyboard toggle
  button in the fullscreen encoder view has been resized from 52×52px to
  44×44px to match the reveal button, ensuring consistent button sizing.
- **Fullscreen Expand Button** — Replaced the Unicode ⛶ character (which
  rendered as a dot on many mobile fonts) with a proper SVG maximize icon
  for reliable cross-platform display.

## [1.5.0] - 2026-03-14

### Added

- **Text Blurring (Training Mode)** — New setting under Settings → Other that
  blurs decoded text so you can practice reading Morse by ear without
  accidentally seeing the answer. Configurable to blur RX only, TX only, or
  both directions. A floating eye button in the text area acts as a momentary
  reveal switch — press and hold to unblur with a 250 ms animated transition.
  Works in both the main screen parchment view and fullscreen decoder/encoder
  views. Name tags remain visible; only the text content is blurred. Text
  colour is preserved through the blur effect.
- **Inline Port Granting** — All serial port dropdowns (WinKeyer, Serial Input
  edit modal, Serial Output edit modal) now include a `+ Add serial port…`
  option directly in the select box. Selecting it opens the browser's port
  permission dialog without needing to navigate to a different service's
  settings first.

### Changed

- **WinKeyer Port Selection** — Removed the separate "Add Serial Port" and
  "Refresh" buttons. Port list auto-refreshes when the card is expanded.
  Port granting is now inline via the dropdown's `+ Add serial port…` option.
- **WinKeyer Auto-Connect** — WinKeyer now auto-connects on page load when
  previously enabled (matching the serial output service's behaviour) and
  retries with increasing delays (0, 500, 1500, 3000 ms) to handle late
  USB enumeration.
- **WinKeyer Reconnect on Replug** — Fixed reconnection when unplugging and
  replugging the USB cable. The service now properly closes stale connections
  before reconnecting and uses the same retry-with-backoff strategy as the
  serial output service.
- **Serial Reconnect VID/PID Matching** — WinKeyer and serial output
  services now remember each port's USB VID/PID on connection. When a port
  reappears at a different index after re-plug, the app finds it by VID/PID
  and updates the stored index automatically. Note: whether the browser
  remembers a previously granted port after disconnect depends on the
  device's USB descriptor; some budget USB-serial chipsets without unique
  serial numbers may require re-granting the port via the
  `+ Add serial port…` dropdown option.

## [1.4.0] - 2026-03-14

### Added

- **Input Name & Colour Tagging** — Mouse Keyer, Touch Keyer, CW Tone
  Detector, and Straight Key via Mic now support optional **Name** and
  **Colour** fields, matching the existing pattern in Keyboard, MIDI, and
  Serial inputs. When a name is set, switching between inputs triggers a
  line break in conversation views. Colour overrides the default RX/TX
  colour in fullscreen views.
- **Firebase RTDB Output Colour** — RTDB output can now optionally send a
  colour (`col` parameter) alongside each character. Remote listeners
  display this colour in their fullscreen views.
- **RTDB Name & Colour Override Checkboxes** — Two new checkboxes on the
  RTDB Output card control whether the RTDB output name and colour always
  override input-specific tags, or serve as fallbacks when no input-specific
  tag is defined.
- **Firebase RTDB Input Name & Colour Override** — RTDB input now supports
  optional override fields for both name and colour. When set, they replace
  the incoming sender's tag; when empty, the remote sender's name/colour is
  preserved.
- **RTDB Echo Suppression for Input-Specific Names** — The echo filter now
  tracks all names sent (including input-specific names), preventing echoes
  when multiple named inputs are forwarded through the same RTDB channel.

### Changed

- **RTDB Mandatory Fields** — Channel Name, Channel Secret, and Name are now
  mandatory for RTDB Output. Channel Name and Channel Secret are mandatory
  for RTDB Input. Fields show a red asterisk and red label/border when
  empty. Enabling the toggle is blocked with an error message until all
  required fields are filled. Clearing a required field while enabled
  auto-disables the service.

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
