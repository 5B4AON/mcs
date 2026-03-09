# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.0] - 2026-03-08

### Changed

- **Help — Introduction Rewrite** — section 1.1 now lists hardware interface
  options in priority order: Arduino MIDI (recommended, with reasoning),
  USB-serial (second choice, with trade-offs), keyboard/mouse/touch, and
  sound card (experimental). Aligns with README.md.
- **Help — Chapter 6 Reordered and Renamed** — chapter renamed from "Audio
  Inputs" to "Inputs". Sections reordered to reflect priority: §6.1 Decode
  from Audio Channel (primary decode path, was §6.2), §6.2 MIDI Input
  (recommended, was §6.3), §6.3 Serial Input (second choice, was §6.4),
  §6.4 Straight Key via Mic (experimental, was §6.1). All cross-references
  updated.
- **Help §6.1 — Renamed** — "Straight Key via Audio Channel (CW Tone)"
  renamed to "Decode from Audio Channel (CW Tone Detector)" to clarify this
  is a decode input, not a keying input.
- **Help §4.6 — Serial Straight Key** — the sprite button animation sources
  now include "Serial straight key".
- **Help §5.2 — Serial Input Source Assignment** — the per-input source table
  now includes Serial Input (straight key and paddle) rows, and the
  introductory text mentions Serial Input alongside Keyboard Keyer and MIDI
  Input.
- **Help §5.3 — Default Assignments** — updated reasoning to explain that
  hardware inputs (MIDI, serial, CW tone, pilot tone) default to RX because
  they typically carry Morse from another operator.
- **Serial Input Default Source → RX** — `serialStraightKeySource` and
  `serialPaddleSource` now default to `'rx'` (was `'tx'`), matching the
  reasoning that hardware inputs typically receive Morse from another operator,
  consistent with MIDI input defaults.

## [0.13.0] - 2026-03-08

### Added

- **Serial Input as First-Class Input Source** — serial key/paddle input via
  DSR/CTS/DCD/RI now routes through the decoder with `fromSerial: true`,
  enabling proper RX/TX pool assignment, colour tagging in the fullscreen view,
  and independent calibration — matching the treatment of other input sources.
- **Serial Output Auto-Reconnect** — Serial Output now automatically reconnects
  to a previously granted port on page refresh, matching the existing behaviour
  of Serial Input. Uses a one-shot `effect()` guard in the service constructor.
- **Port Auto-Select** — when refreshing or adding a serial port yields exactly
  one available port and none is selected, both the Serial Output and Serial
  Input cards now auto-select it.
- **Port Refresh on Card Expand** — expanding the Serial Output or Serial Input
  settings card automatically refreshes the available port list, so ports
  granted in the other card appear without a manual Refresh click.
- **Shared Port Race-Condition Guard** — when Serial Input and Output are
  configured on the same port, Serial Input now defers its connection until
  Serial Output has connected first, preventing a race where both services
  attempt to open the port simultaneously.

### Fixed

- **DTR/RTS Initial Pin State** — the `setSignals()` call that forces pins to
  their idle state is now issued immediately after `port.open()`, preventing
  FTDI/CH340 adapters from holding DTR/RTS HIGH and continuously keying an
  attached transmitter on connection.
- **FTDI Active-Low Pin Polarity** — corrected the `serialInvert` logic to
  account for FTDI/CH340/CP2102 active-low DTR# and RTS# outputs, where
  `setSignals({ dataTerminalReady: true })` drives the physical pin LOW and
  `false` drives it HIGH. Default behaviour (checkbox unchecked) now correctly
  idles the pin LOW and keys HIGH.
- **Serial Input `isSending` Muting** — Serial Output's `isSending` signal
  (with 30 ms holdoff) now properly suppresses Serial Input from processing
  key-down events while the output is active, preventing software feedback
  loops when both share the same adapter.

### Changed

- **Invert Output Checkbox** — simplified label to "Invert Output" with a hint
  explaining the default polarity (physical pin LOW when idle, HIGH when keyed).
- **Help Documentation — Serial Output** — the FTDI / CH340 Pin Behaviour
  section now explains that adapters default pins HIGH on connection and that
  the app reverses this to LOW. Includes a step-by-step connection procedure:
  connect adapter → enable output → attach external hardware, to avoid keying
  the transmitter during the brief HIGH glitch at `port.open()`.

## [0.12.0] - 2026-03-08

### Added

- **Standalone Straight-Key Sprite Button** — the on-screen straight-key sprite
  button is now always available by default when screen space permits, no longer
  requiring touch keyer to be enabled in straight-key mode. A new "Straight-Key
  Sprite" settings card in Settings → Other allows disabling the button and
  configuring animation associations with other input sources.
- **Sprite Animation from Other Keyers** — the sprite button can optionally
  animate (depress visually) when straight-key presses are detected from the
  keyboard, mouse, MIDI, or mic input sources. Each source can be independently
  toggled via checkboxes in the new settings card. All animation checkboxes
  default to unchecked.
- **Keyer Service `straightKeyEvent$` Observable** — a new RxJS Subject on
  `KeyerService` emits `{ down, inputPath }` events for every straight-key
  press/release, enabling external subscribers to react to keying activity
  per input source.

### Changed

- **Sprite Button Enabled by Default** — the sprite button is now enabled on
  all devices by default (rather than only on touch devices with straight mode
  selected), and persists through settings resets.
- **Settings Other Tab** — now contains 5 cards (was 4): Straight-Key Sprite,
  Wake Lock, Show Prosigns, Prosign Actions, and Emojis.

## [0.11.0] - 2026-03-07

### Added

