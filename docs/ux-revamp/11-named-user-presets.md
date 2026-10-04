# Work Package 11 — Named User Presets

**Priority:** 11 — recallable setups, independent of device profiles

**Proposed release:** R6 — Recallable named configurations

**Dependencies:** Packages 03, 04, and 10 accepted; reuse the pure external-output change classifier introduced in package 10

## Goal

Let a user save the current configuration under a meaningful name and later preview, recall, rename, duplicate, or delete it. Keep named user presets separate from the existing audio-device-fingerprint profiles.

## Product contract — owner must approve before coding

- A named preset is a user-created snapshot; it does not auto-load when devices change.
- The existing per-device profile remains the automatic device-specific working configuration.
- Applying a named preset is an explicit user action that replaces the preset-managed settings only after preview and confirmation; it does not silently overwrite values.
- RTDB channel secrets are excluded from named presets by default. Applying a preset with secrets omitted leaves the currently configured input/output secret values untouched and clearly labels them as not part of the preset.
- Hardware targets that cannot be safely identified are not silently mapped to System Default, the first device, or a reused serial port index. The user must resolve or explicitly disable them before that target is applied.

Obtain owner approval for this contract, the exact sensitive-field copy, and device-resolution behavior before implementation.

## In scope

1. Add a focused `PresetService` and a Settings entry point/management modal or section, using existing standalone Angular and Signals/RxJS conventions.
2. Provide actions: **Save current setup**, **Apply**, **Rename**, **Duplicate**, **Delete** (with confirmation), and cancel. Do not overwrite another preset when names collide.
3. Store presets under a separate localStorage key (proposed `morseNamedPresets`) with an explicit schema version; do not modify the `morseProfiles` structure or per-device profile load/save paths.
4. Snapshot a deep copy of supported settings, including nested mapping arrays/objects; identify omitted fields in the UI. Protect against mutation of a saved preset when the live settings change.
5. Exclude `rtdbInputChannelSecret` and `rtdbOutputChannelSecret` from snapshots by default. Do not blank the current secrets when applying. Do not log or reveal them.
6. Present a categorized before/after summary before Apply. Include all changed settings, and prominently list any external keying/relay destination that would be enabled or disabled. Reuse package 10's output-change classifier rather than duplicating route classification.
7. Apply only after confirmation. Require a target-specific acknowledgement before newly enabling a transmitter/keying path. If a required device target is unresolved or a browser chooser is needed, route to explicit resolution/connection and do not silently fall back.
8. Support non-empty trimmed names with a documented max length; compare names case-insensitively and reject duplicates with a useful inline message. Define and test behavior when localStorage is unavailable, malformed, or full.

## Device-reference rules

- Reuse the existing label-based remapping approach for audio device IDs where it is unambiguous. Do not assume display labels uniquely identify devices; an ambiguous/missing label requires user choice.
- Inspect MIDI device ID behavior and current enumeration. Resolve by a verified current device identity; if unavailable or ambiguous, ask the user to remap or leave that mapping unapplied/disabled.
- `portIndex` is not a durable serial-port identity. Never replay a saved index into a different granted port without user confirmation. Require the user to reselect or explicitly disable that mapping.
- Do not claim that a preset restores an exact physical connection when the browser requires fresh permission.

## Out of scope

- Cloud sync, import/export, preset sharing, account identity, encrypted local storage, cross-device profiles, and automatic preset switching.
- Modifying defaults or existing device-profile migration/backfill.
- Saving secrets through an implicit default or changing existing RTDB credentials behavior in `SettingsService.save()`.

## Implementation instructions

1. Inspect `src/app/services/settings.service.ts` for `AppSettings`, `DEFAULT_SETTINGS`, profile migration/backfill, and current localStorage error handling. Inspect audio/MIDI/serial mappings before designing DTOs.
2. Use a separate versioned DTO and storage key. Validate parsed data at runtime; reject malformed entries safely and never crash app initialization. Keep legacy `morseProfiles` values untouched.
3. Deep-clone/normalize supported data on save and read; test nested mapping independence. Do not spread secrets into errors, UI summaries, or diagnostic logs.
4. Add an explicit device-resolution stage before applying unavailable or ambiguous hardware routes. Never map an unresolved transmitter output to an arbitrary target.
5. Apply a confirmed snapshot through `SettingsService` only; do not call hardware output methods directly. Reflect package 03 semantics: preset application is live, while saving it into the current device profile is a separate action.
6. Guard browser storage failures and keep a visible unsaved/error state. Use no new dependency.
7. Add unit specs for schema validation, name uniqueness, clone isolation, storage errors, omitted secrets, device resolution, diff generation, cancel/no mutation, and external-output confirmation.

## Acceptance criteria

- Users can save, list, preview, apply, rename, duplicate, and delete named configurations.
- Named presets and device-fingerprint profiles remain separate, independently stored concepts.
- Applying is previewed, explicitly confirmed, and changes no live settings if cancelled.
- RTDB secrets are not in a new preset by default; omitted secrets remain unchanged on apply; UI explains this limitation and local browser storage.
- Missing/ambiguous audio/MIDI/serial targets require resolution; a serial index is never assumed durable.
- Any newly enabled external keying target is target-specific and explicitly confirmed; no output test or browser chooser runs automatically.
- Preset corruption/storage failure cannot crash the app or falsely indicate success; all existing per-device settings still load as before.
- `npm test` and `npm run build` pass.

## Manual owner checkpoint — required before acceptance

Ask the owner to create two named presets with different nested mappings, edit the active settings, preview/apply/cancel each preset, rename/duplicate/delete them, reload, and verify device-profile auto-loading still works. Test an unavailable audio/MIDI device and serial port, an ambiguous label, an enabled keying route, omitted relay secrets, and blocked localStorage.

## Approval gate

**Before implementation, request explicit approval for Work Package 11, especially whether relay secrets are excluded, the full-snapshot apply contract, and unresolved-device handling.** If the owner prefers portable/exportable or encrypted presets, stop and plan that separately. Stop for owner acceptance before package 12.
