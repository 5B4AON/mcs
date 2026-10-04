# Work Package 01 — Audio Activation and Failure Recovery

**Priority:** 1 — first-use blocker and lifecycle correctness

**Proposed release:** R1 — A reliable first Morse session

**Dependencies:** None

## Goal

Make it clear when audio is stopped, starting, running, or unavailable, and make a failed start leave no partially running audio pipeline behind. Keep Start Audio under an explicit user action and preserve browser permission behavior.

## Existing behavior to preserve and logic risk

- The audio control in `src/app/app.component.html:9-18` is an icon-only button whose state text is only a `title`.
- `src/app/app.component.ts:665-690` starts mic input only when enabled, starts CW input (which itself returns if disabled), then starts audio output. `audioRunning` and the localStorage running marker are set only after all starts complete.
- If a later `start()` rejects, earlier successfully started services are not stopped in this catch-free user-start path. The `finally` only clears `audioStarting`; the UI can report stopped while a prior service still owns a stream/context.
- Auto-start in `AppComponent.autoStartAudio()` has a catch, but it clears the stored marker without stopping any earlier service that already started.
- Do not tell users that every audio start requests microphone permission. Mic and CW input request `getUserMedia` only when their respective settings are enabled. Output setup is a distinct concern.

## In scope

1. Give the idle primary control a visible **Start audio** label and the running control an unambiguous **Stop audio** label. Maintain responsive sizing; at narrow widths, retain an accessible name and enough visible state to identify the control.
2. Add a compact nearby explanation/status that says what is currently enabled and only describes microphone permission when an enabled mic/CW input will request it.
3. Represent startup failure visibly and in plain language. Provide the error category when known (permission denied, device absent/in use, unsupported browser, or other startup failure) and one relevant next action. Do not display raw exception dumps.
4. Make user-start and remembered auto-start converge on the same lifecycle/status/error handling where possible.
5. Make start failure perform best-effort cleanup of every service/context that may have started, reset transient key-down/UI state, and leave the persisted running marker consistent with the final state. Do not stop unrelated MIDI/serial/RTDB services as part of an audio rollback.
6. If stop encounters an error, still attempt cleanup of the remaining audio services, avoid leaving the UI indefinitely busy, and show whether audio is safely stopped or needs a retry.

## Out of scope

- Changing which inputs/outputs are enabled by default, requesting permission earlier, or adding a permission pre-prompt.
- Changing Morse timing, decoder calibration, keyer behavior, output routing, or device selection.
- Adding a toast/dialog library, changing the overall header, or auto-starting audio on a first visit.

## Implementation instructions

1. Before editing, trace `AudioInputService`, `CwInputService`, and `AudioOutputService` `start()`/`stop()` behavior. Check when their internal `started` flags become true and whether `stop()` is safe after a partially completed `start()`.
2. Introduce only the state needed for a stable audio status/error in `AppComponent`; clear stale failure text on a new attempt or successful start.
3. Implement one best-effort rollback helper for audio services. Attempt cleanup independently, in reverse startup order where safe, so one rejected `stop()` does not prevent other resources from being released. Do not report a successful start until all configured audio starts complete.
4. Apply the same result rules to auto-start. A failed auto-start must be visible to the user and recoverable with the same explicit Start action; do not silently reattempt in a loop.
5. In the template, use a native button with a state-dependent visible label and programmatic accessible name. Keep the existing icon as supplementary decoration.
6. Add focused specs for success, each configured input combination, a later-service startup rejection and rollback, auto-start rejection, and stop rejection/continued cleanup. Use mocks; no real microphone or transmitter in automated tests.

## Acceptance criteria

- Users can identify Start/Stop Audio without hovering.
- A successful start shows a distinct running state; a failed start never claims audio is running.
- Each configured mic/CW input permission failure has an accurate, actionable explanation. When neither input is enabled, the UI does not claim microphone permission is needed.
- A failure after any earlier service started triggers best-effort cleanup and leaves no running localStorage marker.
- Auto-start and user-start give consistent visible error/recovery states.
- No changes to serial, MIDI, WinKeyer, Firebase, or external output activation semantics.
- `npm test` and `npm run build` pass.

## Manual owner checkpoint — required before acceptance

Ask the owner to check on Chrome or Edge:

1. Start with mic and CW inputs disabled: confirm the control explains audio activation without claiming microphone access is required.
2. Enable an input and allow permission; then deny/revoke permission and verify the corresponding success/failure states and recovery.
3. Simulate or reproduce an unavailable/in-use device and confirm the UI does not stay in a spinner state.
4. Reload after a previously running session and verify failed auto-start is visible and can be retried.
5. Confirm Stop Audio actually releases audio and does not stop configured serial/MIDI/relay services.

## Approval gate

**Before implementation, request explicit approval for Work Package 01.** If error wording or the proposed behavior during stop failure needs a product decision, ask the owner first. After code/tests, stop and ask the owner to complete the manual checkpoint; do not begin package 02 without acceptance.
