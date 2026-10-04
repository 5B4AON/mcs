# Work Package 10 — Hardware, Radio, and Relay Wizard Scenarios

**Priority:** 10 — high-value advanced path with external-output safety risk

**Proposed release:** R5 — Audience and station setup paths

**Dependencies:** Packages 04, 08, and 09 accepted; 01 and 03 should be accepted before any audio/hardware flow

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Keep the scenario entry compact; put detailed hardware choices and safety review in wizard steps/modals instead of adding persistent toolbar controls or compressing the Galaxy S21 portrait layout.

## Goal

Guide a user from intent (“use a physical key,” “key my radio,” “use online relay”) to the correct existing card and, where approved, configure a minimal explicit draft. Preserve all advanced mappings and require clear review before any external path can be enabled.

## Supported choices to present

1. **Manual key, no extra hardware:** keyboard, mouse, or touch keyer; retain existing straight-key/paddle mode choices.
2. **Physical key/paddle input:** MIDI or Web Serial input; show browser support and port/device selection limitations before opening a chooser.
3. **Key a transmitter:** audio optocoupler, serial DTR/RTS, WinKeyer, or MIDI output. Describe these as external radio-keying routes, not ordinary speaker audio.
4. **Relay Morse online:** existing Firebase RTDB input/output settings and the package 04 privacy explanation.
5. **Advanced operator:** direct route to all existing Settings and routing selectors without changing them.

Owner must approve labels, routing explanations, and the exact Review screen before implementation.

## In scope

- Extend the existing wizard with conditional setup steps and task links to the current settings cards.
- Where the approved flow edits settings, keep them in the same isolated draft and final diff as package 08; only explicit selected fields may change.
- Detect/report relevant browser capability (for example, Web Serial/MIDI API support) without opening permissions/choosers automatically.
- Before enabling a previously disabled external keying path, show the exact device/pin/forward route, conflict state, browser/hardware requirement, and explicit acknowledgement. A user must opt into each path; the wizard may not infer transmitter connection from a detected device.
- Preserve multiple independent mappings and per-mapping forwarding, reverse-paddle, channel, keyer, and source settings. New simplified UI must deep-link to the full mapping editors for advanced changes.
- Reuse `settings.channelConflict()` and show its conflict before applying. If an external target is missing or cannot be uniquely mapped, leave that path disabled and request manual selection.
- Implement external-output change classification as a small pure, testable utility that compares the current and proposed settings and lists each changed keying/relay destination. Keep the utility free of browser/service side effects so named-preset application can reuse the same safety policy.
- For serial/MIDI device selection, invoke the browser/device chooser only from a clearly labelled user action. For RTDB, show package 04 disclosure before entry/enable.
- Provide a conspicuous **Return to advanced Settings** link throughout.

## Out of scope

- Automatically probing/transmitting a radio, test keying during wizard navigation, changing hardware wiring, or opening a serial port to identify it.
- Collapsing multiple mappings into a single configuration, changing hardware defaults, or removing `Forward` RX/TX/Both controls.
- Redesigning Firebase authentication/rules, modifying RTDB protocol, or claiming a radio is safely connected based solely on browser API availability.

## Mandatory safety invariants

1. No external keying/relay setting changes before the user confirms the final review.
2. A previously disabled output never becomes enabled by choosing a persona, detecting hardware, selecting a preset, or pressing Back/Next.
3. Review names the exact output type and target; if the target is unknown, Review cannot silently substitute System Default, another serial port index, or the first MIDI device.
4. Enabling an output that may key a transmitter requires an explicit user selection plus a separate clearly worded acknowledgement in the final Review. Relay additionally states that data will be sent over the configured RTDB channel.
5. A conflict or unresolved output target blocks enabling that route until fixed; it must not block unrelated local practice or input-only setup.
6. No test action sends a test signal unless separately and explicitly pressed from an existing test control with its target visible.

## Implementation instructions

1. Before code, trace every possible output path from settings to `MorseEncoderService`, `AudioOutputService`, serial, MIDI, WinKeyer, and Firebase. Enumerate global and per-mapping enable/forward fields in the source review and pure classifier unit cases.
2. Have the owner approve the scenario menu, exact safety acknowledgement, output summary, unsupported-browser copy, and behavior when a target cannot be resolved.
3. Keep the wizard patch allow-listed by selected setting keys; do not merge a whole `DEFAULT_SETTINGS` object or silently reset unrelated mappings.
4. Validate output conflicts and capability before final apply; revalidate at apply in case current devices/settings changed since the wizard began.
5. Keep all permissions, output tests, and sends behind direct user gestures. Do not use route entry as a substitute for consent.
6. Keep the output-change classifier pure and generic enough for package 11 to use; it must report changed route type/target/enablement and whether explicit acknowledgement is required, without itself applying settings.
7. If implementing the pure output-change classifier, test only that side-effect-free utility's classification rules using the existing non-UI unit-test setup. Do not create or run automated wizard/component/DOM/browser tests for scenario navigation, permissions, outputs, or responsive behavior; the owner manually verifies those paths below.

## Acceptance criteria

- Every supported pathway leads to an existing configuration surface or an approved exact minimal setup; no capability is represented as available when unsupported.
- No external keying or relay path is enabled or activated without a visible, target-specific final acknowledgement.
- Unavailable/ambiguous hardware never silently falls back to a different port/device or system default.
- Existing independent keyer mappings, output mappings, channel controls, forward selectors, relay, and manual test controls remain intact.
- Local-only and input-only scenarios continue to work when hardware options are unavailable.
- `npm run build` passes; any automated tests are limited to pure non-UI classifier logic. Manual validation never uses a connected live transmitter without the owner's explicit safe test setup.

## Manual owner checkpoint — required before acceptance

Ask the owner to verify on a Samsung Galaxy S21 in portrait and on desktop at narrow, typical, and wide widths while resizing. Confirm all scenario steps, route names, target-specific warnings, and existing top-bar actions remain legible/discoverable without overflow or crowding. Then verify all scenario branches with hardware disconnected first, followed only by safe test hardware when approved. Confirm API support messages, chooser timing, conflict behavior, final output summary, cancellation, and disabled output state. Actual transmitter keying tests require the owner to explicitly approve and provide a safe test setup (e.g. dummy load); never assume a live on-air test is safe.

## Approval gate

**Before implementation, request explicit approval for Work Package 10 and its exact output-enable review/acknowledgement design.** Any change to RTDB trust model, hardware default, output forwarding, or protocol is a separate decision. Stop after hardware-safe owner testing; do not proceed to package 11 without acceptance.
