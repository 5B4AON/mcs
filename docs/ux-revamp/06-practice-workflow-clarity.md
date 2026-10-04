# Work Package 06 — Practice Workflow Clarity

**Priority:** 6 — improve the existing learner journey without replacing it

**Proposed release:** R3 — Practice and findability

**Dependencies:** Work Package 05 for accessible modal/button conventions

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve screenshot-tested font, button, touch-target, and spacing scale. Keep Practice discoverable without adding a permanent toolbar row or shrinking controls; use an existing menu/modal or a compact in-flow entry that preserves the Galaxy S21 portrait fit.

## Goal

Make Copy Practice easy to find, start, pause, type into when appropriate, and understand. Preserve its existing sequence generation, scoring, speed/timing, feedback modes, and local/full pipeline choices.

## Existing behavior to preserve

- Copy Practice is disabled by default and its settings live under Settings → Other → Copy Practice (`src/app/components/settings-modal/settings-other-tab/practice-card/practice-card.component.html`).
- `PracticeService` handles sequence generation and scoring; `MorseEncoderService` plays sequences, and `src/app/app.component.html:203-256` switches field placeholder, field availability, and controls based on mode/state.
- Non-type-along modes intentionally disable text entry; type-along accepts typed answers. Local pipeline avoids external serial/MIDI/RTDB/vibration outputs. Preserve that safety behavior.

## In scope

1. Add a clear, discoverable Practice entry point and state label, with a short explanation of selected content (characters/words/callsigns) and feedback style. Do not add a persistent toolbar label or crowded row to expose it.
2. Explain why the text field is disabled in Listen and Blurred modes; do not remove its disabled semantics or allow typed answers to accidentally reveal/affect a listen-only session.
3. Give Start, Pause, Resume, Next sequence, and Validate actions clear visible text when it fits the existing practice surface; otherwise retain the compact control with a programmatic accessible name and concise nearby/modal explanation. Preserve existing state transitions.
4. Add concise descriptions for the three feedback modes and two pipelines, especially the local-only versus full external-output behavior.
5. Make results and current session state understandable without moving or clearing the existing RX/TX buffers. Keep accuracy and per-character feedback behavior intact.
6. Use a practice-specific user path/entry point in the main screen or task shortcuts, but do not create a second practice engine.

## Out of scope

- New scoring models, per-character statistics, lesson authoring, teacher dashboards, CSV export, telemetry, or gamification.
- Changing the random word/callsign/character pools, sequence length rules, Morse timing, or default practice pipeline.
- Autoplaying practice or sample audio on selecting the Practice entry point.

## Implementation instructions

1. Trace all current practice modes, buttons, keyboard handling, feedback state, and fullscreen controls before changing templates.
2. Have the owner approve the proposed entry-point wording and the exact label for a disabled input before coding.
3. Keep `PracticeService` and encoder playback behavior unchanged unless a directly demonstrated existing defect is separately approved. Avoid resetting a running practice round just because the user changes view or opens settings.
4. Preserve local-only default routing and ensure no setting in this UI silently changes `practicePipeline` to `full`.
5. Do not create or run automated UI/component/browser tests. The owner manually verifies all practice states, feedback/input behavior, and output safety in the checkpoint below.

## Acceptance criteria

- A learner can tell how to start practice, what will be played, whether they should type, and how to check an answer.
- A disabled field has a visible/programmatic explanation and does not accept or lose typed input unexpectedly when modes change.
- Start/Pause/Resume/Next/Validate remain mapped to their existing correct state transitions.
- Changing the presentation does not alter sequences, scoring, timings, settings, decoder output, buffers, or local/full routing.
- No practice selection autoplays or sends; local pipeline remains local.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Ask the owner to compare the changed screen with the supplied screenshots on a Samsung Galaxy S21 in portrait and desktop at narrow, typical, and wide widths while resizing. Confirm Practice discovery fits while preserving font/button scale and without obscuring existing controls. Then test all three feedback modes, all content modes, each practice state, main and fullscreen displays, keyboard entry, and the local pipeline with serial/MIDI/RTDB outputs configured but not intended for practice transmission. Verify the UI explains why an input is disabled and does not leak practice through an external output.

## Approval gate

**Before implementation, request explicit approval for Work Package 06.** Any scoring, educator-report, default, or full-pipeline change requires separate approval. Stop for owner practice-session testing before package 07.
