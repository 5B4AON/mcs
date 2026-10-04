# Work Package 14 — Settings Profile Portability

**Priority:** Early R1 addition — schedule immediately after Work Package 03

**Proposed release:** R1 — A reliable first Morse session

**Dependencies:** Work Package 03 accepted. Coordinate relay-secret wording with Work Package 04; do not block this package on later named-preset or wizard work.

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract) and numeric UI constraints. Keep import/export entry points within existing Settings surfaces or a focused modal; do not add persistent header controls, shrink controls/text, or require horizontal scrolling on the Galaxy S21 portrait layout.

## Goal

Let users export a portable settings snapshot and import it into another browser origin, such as a Firebase Hosting preview, to check settings migration/backfill without manually recreating every option. Keep this distinct from named user presets and the current automatically loaded per-audio-device profiles.

## Product contract — owner must approve before coding

- Export produces a user-initiated, versioned JSON file. It does not upload settings or change the active app.
- Relay input/output channel secrets are always omitted from the portable file. Import leaves the destination browser's existing secret values unchanged and clearly tells users why the relay credentials were not transferred.
- Device IDs and serial port indexes are not portable identities. Import must not route hardware to a different device, port, pin, or destination based on a stale identifier.
- Import first validates and previews the proposed changes. Cancel has no effect. Apply updates the current live settings through `SettingsService`; it does not silently save or overwrite the destination browser's per-device profile.
- Any newly enabled external keying or relay destination requires a separate, target-specific acknowledgement in the review flow. An unresolved destination remains disabled or unchanged until the user resolves it; there is no silent fallback.
- The owner runs any preview deployment. Preview and production share the configured RTDB, so relay checks use a throwaway channel and never a real operating channel.

Obtain owner approval for the exact file format/version policy, excluded fields, import review, and external-route acknowledgement before implementation.

## In scope

1. Add **Export settings** and **Import settings** actions within the existing Settings flow, without changing the compact top bar.
2. Export a versioned snapshot based on the supported `AppSettings` fields. Include enough format metadata to reject unsupported versions and safely normalize older supported versions.
3. Exclude `rtdbInputChannelSecret` and `rtdbOutputChannelSecret` from every export. Do not put secrets or raw exception details in filenames, UI summaries, diagnostics, or logs.
4. Validate imported JSON for format/version, shape, field types, and reasonable input size before it reaches `SettingsService`. Malformed, unsupported, or oversized files must fail visibly without partial changes.
5. Show a categorized before/after preview of all proposed changes. Preserve destination-only secrets and require explicit user choices for unresolved or ambiguous hardware references.
6. Before applying, identify every external keying/relay route that would be newly enabled or redirected. Require separate, explicit acknowledgement naming the output and target; block unresolved/ambiguous targets rather than substituting another device or system default.
7. On Apply, update only the reviewed, validated settings through the existing settings authority. Preserve package 03's contract: changes may take effect immediately, while persistence is a separate explicit **Save Settings** action for the current device profile.
8. Keep export/import separate from package 11's user-managed named presets. Do not change the `morseProfiles` storage schema, automatic fingerprint loading, or profile backfill behavior.

## Out of scope

- Cloud sync, server-side storage, public sharing, encryption claims, account management, or importing/exporting named presets.
- Automatically deploying preview channels, changing Firebase rules, or connecting to production/real relay channels for testing.
- Automatic device discovery/selection, opening browser permission prompts, opening serial/MIDI ports, sending Morse, or keying a transmitter during file selection or review.
- Changing which settings are enabled by default, device-profile migration behavior, or Save Settings semantics.

## Implementation instructions

1. Inspect `AppSettings`, `DEFAULT_SETTINGS`, current migration/backfill logic, `SettingsService.update()` and `save()`, and all effects of imported settings before designing the portable DTO.
2. Use an explicit allow-listed, versioned transfer format rather than serializing arbitrary service state or blindly spreading parsed JSON into `AppSettings`. Reject unknown future versions; define any supported older-version normalization before coding.
3. Validate and sanitize the complete file before displaying a preview. Do not partially apply a file on validation failure.
4. Treat audio labels as hints, not unique identities; route users to manual resolution when ambiguous. Never trust a serial `portIndex` or browser-scoped MIDI/audio ID as a durable identity.
5. Compare current and proposed external outputs with a pure side-effect-free classifier. Keep that policy reusable by Work Package 10 and named presets; do not duplicate conflicting route-safety rules.
6. Do not call service-specific start/stop, output-test, device-chooser, or Firebase methods from import. Apply only the owner-reviewed settings through `SettingsService`.
7. Pure data-format, validation, and route-classification unit tests may use the existing setup. Do not create or run automated Angular/component/template, DOM, browser, visual, or end-to-end UI tests; the owner performs all UI verification manually.

## Acceptance criteria

- A user can export a versioned JSON snapshot and import it into a different origin without network transfer or manual re-entry of supported settings.
- Export never includes either RTDB channel secret; import never overwrites destination secrets and explains this clearly.
- Invalid, unsupported, or oversized files leave live and saved settings unchanged and provide a useful recovery action.
- No setting changes before the user reviews and explicitly applies the complete proposed diff; cancelling leaves the app unchanged.
- Any newly enabled/redirected external route is shown by type and target and separately acknowledged; unresolved hardware never silently maps to another target.
- Applying updates only the reviewed settings through `SettingsService`; the user can distinguish live changes from explicit profile persistence.
- Existing per-device profile loading, save format, migration/backfill, and all unaffected settings continue to behave as before.
- No chooser, output test, transmission, or deployment happens automatically. `npm run build` passes; UI behavior is verified manually by the owner.

## Manual owner checkpoint — required before acceptance

The owner manually compares the affected Settings/import surfaces with the supplied Galaxy S21 portrait reference and checks the shared viewport matrix, including desktop resizing. Confirm that the existing text/control scale and top-bar footprint remain intact and that every action remains reachable without horizontal scrolling, clipping, or overlap.

Export a configuration and inspect the file to confirm both relay secrets are absent. Import it into a separate preview origin; inspect every change, cancel once and verify nothing changed, then repeat and apply only after reviewing the summary. Verify secrets already configured in the preview remain unchanged; check unsupported/corrupt/oversized input; confirm device mismatch and ambiguous labels require resolution; and verify an external route cannot be newly enabled without its exact target acknowledgement. Confirm the imported settings are live but not marked saved until the normal save action succeeds. If testing relay behavior, use a throwaway channel because preview and production share RTDB.

## Approval gate

**Before implementation, request explicit approval for Work Package 14**, especially the portable field allow-list, secret exclusion, import/apply behavior, and exact output acknowledgement. Do not deploy previews or contact production Firebase. Stop for owner manual verification and acceptance before proceeding with dependent implementation work.