- **`<BK>` Prosign Action** — added the Break prosign (`<BK>`) to the prosign
  actions configuration with a default action of New Line, joining the existing
  `<AR>`, `<BT>`, and `<HH>` prosigns.

### Changed

- **Settings Decomposed into Card Components** — the three settings tabs
  (Inputs, Outputs, Other) have been decomposed into 18 individual card
  components (7 input cards, 7 output cards, 4 other cards). Each tab is now a
  thin shell that composes its child cards. Shared CSS is loaded globally via
  `angular.json` to avoid bundle bloat from per-component duplication.
- **Emoji Edit Modal Close Button** — the close button now uses the same
  circular style (dark background, `#8cf` icon) as the settings and help modals
  for visual consistency.
- **Touch Straight-Key Sprite Position** — the animated morse key sprite now
  appears closer to the bottom of the panel card (`margin-top: -0.75rem`).
- **Sprite Space Detection** — the sprite visibility check now reacts to
  settings changes that affect panel height (mic/CW input toggles, warning
  banners) via a signal `effect()`, fixing cases where the button would not
  appear or disappear correctly after a page refresh until the phone was
  rotated.
- **Copilot Instructions** — expanded `.github/copilot-instructions.md` with
  full project structure tree, component hierarchy, key interdependencies
  (settings pipeline, CSS loading strategy, audio chain, prosign/emoji
  pipelines), architecture change conventions, and a Forbidden Operations
  section preventing Firebase deployment commands.

## [0.10.0] - 2026-03-06

### Added

- **Touch Straight-Key Sprite Button** — a floating straight-key button now
  appears at the bottom of the screen when touch keyer is enabled in straight
  mode and sufficient vertical space is available (≥ 150 px below the panel).
  Supports both touch and mouse input with visual pressed state.
- **Device Scan Results Dialog** — after scanning for audio devices in Settings,
  a dialog now lists all detected input and output devices and indicates whether
  a different hardware profile was loaded.
- **Settings Tab Swipe Navigation** — on touch devices, swipe left/right on the
  Settings tab content area to cycle between the Inputs, Outputs, and Other
  tabs.

### Changed

- **Touch Keyer Default** — the touch keyer is now enabled by default only on
  devices that have touch capability (detected via `maxTouchPoints` and the
  `any-pointer: coarse` media query), instead of being unconditionally enabled.
- **Decoder Auto-Scroll** — the main decoder/output parchment now automatically
  scrolls to the bottom when new text arrives.
- **Parchment Wrapper** — the decoded text area is wrapped in a
  `.decoded-parchment` container for improved layout control.
- **Firebase RTDB Configuration** — production Firebase credentials are now
  included in the repository for the public relay service.

## [0.9.9] - 2026-03-05

### Added

- **CW Tone Bandwidth Setting** — new "CW Tone Bandwidth (Hz)" control in
  Settings (100–500 Hz) that adjusts the width of the Goertzel tone-detection
  passband. Narrower bandwidth is more selective against adjacent tones;
  wider bandwidth reacts faster. The settings hint now dynamically shows the
  computed passband range around the centre frequency.

### Changed

- **Goertzel Detector Dynamic Block Size** — the CW audio tone detector
  (`cw-detect-processor.js`) now computes its Goertzel block size from the
  configured bandwidth (`N = sampleRate / bandwidth`, clamped 64–512) instead of
  using a fixed 128-sample block. An internal accumulation buffer handles the
  variable block size across the AudioWorklet's fixed 128-sample frames.
- **Parchment Ruled Lines** — horizontal rules on the decoder and encoder
  parchment areas now use a fixed-size background tile (`background-size`)
  instead of `repeating-linear-gradient`, eliminating a gap that could appear
  at the original element boundary when the area expanded. Lines start
  slightly lower (`0.3em` offset) and all background layers use
  `background-attachment: local` so they scroll correctly with content.
- **Typewriter Typography** — decoder and encoder parchment text now uses a
  typewriter-style font stack (`American Typewriter`, `Courier Prime`,
  `Courier New`) with slightly bolder weight, subtle letter-spacing, and
  multi-layer text-shadow to simulate uneven ink impression, giving a more
  authentic telegram appearance.

### Fixed

- **Help Documentation Corrections** — updated several help chapters to match
  current application behaviour: corrected the Settings access description
  (gear icon, not hamburger menu), removed references to non-existent features,
  fixed Firebase channel-name character limit, and added the CW Tone Bandwidth
  setting to the Audio Inputs help chapter.

## [0.9.8] - 2026-03-05

### Changed

- **Consolidated Main Screen Layout** — merged the separate Decoder and
  Encoder panels into a single unified Output section. Both decoded (RX)
  and encoded (TX) text now appear in one combined output area with
  conversation-style line breaks when the source direction changes. The
  encoder input textarea, mode selector, and TX button remain below the
  output area. All four WPM indicators (RX, TX, Keyer, Encoder) are
  shown in the title row.
- **Fullscreen Context Menu** — the single fullscreen button now opens a
  context menu offering "Fullscreen Decoder View" and "Fullscreen Encoder
  View", replacing the two separate fullscreen buttons.
- **Unified Clear Menu** — one clear button with options: "Input box"
  (encoder textarea only), "This text area" (main output), and "All text
  areas" (all buffers including fullscreen).
- **Morse Key Panel Icon** — replaced the "Output" heading with an inline
  SVG depicting a morse straight key.
- **Display Buffer Consolidation** — the `DisplayBufferService` now uses
  three buffers (`mainOutput`, `fullscreenDecoder`, `fullscreenEncoder`)
  instead of four. The new `mainOutput` buffer supports conversation-style
  newlines in its flat text output, inserting a line break whenever the
  source type (RX/TX) changes.

