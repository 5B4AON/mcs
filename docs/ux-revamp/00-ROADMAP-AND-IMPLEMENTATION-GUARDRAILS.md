# UX Revamp — Prioritized Roadmap and Agent Guardrails

## Purpose and approval status

This folder contains the review and independently numbered implementation plans for making Morse Code Studio easier to discover and use without removing its current capability or flexibility.

- Review: [`UX-SECURITY-QUALITY-REVIEW.md`](./UX-SECURITY-QUALITY-REVIEW.md)
- Work packages: `01-audio-startup-and-recovery.md` through `13-intent-based-workspaces.md` in this folder.

These documents are proposals, not implementation authorization. **No package is approved merely because it is written here or because another package was approved.** Before editing code, the implementing agent must request and receive explicit owner approval for that numbered package. If design choices called out in a package have not been approved, stop and ask rather than choosing on the owner's behalf. At the end of each package, stop for the owner to run the specified manual checks and explicitly accept the behavior before beginning another package.

## Assessment of the review recommendations

| Rank | Recommendation | Value and applicability | Refined scope / decision |
|---|---|---|---|
| 1 | Explain and expose audio startup | Essential. Audio is a first-use prerequisite, and a failed multi-service startup can leave earlier services running while the UI reports audio as stopped. | Make the control understandable, report actual success/failure, and clean up partial startup. Do not imply microphone access is always needed. |
| 2 | Provide a simple first success | Essential. The current landing screen asks users to infer a starting action. | Add a non-blocking, reversible “Try Morse” path using the existing encoder and buffers. Never auto-play, auto-send, or silently bypass configured outputs. |
| 3 | Explain settings changes and persistence | Essential. `SettingsService.update()` changes live state; `save()` persists by device fingerprint. Saving with no fingerprint returns without an explanation, and closing Settings does not undo live changes. | State precisely what is live and what is saved; handle unavailable storage/profile cases. Do not promise “discard” unless it truly restores the prior state. |
| 4 | Address relay privacy | High value and directly relevant before making relay easier to configure. Client-side channel secrets and the sample open RTDB rules need plain-language context. | Improve in-app/help disclosure and explicitly distinguish public client configuration, channel capability tokens, and local browser storage. Do not change deployed rules, credentials, or anonymous-relay compatibility in a UX package. |
| 5 | Improve accessibility | Essential for every new path and existing modal. Current controls rely on icons, titles, and clickable non-button elements. | Correct semantics, names, focus behavior, and keyboard/touch operation in bounded surfaces. Do not use accessibility work as a reason for a visual redesign of unrelated screens. |
| 6 | Clarify practice | High value for learners; practice already exists and can be exposed without changing its sequence/scoring engine. | Explain current modes and disabled-field behavior; preserve sequence generation, scoring, timing, and local/full pipeline behavior. |
| 7 | Make current Settings easier to navigate by goal | Useful as an incremental improvement and as an always-available route to advanced settings. | Add task shortcuts into the existing cards; keep existing tabs/cards and every control in place. This is complementary to, not a substitute for, the later wizard. |
| 8 | Add a scenario setup wizard | High strategic value, but the highest regression risk because it touches settings and external outputs. | Start with safe core workflows and a draft/review/apply flow; require owner-approved exact fields/copy before coding. |
| 9 | Add educator/group demonstration path | High value for a named audience, using existing fullscreen views and settings. | Add an educator recipe as a separately testable extension to the accepted wizard; do not invent classroom accounts or analytics. |
| 10 | Add hardware/radio/relay setup path | High value for experienced operators, with elevated transmitter and privacy risk. | Add capability-aware routes into current cards; use a target-specific review before any newly enabled external output. |
| 11 | Save named presets | High value, independent of the wizard. Current per-device profiles solve a different problem. | Add named, user-managed presets in separate storage; keep RTDB secrets out by default, preview before apply, and resolve devices conservatively. |
| 12 | Connect presets to the wizard | Useful after both features work separately. Not required for either standalone feature. | Seed a wizard draft from a preset and optionally save an approved draft using package 11's existing preset service/policy. |
| 13 | Clarify operating workspaces | Valuable but a larger information-architecture change with risk to the combined conversation model. | Prototype and obtain explicit approval before implementing; make workspace changes presentational, not feature switches. Keep this last. |

