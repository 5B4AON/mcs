# Work Package 02 — “Try Morse” First-Success Path

**Priority:** 2 — make the first useful outcome discoverable  
**Proposed release:** R1 — A reliable first Morse session  
**Dependencies:** Work Package 01 for accurate audio-state/error messaging

## Goal

Give a new user a short, non-blocking route to load a sample, understand the encoder, and choose to hear/send it through the existing pipeline. The app must not autoplay or transmit merely because the user opened the page or dismissed onboarding.

## Existing behavior to preserve

- The main screen has a shared RX/TX display and encoder field in `/home/runner/work/mcs/mcs/src/app/app.component.html:110-215`.
- Normal send behavior is controlled by `encoderMode` and the existing TX button/keyboard handlers in `/home/runner/work/mcs/mcs/src/app/app.component.ts`.
- User-configured outputs can include radio keying. A sample send must not be treated as safe merely because it is a sample.

## In scope

1. Add a compact first-visit “Try Morse” orientation card or equivalent inline entry point; it must not block the app or hide existing controls.
2. Explain the distinction between the text-entry encoder, live RX/TX conversation display, and Start Audio in plain language.
3. Offer an explicit **Load example** action that places a short, fixed example into the existing encoder field without sending it. The sample should use characters supported by the existing Morse table.
4. Let the user initiate playback only through an explicit action. Continue to use the existing encoder/mode/output pipeline; do not create a second encoder implementation.
5. If any external keying/relay output is currently enabled, visibly identify the destination and require a separate, explicit confirmation before the sample is sent. If a safe local-only preview cannot be guaranteed without mutating active settings, do not claim it is local-only; ask the owner to approve the exact wording/flow.
6. Make onboarding dismissible and provide a persistent route to reopen the short “How to start” guidance. If storing dismissal state, use one separate non-sensitive key and tolerate storage being unavailable.

## Out of scope

- A persona survey, full setup wizard, or named presets (packages 08–10).
- Automatically switching `encoderMode`, changing saved `AppSettings`, enabling audio, playing a sample, or opening device permission prompts on page load.
- Replacing the shared conversation display or changing any output route.

## Implementation instructions

1. Confirm the exact sample text, prompt, visibility/dismissal behavior, and external-output warning with the owner before coding. Do not invent a branded tutorial or animation.
2. Reuse the existing textarea reference, encoder event handlers, and TX action. Keep the user's current text safe: loading a sample must not silently overwrite non-empty text; prompt or offer an explicit append/replace choice.
3. Preserve the selected mode and all existing buffers. Do not clear, reclassify, or duplicate displayed text as part of the sample action.
4. Treat `sidetoneEnabled` as local audio but identify every path that can reach external hardware/relay before declaring a send safe. Do not send a test pulse or call a low-level output service directly.
5. Add focused tests for load-with-empty-field, non-empty-field protection, dismissal/reopen behavior, no automatic send/audio, and the external-output confirmation gate.

## Acceptance criteria

- A first-time user can find a short explanation and explicit example-load action without opening the long Help manual.
- Opening or dismissing the card does not start audio, send text, request permission, alter active settings, or clear buffers.
- Loading an example never silently discards existing user text.
- The existing send pipeline, selected mode, routing, and text display remain authoritative.
- A potentially external send is clearly identified and requires the approved explicit confirmation.
- The guidance remains reachable after dismissal, and existing experienced-user controls remain visible.
- `npm test` and `npm run build` pass.

## Manual owner checkpoint — required before acceptance

Ask the owner to verify on desktop and a narrow/touch viewport:

1. The user sees an understandable first action and can dismiss and reopen it.
2. Loading an example is not the same as sending it; audio and outputs remain idle until the user's explicit action.
3. Existing encoder text, RX/TX buffers, and selected send mode survive onboarding interactions.
4. With a transmitter/relay output enabled, the warning identifies the output and prevents an accidental sample send.

## Approval gate

**Before implementation, request explicit approval for Work Package 02, especially the card copy, sample phrase, and external-output confirmation interaction.** After implementation, stop for the owner’s manual checks; do not proceed to package 03 without acceptance.