## [0.9.7] - 2026-03-05

### Changed

- **Universal Per-Output Isolation** — decoder pipelines now track activated
  outputs with independent reference counters (`audioOutputRefCount`,
  `serialOutputRefCount`, `vibrationOutputRefCount`, `midiOutputRefCount`)
  and per-pipeline `activatedOutputs` sets. Receive pipelines (mic, CW audio,
  MIDI) activate only audio and vibration; local keyer pipelines (keyboard,
  mouse, touch) activate all outputs. This replaces the previous two-set
  approach (`activeOutputPaths` / `activeMidiOutputPaths`).
- **MIDI Reconnect Banner** — a blue info banner now appears on the main
  screen when MIDI input or output was enabled before a page refresh,
  prompting the user to re-enable MIDI in Settings (browser security
  requires a fresh user gesture to re-acquire MIDI access). The banner
  auto-dismisses when Settings is closed.
- **Settings Cleanup** — removed all backward-compatibility migration code
  and deprecated type aliases:
  - Removed legacy flat-format (`morseAppSettings`) migration from the
    settings service constructor and `loadForFingerprint()`.
  - Removed deprecated `keyboardKeyerSource` and `midiInputSource` fields
    from the `AppSettings` interface and defaults.
  - Removed deprecated `WinkeyerForward` type aliases from both
    `settings.service.ts` and `winkeyer-output.service.ts`.
  - Removed deprecated service-level fields (`keySource`, `perfectTiming`,
    `fromMidi`) and the unused `currentSource` signal from
    `morse-decoder.service.ts`.
  - Updated JSDoc comments across `keyer.service.ts` and `settings.service.ts`
    to remove all references to removed properties and migration logic.

## [0.9.6] - 2026-03-04

### Added

- **MIDI Input/Output Feedback Loop Prevention** — bidirectional echo
  prevention for MIDI input and output sharing the same device or bus:
  - **Output → Input**: while a MIDI output note is physically held
    (active keying), incoming MIDI note-on messages are suppressed as
    bus loopback echoes. During silence gaps (inter-element, inter-char,
    word space) input passes through — any arrival during silence is
    real input, not an echo.
  - **Input → Output**: characters decoded from MIDI input carry a
    `fromMidi` tag (same pattern as `fromRtdb` for Firebase) and are
    never forwarded back to MIDI output.
  - **Break-in**: when MIDI input receives a note-on while MIDI output
    is sleeping through a trailing word-gap space, the space sleep is
    interrupted so the output gets out of the way immediately.
  - **Full QSK break-in**: when MIDI input receives a valid (non-echo)
    note-on, the entire MIDI output queue is aborted (all remaining
    characters flushed, held notes released) and output enters a muted
    state. New characters are dropped until the remote party goes silent
    for a full word gap, at which point output resumes automatically.
    This eliminates the delay where remaining queued characters would
    block incoming MIDI input after a space or inter-element gap.
- **MIDI Output Remote WPM Passthrough** — characters received via Firebase
  RTDB now carry the sender's original WPM speed through to MIDI output,
  so remote characters are played back at the speed they were originally
  sent. A new "Override remote WPM with local encoder WPM" setting allows
  forcing local encoder speed instead.

### Changed

- **MIDI Output Word-Gap Responsiveness** — the word-gap sleep (space
  character) in MIDI output is now interruptible. When a new character
  arrives while the output is sleeping through a word gap, the sleep is
  cut short and the next character plays immediately. MIDI input note-on
  events also interrupt the space sleep for instant break-in.
- **Decoder Source-Switch Flush** — when a key-down arrives on a different
  source (RX vs TX) than the in-progress pattern, the pending character is
  finished first. This prevents dits and dahs from one direction being
  appended to a pattern started by the other, which could corrupt both
  characters.
- **MIDI Input Keyer Bypass** — MIDI input now bypasses the keyboard keyer's
  enabled/disabled state, so MIDI keying continues to work even when the
  keyboard keyer is disabled (e.g. while focus is in a text field). The
  `force` parameter on `straightKeyInput()`, `ditPaddleInput()`, and
  `dahPaddleInput()` enables this behaviour.
- **Help Documentation** — updated MIDI Input (§6.3) and MIDI Output (§7.4)
  chapters with the new settings and behaviours introduced in this release.

## [0.9.5] - 2026-03-04

### Added

- **Symbols Reference Modal** — new standalone reference component
  (`symbols_ref/`) providing comprehensive tables for International Morse
  Code characters, prosigns, common CW abbreviations, Q-codes, and 92 codes.
  Accessible from the kebab menu on both the main screen and fullscreen
  modals.
- **Emoji Replacements** — expanded emoji system with curated default
  mappings for prosigns, greetings, Q-codes, and common CW abbreviations.
  Each mapping now supports an optional `meaning` field displayed in
  settings. Matching is word-boundary-aware (whole-word only). A new
  `formatTextNoEmoji()` method ensures emojis only appear on transmitted
  text, not pending encoder characters. Disabled by default.
- **Help Chapter 8.6 — Emoji Replacements** — new documentation section
  explaining the emoji replacement feature, matching rules, and default
  mappings.

### Changed

- **Parchment Paper Styling** — enhanced decoder and encoder panel
  backgrounds with dual noise layers, corner wear, coffee ring stains,
  foxing spots, diagonal fold crease, and a detailed torn-edge clip-path
  polygon for a more realistic aged paper appearance.
- **Prosign Display Contrast** — prosign pill background changed from
  `#2a2a3e` to `#3a3a52` for improved readability in fullscreen views.