### Ideas intentionally deferred or rejected

- **Do not autoplay a demo when entering Live mode.** This is surprising and can route audio or keying to configured outputs.
- **Do not invent calibration confidence percentages, sample histories, classroom reports, CSV exports, or live oscilloscope views in this roadmap.** The review did not establish that the current decoder/practice models provide valid data or that users need these features. Revisit only after user research and an explicit feature request.
- **Do not remove or bury an existing output, keyer, relay, practice mode, routing option, or full settings card.** Advanced controls may be progressively disclosed, but remain reachable.
- **Do not convert the whole app to routed pages or add a UI framework.** The app is currently a single-page standalone-component Angular app with modal/back-button behavior and no external UI library.
- **Do not silently activate, redirect, or test a transmitter/keying output.** Any new setup or preset flow must identify external outputs and require explicit review before enabling a previously disabled transmitter path.
- **Do not call password masking, a channel path secret, or client Firebase configuration “encryption” or “private messaging.”** The current relay trust model must be described accurately.

## Prioritized work-package list

1. **Audio activation and failure recovery** — obvious Start/Stop action; consistent, actionable errors; rollback on partial startup.
2. **Try Morse first-success path** — an approachable sample workflow using existing encode/play behavior with no automatic transmission.
3. **Live-versus-saved settings status** — accurately distinguish active edits from persisted device-profile settings; surface save failures.
4. **Relay privacy and credential disclosure** — bounded RTDB setup/help copy and local-storage disclosure.
5. **Accessible core controls and modals** — semantics, accessible names, focus management, keyboard operation, and touch-keyer parity.
6. **Practice workflow clarity** — explain modes and states without changing the practice engine.
7. **Task shortcuts in existing Settings** — intent-labelled routes to current settings cards without replacing tabs or cards.
8. **Scenario wizard core** — navigable draft/review/apply for safe local, practice, and decode workflows.
9. **Educator scenario** — guide group demos to existing fullscreen views and settings.
10. **Hardware/relay scenarios** — add carefully reviewed physical-key, transmitter-keying, and relay paths.
11. **Named user presets** — independently save, preview, recall, rename, duplicate, and delete configurations.
12. **Wizard/preset integration** — reuse accepted preset operations from the accepted wizard.
13. **Intent-based operating workspaces** — approved view model over existing activities and buffers.

## Proposed release roadmap

“Release” below means a coherent, independently buildable/deployable product increment, not a version number or permission to deploy. Each package remains separately reviewable and has its own human test/acceptance gate. Do not bump app version, publish, deploy, or change Firebase deployment configuration without separate owner instructions.

| Release | Packages | User-visible outcome | Why this is a coherent release |
|---|---|---|---|
| **R1 — A reliable first Morse session** | 01, 02, 03 | Users can see how to start, try an explicit sample, understand output safety, and know which settings are live versus saved. | Resolves the primary first-use barrier before adding new configuration architecture. |
| **R2 — Inclusive, trustworthy controls** | 04, 05 | Relay's trust/storage model is explained, and the most-used shell/modal controls can be discovered and operated accessibly. | Raises safety and accessibility quality before introducing wizard and preset surfaces. |
| **R3 — Practice and findability** | 06, 07 | Learners understand practice controls; goal-labelled shortcuts lead into the complete existing settings. | Improves current workflows without requiring a new wizard. |
| **R4 — Guided setup foundation** | 08 | A user can configure an approved safe core scenario through a reversible, reviewable wizard. | Wizard is independently useful before it handles specialist hardware or saved presets. |
| **R5 — Audience and station setup paths** | 09, 10 | Educators reach current demo views; operators receive guided input/output/relay choices with hardware safety review. | Both packages extend the accepted wizard; retain separate commits, owner approvals, and manual tests. Package 10 may ship later if its safety gates need more review. |
| **R6 — Recallable named configurations** | 11 | Users can manage named presets from Settings and apply one safely. | Presets are independently useful without wizard integration. |
| **R7 — Seamless saved-setup journeys** | 12 | Users can start from or save to named presets in the wizard without duplicating preset logic. | Integration follows the separately tested wizard and preset implementations. |
| **R8 — Clear operating workspaces** | 13 | Users can select a clearly named activity view while existing RX/TX functions continue. | Intentionally last because it changes navigation and needs a human-approved interaction prototype. |

