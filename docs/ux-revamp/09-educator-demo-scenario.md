# Work Package 09 — Educator and Group-Demonstration Scenario

**Priority:** 9 — extend the accepted wizard for classrooms and public demonstrations

**Proposed release:** R5 — Audience and station setup paths

**Dependencies:** Work Package 08 accepted

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve screenshot-tested font, button, touch-target, and spacing scale. Do not add a permanent toolbar label, shrink controls, or force a wide demo setup screen on the Galaxy S21 portrait; reuse the wizard and existing fullscreen/modal surfaces.

## Goal

Add a clear **Teach or demonstrate Morse** path that helps an educator reach the app’s existing large-text conversation display and relevant input setup without pretending that a classroom-specific subsystem exists.

## In scope

1. Add one educator/group-demo scenario to the existing wizard, using the accepted stepper/draft/review pattern from package 08.
2. Let the user choose the existing fullscreen decoder or encoder/conversation view as the display starting point. Explain RX/TX labels in plain language.
3. Offer optional links to the current settings cards for supported input methods (keyboard/mouse/touch, audio, MIDI, serial) and participant name/color mappings where present.
4. Allow a user-initiated “Open selected fullscreen view” after setup. Preserve the existing three display buffers and modal/back-button history.
5. Let the user inspect current fullscreen font/spacing/color settings and link to the existing display controls. If the implementation proposes changing these values from the wizard, pause for owner approval of precise defaults and persistence behavior first.
6. Make clear that the wizard configures this browser only; do not claim student account management, class rosters, cloud sync, or performance reporting.

## Out of scope

- Teacher/student accounts, assignment management, student analytics, calibration confidence, session export/CSV, telemetry, classroom networking, or a new collaborative protocol.
- Changing fullscreen buffer behavior, prosign handling, font/color defaults, or participant identity semantics.
- Enabling microphone, MIDI, serial, or output hardware without the user's explicit action.

## Implementation instructions

1. Obtain owner approval for the scenario copy, entry choices, fullscreen choice, and any proposal to adjust display preferences.
2. Reuse existing `FullscreenModalComponent` and display settings. Do not build a duplicate conversation view or directly manipulate DOM styles outside current component state.
3. A link to a settings card must navigate/expand only; it must not toggle its service or request permissions.
4. If a user chooses an input needing browser permission, show the permission explanation and a separate explicit connection/start action. Preserve other active inputs and RX/TX source assignments.
5. Keep all existing text buffers intact when opening/closing the fullscreen view or returning to the wizard.
6. Do not create or run automated UI/component/browser tests. The owner manually verifies scenario navigation, fullscreen choice/history, and that setup causes no unsolicited setting changes.

## Acceptance criteria

- Educators can find a relevant demo path and open either existing fullscreen view without searching the long Help contents.
- RX/TX meaning and participant identity/color are explained accurately.
- Settings shortcuts lead to existing controls but do not activate them.
- Fullscreen text, all three independent buffers, active RX/TX processing, display settings, and browser Back behavior remain intact.
- No unsupported classroom analytics or privacy claims are introduced.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Ask the owner to compare the educator path with the supplied screenshots on a Samsung Galaxy S21 in portrait and at presentation-size on desktop, then resize desktop from narrow through typical to wide. Confirm screenshot-relative text/control scale remains intact, the setup is legible without crowding, top-bar controls remain available, and fullscreen/modal entry/exit still works. Send/receive test text, switch/close/reopen fullscreen, use browser Back, and verify settings links do not enable devices. Confirm any modified display preference and its persistence with the owner.

## Approval gate

**Before implementation, request explicit approval for Work Package 09.** Ask the owner before adding any teacher-specific feature, storing participant data, or choosing a forced display default. Stop for demo testing and owner acceptance before package 10.