- **Kebab Menu Layout** — added "Symbols Ref" button alongside Help;
  tighter vertical gap between consecutive action buttons.

## [0.9.4] - 2026-03-03

### Added

- **Prosign Actions** — new settings card under the "Other" tab that assigns
  automatic formatting actions to decoded prosigns. Each of the five supported
  prosigns (`<AR>`, `<BT>`, `<BK>`, `<SK>`, `<HH>`) can be individually
  enabled and mapped to one of four actions:
  - **New Line** — inserts a line break
  - **New Paragraph** — inserts two line breaks
  - **Clear Line** — deletes the current line back to the previous newline
  - **Clear Screen** — clears the current fullscreen buffer entirely
  Actions are triggered in real time in the fullscreen decoder and encoder
  conversation logs when a prosign is decoded or its punctuation equivalent
  appears (e.g. `+` for `<AR>`, `=` for `<BT>`). The word-gap space that
  the decoder emits after a prosign is automatically suppressed so new lines
  start cleanly. Main screen panels are not affected.

  Default mappings: `<AR>` → New Paragraph, `<BT>` → New Line,
  `<BK>` → New Line, `<SK>` → Clear Screen, `<HH>` → Clear Line.

### Changed

- **Show Prosigns** — default value changed from `false` to `true` so prosign
  display is enabled on fresh installs and after resetting to defaults.

## [0.9.3] - 2026-03-03

### Added

- **Encoder Prosign Support** — users can now type prosigns directly in the
  encoder buffer (e.g., `HELLO<SK>`) and they are recognized as single tokens,
  properly encoded to morse patterns, and transmitted through all output channels.
  Prosigns are parsed using the pattern `<[A-Z]+>` and treated as atomic units
  rather than individual characters.