Packages 04 and 05 can ship separately if either is ready first; keep them as separate commits and acceptance gates. The same applies to every package within a release. If the owner prefers faster security disclosure, package 04 may ship with R1; it does not depend on the other packages. R5's educator and hardware paths can also ship as separate increments, each with its own approval and manual test gate; package 11 remains after package 10 because it reuses package 10's tested external-output change classifier.

## Required implementation guardrails for every package

1. **Approval and scope:** Read the approved numbered plan and this roadmap first. Ask for explicit approval of that package before code changes. Keep the change within that package; do not opportunistically implement adjacent packages.
2. **Understand existing behavior:** Inspect all named files and their callers, settings effects, modal/history interactions, service lifecycle, and any relevant current help before editing. Record the existing behavior to preserve. Do not assume labels reflect runtime behavior.
3. **Preserve capability:** Keep current inputs, outputs, keyer modes, independent mappings, RX/TX routing/calibration, all three display buffers, practice modes, Firebase relay, fullscreen operations, mobile behavior, and existing device-profile loading/saving unless the owner separately approves a change. New UI should expose existing paths, not replace them.
4. **Hardware safety:** No new flow may autoplay or silently enable/redirect an external keying path (audio optocoupler, serial DTR/RTS, WinKeyer, MIDI output, or relay). Do not send a hardware test except after a user-initiated action with visible target and consequence. Preserve all existing active settings unless the user explicitly chooses a reviewed change.
5. **Angular/code conventions:** Follow `.github/copilot-instructions.md` and `.editorconfig`: Angular 19 standalone components, existing Signals/RxJS patterns, Angular template control flow, 2-space indentation, single quotes, TS header, JSDoc for public APIs, explicit lifecycle interfaces, and subscription cleanup. Keep logic in focused existing services/components; no new dependencies or UI framework.
6. **Settings integrity:** `AppSettings` and `DEFAULT_SETTINGS` live in `src/app/services/settings.service.ts`. Preserve schema/backfill behavior for old profiles. Do not mutate the existing `morseProfiles` device-fingerprint format when adding a different concept such as named presets.
7. **Accessibility and responsive behavior:** New actions need visible/accessible names, keyboard operation, visible focus, and usable touch targets. Check narrow mobile and desktop layouts. Do not rely on `title` alone for essential instructions.
8. **Tests and docs:** Add focused Jasmine/Karma specs for changed logic using the existing setup; no test specs currently exist. In package 01, the first package expected to add a spec, run that first spec with `npm test -- --watch=false --browsers=ChromeHeadless` and confirm the installed Angular/Karma setup discovers and executes it. Use this same non-watch headless command for later packages, plus `npm run build`. If ChromeHeadless is unavailable or the CLI reports no test inputs after adding the spec, pause and ask the owner before changing test configuration or introducing tooling. Update the relevant help chapter when user-facing behavior changes. Do not add a test framework, dependencies, or unrelated tests.
9. **Manual user checkpoint:** After implementation and automated validation, report exact manual test steps/results and ask the owner to test the package in the specified browsers/devices. **Stop and wait for explicit acceptance**; do not proceed to the next package or treat an automated build as UX sign-off.
10. **Security and release limits:** Never run Firebase deployment commands. Never put credentials in documentation, test fixtures, screenshots, or logs. Do not bump versions, update release notes, push, or deploy unless explicitly requested.
11. **Maintainability:** Prefer the smallest complete change. Add comments only where needed; document public service APIs and non-obvious domain/safety invariants with JSDoc. Do not perform broad renames or rewrites.

## Human approval ledger

No implementation packages are approved by this planning document. When reviewing a package, approve or request changes by its exact number and title. Suggested checkpoints:

- Before implementation: approve the numbered package and, where requested, its proposed UI wording/scenario layout.
- After the agent's automated validation: personally perform its listed manual checks and explicitly accept or report a defect.
- Before the next dependent package: accept its dependencies and the current package first.
