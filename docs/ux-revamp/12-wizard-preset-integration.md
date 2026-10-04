# Work Package 12 — Integrate Named Presets with the Wizard

**Priority:** 12 — remove duplicated setup effort after the two features are accepted

**Proposed release:** R7 — Seamless saved-setup journeys

**Dependencies:** Packages 08, 09, 10, and 11 accepted; do not build a second preset implementation

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve screenshot-tested font, button, touch-target, and spacing scale. Integrate preset choices into existing wizard steps/review; do not add a persistent toolbar row or squeeze/shrink wizard controls on the Galaxy S21 portrait.

## Goal

Allow users to start a wizard draft from an accepted named preset and optionally save the reviewed wizard result as a named preset. Reuse the existing preset validation, sensitive-field policy, device resolution, diff, and safety confirmation.

## In scope

1. At the wizard's first step, offer **Start from a saved preset** as optional. Selecting one copies its validated values into the in-memory draft; it must not apply settings immediately.
2. Let the user review and adjust the draft through all wizard steps; Back/Next preserve both preset-derived values and new answers.
3. At final Review, optionally **Save this setup as a named preset**, using the existing preset service's name rules, storage errors, omitted-secret policy, and duplicate handling.
4. Applying remains a separate explicit action with the same output safety acknowledgement, device-target resolution, conflict checks, and profile-persistence semantics as the standalone features.
5. Cancelling the wizard leaves active settings and all saved presets unchanged. Saving the draft as a preset without applying it is permitted only if the owner approves that exact interaction and the UI clearly distinguishes “save draft” from “apply now.”
6. An unavailable preset version or invalid stored preset shows a recoverable explanation and does not partially load/apply it.

## Out of scope

- Duplicate preset storage models, a second secret policy, automatic preset selection, or cross-device sync. Named-preset file transfer is implemented in the Work Package 11 preset manager; the wizard may link to that manager but must not duplicate its import/export flow.
- Changing wizard scenarios or preset behavior beyond the points required for integration.
- Automatically saving/applying when a user selects a preset.

## Implementation instructions

1. Obtain owner approval for the first-step entry point and final-review save interaction. Reuse the accepted component/API; if its API cannot support in-memory draft loading, propose the smallest service extension before coding.
2. Treat a preset as immutable source data: deep-copy into the draft and prove editing a wizard answer does not change the saved preset.
3. Keep saved preset selection, wizard draft state, active `SettingsService` state, and device-profile persistence separate.
4. Reuse the same final apply function for wizard-built drafts and saved-preset-derived drafts. Do not duplicate output safety checks or device remapping.
5. Do not create or run automated wizard/component/DOM/browser tests. The owner manually verifies preset selection, draft retention, save/apply separation, cancellation, and shared safety behavior using the checkpoint below.

## Acceptance criteria

- Choosing a preset only seeds the draft; the live app remains unchanged until final Apply.
- Back/Next and scenario changes do not mutate the saved preset.
- Saving through the wizard creates a preset using exactly the package 11 schema, name rules, and secret exclusions.
- Final Apply has identical conflict checks, device-resolution behavior, external-output confirmation, and live-versus-saved messaging regardless of draft origin.
- Cancel/failure changes neither live settings nor an existing preset.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Ask the owner to compare the integrated flow with the supplied screenshots while selecting a saved preset on a Samsung Galaxy S21 in portrait and on desktop at narrow, typical, and wide widths while resizing. Confirm screenshot-relative font/control scale is retained; integrated controls fit and remain discoverable without horizontal scrolling or loss of top-bar actions. Alter values, navigate back and forth, cancel, re-open the preset manager, then repeat and apply. Verify the preset remains unchanged until an explicit save, and that hardware routes, relay credentials, unresolved devices, and device-profile Save behave exactly like the standalone screens.

## Approval gate

**Before implementation, request explicit approval for Work Package 12.** If the owner does not want saving a draft separately from applying it, remove that option rather than inventing semantics. Stop for owner acceptance before package 13.