- **Prosign Display Styling** — prosigns now display with a distinctive oval pill
  background (#2a2a3e) in the fullscreen conversation view, making them visually
  distinct from regular text.

### Changed

- **RTDB Validation Rules** — updated character length validation from ≤2 to ≤5
  characters to support prosign patterns like `<SK>` and `<SOS>`.
  This allows prosigns to be forwarded through Firebase RTDB relay channels.
- **WinKeyer Prosign Handling** — WinKeyer output now intelligently handles
  prosigns: clashing prosigns (e.g., `<AR>`) are converted to their ASCII
  punctuation equivalents (`+`), while non-clashing prosigns (e.g., `<SK>`,
  `<HH>`, `<SOS>`, `<BK>`) are skipped since the device doesn't support them.
- **Non-Clashing Prosigns Decoding** — fixed issue where non-clashing prosigns
  like `<SK>`, `<HH>`, `<SOS>`, and `<BK>` displayed as "?" by adding them to
  the reverse morse lookup table.

## [0.9.2] - 2026-03-02

### Added

- **Screen Wake Lock** — new setting in the "Other" settings tab. Uses
  the Screen Wake Lock API to prevent the device screen from locking
  due to inactivity. On mobile devices, screen lock suspends network
  connectivity which interrupts Firebase RTDB relay and other live
  features. The lock is automatically released when switching apps and
  re-acquired on return. Supported in Chrome 84+, Edge 84+, and
  Safari 16.4+.
- **"Other" settings tab** — new third tab in the settings modal
  (alongside Inputs and Outputs) for settings that are not
  input- or output-specific. Screen Wake Lock is the first entry.
- **Arduino Pro Micro MIDI Interface** — new `arduino/` folder with
  complete sketches for building a USB MIDI hardware interface:
  - ATmega32U4 variant (classic Pro Micro) using the MIDIUSB library
  - nRF52840 variant (Supermini / nice!nano) using Adafruit TinyUSB +
    MIDI Library
  - Inputs: straight key (pin 2), dit paddle (pin 3), dah paddle
    (pin 4) with internal pull-ups — short to GND to activate
  - Outputs: straight key (pin 5), dit (pin 6), dah (pin 7) — driven
    HIGH on incoming MIDI note, for use with optocouplers
  - ATmega32U4: onboard RX/TX LED indicators for input/output activity
  - nRF52840: uses nRF HAL GPIO directly to bypass PCA10056 pin map
    conflicts (onboard LEDs not used)
  - Mermaid wiring diagrams for straight key, paddles, and
    optocoupler output
  - Comprehensive README with inline rendered diagrams

### Changed

- **Copilot instructions** — added version bump checklist (version.ts,
  package.json, package-lock.json, CHANGELOG.md, help docs, README
  review) and arduino/README.md to the review list.

## [0.9.1] - 2026-03-02

### Added

- **MIDI Output** — new character-based output in the Outputs settings tab.
  Select a MIDI device, channel, velocity, and assign three output notes
  (Straight Key, Dit Paddle, Dah Paddle) using a note/octave picker or
  raw 0–127 value entry. Decoded characters from **any input source** are
  played back as individual morse elements (dits and dahs) at the Encoder
  WPM speed — similar to WinKeyer output. Works with encoder text, keyer
  paddles, straight key, audio inputs, MIDI input, and Firebase RTDB.
  For straight key sources, the raw hand-timed morse is decoded into
  characters and replayed with clean timing. Requires Chrome or Edge
  (Web MIDI API).
- **MIDI Output help documentation** — new §7.4 in the help chapter
  covering character-based operation, all input source support, three
  output notes, independent lifecycle, settings, browser requirements,
  and worked examples (Arduino keyer, bidirectional interface, straight
  key clean-up).

### Changed

- **MIDI Output independent of audio** — MIDI output starts
  independently when enabled and is not tied to Start / Stop Audio.
  This avoids USB MIDI device locking issues caused by rapid
  teardown and re-request of MIDI access during browser refresh.
- **Help section renumbering** — Sidetone is now §7.5, Vibration §7.6,
  and Loop Detection §7.7 (previously §7.4 / §7.5 / §7.6) to
  accommodate the new §7.4 MIDI Output section.

## [0.9.0] - 2026-03-02

### Added

- **MIDI Input** — new input method in the Inputs settings tab. Connect a
  MIDI pedal, foot switch, keyboard, or any MIDI controller and map
  specific notes to straight key, dit paddle, and dah paddle using
  capture buttons (click the button, then press a MIDI key). MIDI
  input works even when the app is in the background, another window
  is focused, or the screen is locked / showing a screensaver — unlike
  keyboard and mouse input which require DOM focus. Supports device
  selection, MIDI channel filtering (omni or specific channel), reverse
  paddles, and all paddle modes. Requires Chrome or Edge (Web MIDI API).
- **MIDI permission via Start Audio** — MIDI access is requested
  transparently alongside the audio permission when you click
  Start Audio, so there is no separate permission prompt.
- **MIDI help documentation** — new section 6.3 in the help chapter
  covering settings, capture workflow, background operation, browser
  compatibility, and a quick-reference table for MIDI emulators /
  devices that use raw channel (0–15), intensity (0–127), and
  value (0–127) parameters.
- **MIDI keep-alive** — a background timer re-attaches MIDI listeners
  every 5 seconds, preventing browser throttling from silently
  dropping the MIDI connection during idle periods.
- **Auto-reconnect on refresh** — audio and MIDI now automatically
  reconnect after a browser refresh if they were previously running.
  The running state is persisted in localStorage; Chrome remembers
  granted permissions so no user gesture is needed on reload.

## [0.8.6] - 2026-03-01

### Changed

- **Touch keyer enabled by default** — the touch keyer (straight-key
  mode) is now enabled out of the box on devices that support touch
  input, so new users on phones/tablets can start keying immediately.
- **Vibration enabled by default** — haptic vibration feedback is now
  enabled by default on supported devices (Android).
- **Keyboard keyer is now optional** — the keyboard keyer section in
  settings now has an enable/disable toggle switch (replacing the
  former "Always On" badge). It defaults to enabled. When disabled,
  keyboard keys no longer act as straight key or paddles.
- **Encoder mode label shortened** — the main-screen encoder mode
  dropdown now shows "Send on Enter" / "Live" instead of
  "Send on Enter" / "Live (as you type)", matching the fullscreen
  modal wording.
- **Consistent icon-button spacing** — horizontal gaps between
  adjacent icon buttons are now a uniform 10 px throughout the app:
  main-screen header, decoder actions, encoder actions, and
  fullscreen modal toolbar (including mobile and landscape
  breakpoints). Edge padding on the fullscreen toolbar is also
  normalised to 10 px at every breakpoint.

### Fixed

- **Reset button now restores modal display settings** — pressing
  "Reset" in the settings dialog now also resets the fullscreen
  modal display settings (font size, bold, line spacing, and all
  foreground/background colours) back to their defaults. Previously
  only the main `AppSettings` were reset; modal display settings
  were left unchanged.

## [0.8.5] - 2026-02-28

### Changed

- **License** — switched project license from **MIT** to **GPL-3.0**.
- **Settings modal colors** — adjusted the colour palette so enabled
  cards are more pronounced (brighter blue header/border) and
  disabled cards are more muted (desaturated grey/darker background).

### Fixed

- **Reset calibration icons** — increased icon size and button touch
  target area to make them easier to tap on mobile. Fixed an issue
  where these buttons were invisible in the fullscreen modal on
  touch devices.
- **Encoder output panel styling** — adjusted font size, padding and
  height of the encoder panel on the main screen to exactly match
  the decoder panel for visual consistency.

## [0.8.4] - 2026-02-28

### Changed

- **Clear context menu spacing** — doubled the gap between buttons in
  all four clear context menus for easier touch targeting.
- **Help button restyled** — the Help entry in kebab menus is now a
  3D oval stone button in dark bluish-grey, matching the clear-menu
  button style. The circled "?" icon has been removed; the button
  shows text only. It is centred at 92% width, slightly narrower
  than the surrounding kebab content.
- **Fullscreen kebab menu width** — capped at 260 px on desktop to
  prevent the dropdown from stretching unnecessarily wide.

### Fixed

- **Help close returns to fullscreen modal** — closing the help
  overlay while a fullscreen modal is open now returns to that modal
  instead of falling through to the main screen.
- **RTDB status indicator goes grey on disconnect** — the RTDB
  wifi icon now immediately turns grey when the browser goes offline,
  and turns green again on reconnect.
- **Offline warning banner** — an amber warning banner now appears
  at the top of the main screen when the browser goes offline while
  Firebase RTDB input or output is active. The banner is dismissed
  automatically on successful reconnect.
- **Help TOC missing entries** — added §10.9 "Time Synchronisation"
  and §10.10 "RTDB Status Indicator" to the table of contents.

## [0.8.3] - 2026-02-28

### Added

- **RTDB status indicator** — a wifi-style icon labelled "RTDB" now
  appears in the main toolbar and both fullscreen modal toolbars. The
  icon is grey when inactive and turns green when Firebase RTDB input
  or output is active.
- **Clear context menus** — pressing the Clear button (🗑) now opens a
  small context menu instead of clearing immediately. Options are
  **This log** (clears the current buffer only) and **All logs**
  (clears all four display buffers at once). The main-screen
  encoder's clear menu adds a **Text area** option to empty the
  text-entry field without touching any conversation log.
- **Help button in kebab menus** — the **?** help button has moved
  from the main header into the kebab (⋮) overflow menus on both
  the main screen and fullscreen modals. Opening help from a
  fullscreen modal correctly layers the help overlay on top.
- **Calibration reset in fullscreen decoder** — *Reset RX Cal* and
  *Reset TX Cal* buttons are now available in the fullscreen decoder
  kebab menu, matching the main-screen decoder toolbar.
- Help documentation updated: §2.5 Fullscreen Decoder, §3.3
  Fullscreen Encoder, §8.3 Fullscreen Mode, and new §10.10 "RTDB
  Status Indicator".

### Fixed

- **Help z-index** — the help overlay now renders above the fullscreen
  modal (z-index 10 000 vs 9 999) so it is no longer hidden when
  opened from a fullscreen view.
- **Back button for layered modals** — the browser back button now
  correctly closes the topmost modal first when help is open above a
  fullscreen modal, instead of closing the wrong layer.

## [0.8.2] - 2026-02-28

### Added

- **NTP-like time synchronisation** — when connecting to Firebase RTDB,
  the app obtains a server-time offset via Firebase's
  `.info/serverTimeOffset` mechanism, which works like an NTP query
  against Google's infrastructure. This provides an accurate UTC
  timestamp independent of the local time zone or clock drift. If the
  offset is not available within approximately one second, the app falls
  back to the device's own UTC clock (`Date.now()`).
- **Stale-character guard** — the first character received after
  subscribing to an RTDB input channel is checked against the
  NTP-synchronised time. If the character's server timestamp is older
  than one second, it is silently discarded. This prevents stale
  characters from a previous session (e.g. from yesterday) from
  appearing in the decoder when reconnecting to a channel. Subsequent
  characters are accepted immediately without any timestamp checks,
  ensuring zero added latency during normal operation.
- Help documentation updated: Chapter 10 (Firebase) new §10.9
  "Time Synchronisation & Stale-Character Guard" documents both
  features.

## [0.8.1] - 2026-02-28

### Fixed

- **Fullscreen modal encoder mode not persisted** — changing the
  Send on Enter / Live mode dropdown in the fullscreen modal now
  auto-saves to local storage immediately, matching the behaviour
  of WPM adjustments.
- **RTDB user name changes not splitting conversation lines** — in the
  fullscreen decoder and encoder conversation views, messages from
  different Firebase RTDB users on the same RX/TX source now start a
  new line so each sender is clearly attributed.

## [0.8.0] - 2026-02-28

### Added

- **WPM relay over Firebase RTDB** — every character published to RTDB
  now carries the WPM speed used to generate it. Keyboard encoder
  characters carry the Encoder WPM, paddle/keyer characters carry the
  Keyer WPM, and CW-decoded characters carry the auto-calibrated
  estimated WPM from their RX or TX pool. The receiving station plays
  back each character at the sender's original speed (dits, dahs,
  inter-character gaps, and word spaces all timed correctly). A new
  **Override remote WPM** checkbox in the RTDB Input settings allows
  the receiver to ignore the remote speed and use local Encoder WPM
  instead (default: off — remote WPM is respected for realism).
