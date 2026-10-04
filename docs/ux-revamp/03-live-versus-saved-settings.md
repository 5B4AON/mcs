# Work Package 03 — Live Changes Versus Saved Settings

**Priority:** 3 — prevent confusing or misleading settings behavior

**Proposed release:** R1 — A reliable first Morse session

**Dependencies:** None

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve screenshot-tested font, button, touch-target, and spacing scale. Keep save/status messaging within existing modal space or a focused dialog; do not widen persistent chrome or shrink current controls to make room.

## Goal

Explain the real contract of Settings: edits update the running app immediately, while **Save Settings** persists them in the profile for the current audio-device fingerprint. Make unavailable saves and storage failures visible; never imply that closing Settings discards live changes.

## Existing behavior and concrete omissions

- `SettingsService.update()` changes the settings signal and marks it dirty (`src/app/services/settings.service.ts:957-961`).
- `SettingsService.save()` persists a snapshot only when `currentFingerprint()` exists; otherwise it returns silently (`src/app/services/settings.service.ts:1022-1044`).
- The Settings modal footer shows “Save Settings”/“Saved ✓” but does not explain live versus persisted state (`src/app/components/settings-modal/settings-modal.component.html:67-70`).
- Closing the modal emits `closed` without restoring the previous profile (`src/app/components/settings-modal/settings-modal.component.ts:82-85`). Thus unsaved edits remain active during this app session.

## In scope

1. Add concise, persistent explanatory copy in the Settings modal: changed settings take effect now; Save stores them for the current device profile/future sessions.
2. While dirty, show a clear status such as “Changes are active now but not saved.” Closing Settings must not be described as undo/discard.
3. When no device fingerprint/profile is available, do not present a successful save. Disable the save action with an explanation or provide a clear next action to enumerate/select devices; do not silently return.
4. Handle `localStorage` write errors (including quota/security exceptions) without falsely clearing `isDirty` or showing “Saved ✓”; provide a recoverable message.
5. Preserve the current immediate-apply behavior, device-specific profile behavior, settings validation banner, reset confirmation, and output effects.

## Out of scope

- Converting all settings into a transactional draft, changing when services react, or making the modal close roll back runtime changes.
- Adding a new export/import format or changing existing profile schema/backfill rules.
- Changing settings auto-save/persistence semantics beyond explaining and reporting the existing contract.

Settings export/import is intentionally a separate early package: see [Work Package 14](./14-settings-profile-portability.md). Package 03 remains independently implementable and must be accepted before package 14 begins.

## Implementation instructions

1. Before coding, trace where `currentFingerprint` is set, the refresh-device flow, the `needsValidation` state, and all calls to `save()`.
2. Keep a single source of truth for whether persistence succeeded. Prefer returning an explicit result from the service (saved / no profile / storage failure) rather than inferring success from a click.
3. Do not set `isDirty` false unless the profile write completed successfully. Catch storage failures at the persistence boundary and expose a typed, non-sensitive result to the modal.
4. Do not add a “Discard” button. If a later design asks for discard, first design a real snapshot/revert flow with runtime side-effect review and get separate owner approval.
5. Do not create or run automated UI/component/browser tests. The owner manually verifies live/save status, errors, and close/reopen behavior in the checkpoint below.

## Acceptance criteria

- Users can tell whether a setting is active, saved, or not yet persistable.
- Closing a dirty modal never claims to undo its changes.
- Save with no fingerprint and a storage exception both have visible, accurate outcomes; neither reports a false success.
- A successful save continues to use the existing device-specific profile format and label-based audio-device remapping.
- Current immediate settings/service effects, reset confirmation, and validation behavior are unchanged.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Ask the owner to compare the changed Settings surface with the supplied mobile reference screenshots and a representative physical phone at the measured portrait CSS viewport, plus desktop at narrow, typical, and wide window sizes while resizing. Confirm the established relative font/control scale is preserved and the new status fits without crowding or obscuring controls. Then edit a setting and observe its immediate effect; close and reopen Settings; reload the app; compare unsaved and saved behavior; test a no-device/no-fingerprint situation; and simulate blocked/full local storage if practical. Confirm wording distinguishes “active now” from “saved for this device.”

## Approval gate

**Before implementation, request explicit approval for Work Package 03.** If the owner wants discard/rollback behavior rather than the narrowly scoped status clarification, pause and propose that as a separate package. Stop for manual owner acceptance before package 04.
