# Work Package 08 — Scenario Wizard Core

**Priority:** 8 — strategic onboarding feature after first-use and accessibility foundations

**Proposed release:** R4 — Guided setup foundation

**Dependencies:** Packages 01, 03, and 05 accepted; package 07 task shortcuts may link to this wizard

## Goal

Create a short, navigable setup wizard for low-risk core journeys. A user chooses a goal, sees only relevant options, can move Back/Next without losing answers, and reviews a draft before applying it. This first increment covers **Try Morse**, **Practice receiving**, and **Decode CW from audio**. Educator and external-radio/relay paths are later packages 09 and 10.

## User-flow proposal — owner must approve before coding

1. **Choose a goal:** Try Morse; Practice receiving; Decode CW from radio/audio; or “I need a key/radio/relay setup” (links to existing full Settings until package 10).
2. **Choose relevant options:** For Practice, retain or adjust existing content/feedback choices and explicitly show that the pipeline is local-only. For Decode, choose available audio device/channel and explain that audio must be started and browser microphone permission may be requested if audio is already running or when the user starts it.
3. **Review:** Show every exact setting that will change and what will not change. The user explicitly chooses Apply or Cancel.
4. **Finish:** Explain the next user action (start audio, go to the relevant workspace, or open full Settings); do not auto-start or auto-send.

The owner must approve this flow, the labels, and the selected fields/defaults before implementation. Do not add questions or steps not listed here without approval.

## In scope

1. Add a standalone wizard component under `src/app/components/` and integrate it with the existing app/modal navigation. Keep the app’s no-router architecture and browser back-button depth behavior.
2. Use a typed in-memory draft based on current `AppSettings` values. Store only user-selected changes; do not mutate `SettingsService.settings()` while moving between steps.
3. Implement Back, Next, Skip (where optional), Cancel, and Review. Going Back retains entered answers; Cancel discards the draft and leaves live settings untouched.
4. Apply a minimal explicit patch once, only after the user confirms the final review. Keep `SettingsService` as the settings authority; do not call service-specific start/stop APIs from the wizard.
5. Allow direct exit to existing Settings/Help and retain all current expert controls.
6. Keep browser permission/device chooser requests attached to a clearly named, explicit user action. Explain a permission prompt immediately before the action when it is relevant. Never request access merely by opening the wizard or moving Back/Next.
7. Show unavailable browser APIs/devices as unavailable with a route to existing guidance; do not silently substitute another input/output.

## Safe configuration invariants

- The **Practice receiving** scenario must use `practicePipeline: 'local'` unless the user explicitly chooses otherwise in the existing advanced configuration. The wizard must not switch it to `'full'`.
- The **Decode CW** scenario may propose `cwInputEnabled` and `cwInputSource: 'rx'`; it must not call `getUserMedia` itself or start audio as a side effect of selecting a scenario. If applying the setting while audio is running can cause a permission prompt through existing effects, disclose that on Review and get explicit Apply confirmation before the prompt.
- Do not enable or modify transmitter/keying outputs (`optoEnabled`, `serialEnabled`/output mappings, `winkeyerEnabled`, `midiOutputEnabled`, `rtdbOutputEnabled`) in these core scenarios. Hardware scenarios require package 10.
- Preserve every setting the user did not explicitly choose, including independent mappings, device profile, RX/TX routing, input names/colors, calibration, buffers, and fullscreen display preferences.
- Applying setup updates current live settings but does **not** auto-save the device profile. Use the status contract from package 03.

## Out of scope

- Educator/group demonstration or setup of keyboard/mouse/touch hardware, physical transmitter keying, MIDI/serial, WinKeyer, or RTDB. Those are package 09/10 work.
- Named preset storage/recall (packages 11/12).
- New route architecture, settings-schema rewrite, automatic permissions, autoplay, or a general-purpose workflow engine.

## Implementation instructions

1. Before code, inspect `AppComponent` modal/history handling, `SettingsService.update()`, current settings effects, browser device enumeration, and every selected card's input/output behavior. Document how Apply affects already-running services.
2. Obtain explicit approval for the flow proposal, copy, and exact draft fields. Save no onboarding-choice marker that changes the meaning of existing saved settings without approval.
3. Keep wizard state local and typed. Do not duplicate `DEFAULT_SETTINGS`, device remapping, settings validation, or settings persistence.
4. On Apply, validate the draft against current capabilities and `settings.channelConflict()`; show blocking conflicts and an actionable route to Settings rather than applying an invalid state.
5. Keep Next/Back deterministic and accessible. On browser Back/close, ask whether to discard a non-empty draft; Cancel returns to the wizard and preserves the draft.
6. Add focused tests for every state transition, retained answers, cancel/no mutation, exact patch application, unsupported browser path, conflict handling, and no hardware-output mutation.

## Acceptance criteria

- The wizard can be entered, navigated backward/forward, skipped where allowed, cancelled, and reviewed without losing the draft.
- Before final Apply, no live setting or runtime service changes.
- Apply changes only fields shown in the approved summary; it does not silently reset unrelated settings or persist to the device profile.
- None of the core scenarios auto-starts audio, invokes a permission chooser before explicit action, sends Morse, or enables/changes an external keying/relay route.
- Existing modal history/back behavior and full Settings remain available.
- `npm test` and `npm run build` pass.

## Manual owner checkpoint — required before acceptance

Ask the owner to walk all three scenarios on Chrome/Edge, including browser Back, Cancel, Back/Next answer retention, current dirty settings, an unsupported/missing device, and a setup with external outputs already enabled. Verify that Apply changes only the summary-listed fields and that audio/permission prompts occur only at the disclosed explicit action.

## Approval gate

**Before implementation, request explicit approval for Work Package 08 and the exact flow/setting-diff proposal.** If any runtime effect, permission timing, or modal-history interaction is uncertain, pause and resolve it with the owner. Stop for manual owner acceptance before package 09.