- **Firebase RTDB auto-reconnect** — when the RTDB connection drops,
  the app automatically retries with exponential backoff (2 s, 4 s,
  8 s). Input and output channels are retried independently. After
  three consecutive failures a persistent amber warning banner appears
  at the top of the main screen. When the browser comes back online
  the app immediately restarts any channel that should be active.
- **Enhanced haptic timing** — a new vibration mode that sends a brief
  pre-pulse pattern to overcome Android motor spin-up latency
  (20–50 ms), making short dits perceptible at higher WPM. Enabled by
  default via the "Enhanced haptic timing" checkbox in the Vibration
  output settings.
- **Experimental badges** — the Straight Key via Mic (Pilot Tone)
  input and Key Output (Optocoupler / Audio) output are now marked as
  "Experimental" in Settings, reflecting ongoing AC coupling
  reliability challenges on various sound cards.
- Help documentation updated: Chapter 10 (Firebase) now covers WPM
  relay, Override remote WPM setting, and a new §10.8 Auto-Reconnect
  section. Chapter 6 (Inputs §6.1) and Chapter 7 (Outputs §7.1) note
  experimental status. Chapter 7 (§7.5 Vibration) updated for
  enhanced haptic timing and default-off vibration. Chapter 11 (§11.4)
  documents running multiple browser tabs.

### Changed

- Vibration output is now **disabled by default** (was enabled).
  Enable it manually in the Outputs tab of Settings.
- Encoder panel sent-text colour changed from green (#0a0) to white
  (#eee) for improved readability on the dark background.
- RX/TX decoder WPM reset-calibration buttons moved from the decoder
  action row into the kebab (⋮) dropdown menu next to the ±WPM
  controls, saving horizontal space.
- WPM indicator and pill number digits now use
  `font-variant-numeric: tabular-nums` instead of a monospace font,
  keeping fixed-width digits without baseline alignment issues.
- Redundant per-keyer WPM ± controls removed from the Keyboard,
  Mouse, and Touch keyer settings sections (the shared Keyer WPM
  controls on the main screen remain).
- Firebase RTDB security rules in `firebase.config.ts` updated to
  require and validate the new `wpm` field (number, 5–60).

## [0.7.0] - 2025-06-19

### Added

- **Per-output signal routing** — every hardware and software output
  (optocoupler, serial port, WinKeyer, sidetone, vibration) now has an
  independent routing selector that controls whether it activates on
  TX signals, RX signals, or both.  Previously only the WinKeyer and
  Firebase RTDB outputs had a forwarding mode; sidetone and vibration
  were always active, and the opto / serial outputs were TX-only with
  no user control.
- New `OutputForward` type (`'rx' | 'tx' | 'both'`) in the settings
  service replaces the former `WinkeyerForward` (kept as a deprecated
  alias for backward compatibility).
- New settings: `sidetoneForward`, `vibrateForward`, `optoForward`,
  `serialForward` — each defaults to the most common use-case
  (`'both'` for sidetone / vibration, `'tx'` for opto / serial).
- **Firebase RTDB → all outputs** — incoming characters from the
  Firebase Realtime Database are now routed to every output whose
  forward mode includes RX, not just the sidetone. This means an
  RTDB-received signal can key the transmitter, trigger vibration,
  or drive a WinKeyer — any output the operator has set to
  "RX" or "Both". Characters are never echoed back to RTDB output to
  prevent network loops.
- **Loop-detection service** (`loop-detection.service.ts`) — a new
  injectable service that watches for feedback loops between outputs
  and inputs.  It compares the last characters sent and received; when
  six or more consecutive characters match within a sliding five-second
  window the service suppresses further output routing until an
  eight-second cooldown expires (doubling on repeated triggers, up to
  30 s).  A yellow warning banner appears at the top of the page while
  a loop is active, and can be dismissed manually.
- Help documentation updated: Chapter 7 (Outputs §7.1–§7.5) now
  describes the per-output routing selectors and loop-detection
  behaviour.  Chapter 10 (Firebase §10.3) corrected to reflect that
  received characters route to all qualifying outputs.

### Changed

- All output services (`AudioOutputService`, `SerialKeyOutputService`,
  `VibrationOutputService`) now accept a `source` parameter
  (`'tx' | 'rx'`) on their `keyDown()` and `schedulePulse()` /
  `scheduleTone()` methods.  Each service checks its forward setting
  before activating.
- `MorseDecoderService` passes `keySource` through to every output and
  guards activation with the loop-detection suppression flag.
- `MorseEncoderService` — the former `enqueueSidetone()` method is
  replaced by `enqueueRxPlayback()` which routes RX playback through
  all outputs (not just sidetone), respecting each output's forward
  mode.
- Settings modal: sidetone and vibration sections now show an
  "Active on:" selector (TX only / RX only / Both); optocoupler and
  serial port sections show a "Forward:" selector with the same
  options.
- WinKeyer and Firebase RTDB retain their existing "Forward:" selector
  wording.
- "Reset all settings to defaults" button now shows a confirmation
  dialog before applying, preventing accidental resets.

## [0.6.0] - 2026-02-27

### Added

- Four independent FIFO display buffers — the main decoder panel, main
  encoder panel, fullscreen decoder conversation, and fullscreen encoder
  conversation each have their own text buffer. Clearing one does not
  affect any of the others. Each buffer is capped at approximately
  5 000 characters (~2× a full screen of text); when the limit is
  reached the oldest characters are silently discarded (FIFO).
- Display buffers are maintained in a root-provided service so
  fullscreen conversation text persists across close/reopen without
  rebuild. No data is lost until the user explicitly presses Clear.
- New `DisplayBuffer` class and `DisplayBufferService` in
  `display-buffer.service.ts` — signal-based `lines()` (collapsed
  conversation lines) and `text()` (flat string) outputs.
- User Name prefix (callsign) is now resolved and stored at the
  buffer level so the same userName logic applies consistently to
  all four display areas.

### Changed

- Main decoder panel reads from its own display buffer instead of the
  decoder service's `decodedText` signal. Clearing the decoder panel
  only resets that buffer (plus internal operational state), leaving
  the fullscreen views intact.
- Fullscreen modal no longer uses `ngDoCheck` for conversation sync.
  The `DoCheck` lifecycle hook, `conversationLog` array, watermark
  tracking fields, and the `appendToConversation` / `getLineUserName`
  helper methods have all been removed. The template reads directly
  from the display buffer's signal-based `lines()` output.
- Help documentation updated: Chapter 2 (Decoder §2.5), Chapter 3
  (Encoder §3.3), and Chapter 8 (Configuration §8.3) now describe
  independent display buffers and FIFO behaviour.

## [0.5.0] - 2026-02-27

### Added

- Firebase Realtime Database (RTDB) integration — relay decoded Morse
  characters between app instances in real time over the internet. Two
  independent sections in Settings:
  - **Input** (Inputs tab): subscribe to a named channel to receive
    characters from a remote station. Incoming letters appear in the
    decoder panel and fullscreen conversation view with a sidetone-only
    playback (no radio keying or retransmission).
  - **Output** (Outputs tab): publish decoded/encoded characters to a
    named channel. Configurable forwarding mode (RX, TX, or Both),
    matching the WinKeyer forwarding pattern.
- Channel-based access control — channels are identified by a name +
  secret pair used as path segments in the database. Only clients that
  know both values can read or write.
- User Name prefix in fullscreen conversation — when RTDB is active,
  each line is prefixed with the sender's callsign in square brackets
  so both local and remote lines are clearly attributed.
- Help Chapter 10 (Firebase Realtime Database) with sections covering
  channel concepts, input/output settings, user name display,
  bidirectional setup, and requirements.
- New settings: rtdbInputEnabled, rtdbInputSource, rtdbInputChannelName,
  rtdbInputChannelSecret, rtdbOutputEnabled, rtdbOutputForward,
  rtdbOutputChannelName, rtdbOutputChannelSecret, rtdbOutputUserName.

### Changed

- Sidetone-only playback for received RTDB characters — incoming remote
  letters play through the sidetone oscillator without keying the
  optocoupler, serial port, or radio output, preventing accidental
  retransmission.
- RTDB connections auto-restart (debounced 600 ms) when channel name,
  secret, or user name fields change while the feature is enabled,
  eliminating the need to toggle off/on after editing settings.
- Help Chapter 10 (Reference) renumbered to Chapter 11 to accommodate
  the new Firebase RTDB chapter.

### Dependencies

- Added `firebase` npm package (modular v9+ SDK) for Realtime Database
  access.

## [0.4.0] - 2026-02-27

### Added

- WinKeyer output — forwards decoded text to a K1EL WinKeyer (WK2/WK3/WKUSB)
  device over the Web Serial API. WinKeyer generates perfectly timed CW keying
  on its output pin. Configurable forwarding mode: RX only (received morse),
  TX only (transmitted/encoded morse), or both. Host-mode protocol at 1200
  baud 8N2 with real-time WPM speed control, firmware version display,
  connection status, and transmit buffer clear. Works with all input sources
  (mic pilot tone, CW audio, keyboard/mouse/touch keyers, and the text
  encoder). New settings: winkeyerEnabled, winkeyerPortIndex, winkeyerWpm,
  winkeyerForward.

### Changed

- Help Chapter 7 (Key & Audio Outputs) reordered to match the Outputs tab
  layout in Settings: Optocoupler → Serial Port → WinKeyer → Sidetone →
  Vibration. Section numbers updated accordingly (7.1–7.5).

## [0.3.2] - 2026-02-27

### Changed

- Default keyboard paddle keys changed from Z / X to [ / ] (BracketLeft /
  BracketRight). Existing users who have already customised their key bindings
  are not affected. Help chapter updated to reflect the new defaults.

## [0.3.1] - 2026-02-27

### Added

- Progressive Web App (PWA) support — the app is now fully installable on
  desktop (Chrome, Edge) and mobile (Android Chrome, iOS Safari "Add to Home
  Screen"). An Angular service worker (`@angular/service-worker`) caches the
  app shell and static assets for offline access. The web app manifest has been
  enhanced with `description`, `id`, `scope`, `orientation`, `categories`, and
  a maskable icon entry for improved installability and platform integration.

## [0.3.0] - 2026-02-26

### Added

- Vibration output — haptic feedback while keying, mirroring the sidetone
  output. Works for both TX and RX key events from any input source
  (keyboard, mouse, touch, mic pilot, CW tone, encoder). Enable via the
  Vibration toggle in the Outputs tab of Settings. Android only — the
  Vibration API is supported in most Android browsers (Chrome, Firefox,
  Edge); iOS Safari and desktop browsers do not support it.
- Responsive toolbar menus — main screen controls bar and fullscreen modal
  toolbars now collapse overflow controls into a kebab (⋮) dropdown menu on
  narrow screens, keeping essential buttons (Start Audio, Close, Clear) always
  visible.
- Virtual keyboard toggle in fullscreen Encoder mode for mobile/tablet devices
  — a floating keyboard button opens the on-screen keyboard for text input
  without a visible text field.

### Changed

- Vibration setting moved from Touch Keyer section (Inputs tab) to the
  Outputs tab as a dedicated Vibration card with its own enable toggle,
  matching the pattern of other output types (Sidetone, Key Output, Serial).
  Old saved profiles with `touchVibrateEnabled` are automatically migrated
  to the new `vibrateEnabled` setting.
- Encoder Mode selector moved from the panel header to the actions row below
  the text area, alongside TX and Clear buttons, for a cleaner layout.
- Clear buttons in both Decoder and Encoder panels now display a ✕ icon
  prefix for visual consistency with the fullscreen modal close button.
- Clear buttons right-aligned in both panel action rows; other controls
  (TX, Mode) remain left-aligned.
- Touch keyer mode hint text ("Shows a single touch button…" / "Shows two
  touch buttons…") relocated directly below the Touch Mode selector in
  settings for better discoverability.
- Help documentation updated to cover responsive toolbars, haptic vibration,
  virtual keyboard, and updated UI layout.

## [0.2.0] - 2026-02-25

### Added

- Real-time CW decoding from microphone input via ultrasonic pilot tone detection
- CW tone detection from radio receiver audio
- Text-to-Morse encoder with "Send on Enter" and "Live" modes
- Keyboard keyer with five modes: Straight, Iambic A, Iambic B, Ultimatic, Single Lever
- Mouse keyer — map left, middle and right mouse buttons to Straight Key, Dit or Dah
- Touch keyer — on-screen touch buttons in Straight or Paddle mode for tablets/phones
- Radio keying via sound card output (DC/AC mode) or USB-serial adapter (DTR/RTS)
- Per-device settings profiles with local storage persistence
- Per-input decoder source routing — each input independently assigned to RX or TX
- Dual decoder calibration pools (RX and TX) with independent auto-calibration
- Perfect-timing mode for iambic keyer output — bypasses adaptive calibration
- Reverse Paddles toggle per keyer type (keyboard, mouse, touch)
- Fullscreen conversation view with RX/TX colour-coded text and display customisation

### Changed

- Help documentation completely restructured: clickable table of contents, 9 chapters
  split into standalone Angular components, floating "Help Home" navigation button,
  comprehensive coverage of all features including keyers, decoder source routing,
  dual calibration, and per-input settings with reasoning behind each option

## [0.1.0] - Initial development release

### Added

- Initial project scaffolding with Angular 19
- Basic Morse encoding and decoding services
- Web Audio API integration
