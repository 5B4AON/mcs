# Morse Code Studio — Project Guidelines

## Overview
Browser-based Morse code encoder/decoder/keyer built with **Angular 19** (standalone components, no NgModules). Runs entirely client-side — no backend server. Uses Web Audio API, Web Serial API, Web MIDI API, and Firebase RTDB for real-time relay.

## Code Style
- **2-space indentation**, single quotes, UTF-8 — see [.editorconfig](../.editorconfig)
- No ESLint or Prettier configured; follow existing patterns
- Every `.ts` file starts with the header:
  ```ts
  /**
   * Morse Code Studio
   */
  ```
- JSDoc on classes and public methods with domain-relevant explanations
- RxJS observables use `$` suffix (`keyEvent$`, `level$`)
- `readonly` on signal properties; private fields without `_` prefix
- Lifecycle interfaces explicitly declared (`implements OnInit, OnDestroy`)
- Constructor injection with `public` for template-accessed services, `private` for internal

## Architecture
- **Single-page app with no routing** — `app.routes.ts` has empty routes array. Navigation is modal-based with `history.pushState`/`popstate` back-button support tracked via `modalHistoryDepth`
- **All components are standalone** — import `FormsModule` directly where needed, no barrel files
- **Singleton services** in `src/app/services/` using `@Injectable({ providedIn: 'root' })`
- **Signal + RxJS hybrid**: signals for synchronous state, RxJS Subjects for async event streams, `effect()` to bridge signals to side effects
- **Firebase via raw SDK** (`firebase/app`, `firebase/database`) — not `@angular/fire`
- **No external UI libraries** — all custom CSS, inline SVGs, dark theme (`#1a1a2e`)
- **Settings persistence**: `SettingsService` stores per-device profiles in `localStorage` keyed by audio device fingerprint

## Project Structure

### Source layout
```
src/app/
├── app.component.*          — root component: main UI, toolbar, orchestrates all modals
├── app.config.ts            — Angular app config (providers)
├── app.routes.ts            — empty routes array (no routing)
├── firebase.config.ts       — Firebase RTDB credentials
├── morse-table.ts           — MORSE_TABLE, MORSE_REVERSE, timingsFromWpm()
├── version.ts               — app version constant (keep in sync with package.json)
├── web-serial.d.ts          — Web Serial API type declarations
├── data/                    — static data files
│   ├── practice-words.ts    — common English word list for copy practice
│   └── callsign-prefixes.ts — international callsign prefix database
├── services/                — singleton services (providedIn: 'root')
│   ├── settings.service.ts  — central settings signal + localStorage persistence
│   ├── settings-transfer.ts     — versioned secret-free settings snapshot format + validation (pure)
│   ├── settings-transfer-review.ts — import preparation, grouped change list, route comparison (pure)
│   ├── settings-presets.ts      — preset name rules, storage format (`morsePresets`), parsing (pure)
│   ├── preset.service.ts        — named presets store (separate from `morseProfiles`)
│   ├── audio-device.service.ts — audio device enumeration & fingerprinting
│   ├── audio-input.service.ts  — microphone capture + AudioWorklet processing
│   ├── audio-output.service.ts — audio playback (keyed tone generation)
│   ├── cw-input.service.ts     — CW tone detection via Goertzel AudioWorklet
│   ├── morse-decoder.service.ts — timing→character decoding
│   ├── morse-encoder.service.ts — text→Morse encoding + keyed output
│   ├── keyer.service.ts         — iambic/straight keyer logic
│   ├── display-buffer.service.ts — decoded/encoded text buffer + prosign actions
│   ├── serial-key-output.service.ts — Web Serial DTR/RTS radio keying
│   ├── serial-key-input.service.ts  — Web Serial DSR/CTS/DCD/RI key/paddle input
│   ├── winkeyer-output.service.ts   — WinKeyer serial protocol
│   ├── midi-input.service.ts   — Web MIDI input
│   ├── midi-output.service.ts  — Web MIDI output
│   ├── firebase-rtdb.service.ts — Firebase RTDB relay (send/receive)
│   ├── mouse-keyer.service.ts  — mouse-based keyer input
│   ├── loop-detection.service.ts — prevents audio feedback loops
│   ├── wake-lock.service.ts   — Screen Wake Lock API
│   ├── vibration-output.service.ts — Vibration API output
│   └── practice.service.ts     — copy practice sequence generation + scoring
└── components/
    ├── settings-items/      — reusable settings items shared by Settings and setup wizards (Wizard v2 refactor, issue #57): `settings-scope.ts` (SETTINGS_SCOPE token), `live-settings-scope.ts`, `draft-settings-scope.ts`, `item-descriptor.ts` (conventions), `item-registry.ts`, `item-shell/` (card/embedded frame; slots `[item-badges]`, `[item-header-extra]`), `identity-field/` (name + colour picker), `sidetone/` (pilot item), `speed/` (Morse Speeds: encoder, keyer, RX/TX decoder start speeds; `show` input picks which), `farnsworth/` (Farnsworth card, shared by Settings and wizard), `audio-output/` (opto key output), `vibration/`, `encoder/` (Keyboard Encoder), `midi-output/` (MIDI Output card: switch, mapping list/popup and WPM override in Settings; switch and override only in a wizard step; start/stop/reattach only when live), `midi-input/` (MIDI Input card: master switch + list/popup in Settings; switch only in a wizard step; device start/stop and reattach only when the scope is live), `mouse-keyer/`, `touch-keyer/`, `sprite-key/` (cards in Settings, flat in a wizard step), `keyboard-keyer/` (Keyboard Keyer card: master switch + mapping list/popup in Settings; switch only in a wizard step, mappings are repeat-step pages), `practice/`, `text-blur/`, `show-prosigns/`, `prosign-actions/`, `emojis/` (hosts the emoji edit modal), `mapping/` (shared mapping pieces: `mapping-list/` rows + add, `mapping-edit-dialog/` Settings popup frame, `keyboard-mapping-editor/`, `midi-input-mapping-editor/` and `midi-output-mapping-editor/` frameless field editors with `build()` validation, `identity-field`-style `identity-fields/`, `detect-button/`, `capture-slot.ts`, global `mapping-fields.css` with `md-*` classes). Settings opens an editor inside the popup; wizard pages show the same editor flat. The serial in/out cards adopt these in their own item issues
    ├── wizard-v2/           — Wizard v2 (issue #57), built beside the old wizard: `engine/flow-types.ts` (declarative flow/step/question types), `engine/conditions.ts` (named step conditions), `engine/wizard-engine.ts` (pure state machine over a DraftSettingsScope: navigation, change detection, Revert, validation, review, apply patch, route/conflict checks), `pages/mapping-page.component.ts` (hosts one mapping editor flat; `commit()`/`isDirty()`/`reset()`), repeat steps (`repeat: { list, item }` in a flow; the engine expands them into one page per mapping plus a list page with add/open/delete, tracks each mapping's starting state for Revert; kinds are in `settings-items/mapping/mapping-registry.ts`), `flows/shared-steps.ts` (`speedStep()`, `farnsworthStep()` for every goal that sends Morse), `flows/*.flow.ts` (one declarative file per goal; `demo.flow.ts` is temporary), `flows/flow-registry.ts` (start list; `MIGRATED` gets each goal's flow), `setup-wizard-v2.component.*` (dialog shell: goal list via the existing goal-navigator modal, step host with questions + registered items via `NgComponentOutlet`, shared Review/Done, presets; provides its own `DraftSettingsScope`; reuses the old wizard CSS)
    ├── settings-modal/      — settings dialog (3 tab children, each with card children)
    │   ├── settings-modal.component.*   — tab container + reset/export/import buttons
    │   ├── goal-navigator/              — plain goal list hosted by the Setup Wizard modal; `setup-goals.ts` is the shared goal table (labels, landings, icons, wizard ids)
    │   ├── emoji-edit-modal/            — emoji mapping editor modal (opened by emojis item)
    │   ├── emoji-picker/                — emoji selection popup (used by emoji-edit-modal)
    │   ├── keyboard-input-edit-modal/   — keyboard key mapping popup (thin: `app-mapping-edit-dialog` + `app-keyboard-mapping-editor`)
    │   ├── midi-input-edit-modal/       — MIDI input mapping popup (thin: `app-mapping-edit-dialog` + `app-midi-input-mapping-editor`)
    │   ├── midi-output-edit-modal/      — MIDI output mapping editor modal
    │   ├── serial-input-edit-modal/     — serial input mapping editor modal
    │   ├── serial-output-edit-modal/    — serial output mapping editor modal
    │   ├── settings-shared.css          — shared card styles (loaded globally via angular.json)
    │   ├── settings-inputs-tab/         — thin shell hosting 8 input card components
    │   │   ├── mic-card/
    │   │   ├── cw-detector-card/
    │   │   ├── (keyboard-keyer moved to settings-items/keyboard-keyer/)
    │   │   ├── (mouse-keyer, touch-keyer, sprite-key moved to settings-items/)
    │   │   ├── (midi-input moved to settings-items/midi-input/)
    │   │   ├── serial-input-card/
    │   │   └── rtdb-input-card/
    │   ├── settings-outputs-tab/        — thin shell hosting 7 output card components
    │   │   ├── (audio-output moved to settings-items/audio-output/)
    │   │   ├── serial-output-card/
    │   │   ├── winkeyer-card/
    │   │   ├── rtdb-output-card/
    │   │   ├── (midi-output moved to settings-items/midi-output/)
    │   │   ├── (sidetone moved to settings-items/sidetone/)
    │   │   └── (vibration moved to settings-items/vibration/)
    │   └── settings-other-tab/          — thin shell hosting the Other cards (wake lock is still a card)
    │       ├── wake-lock-card/
    │       ├── (moved to settings-items/: text-blur, show-prosigns, prosign-actions, emojis, practice)
    │       ├── (farnsworth moved to settings-items/farnsworth/; Morse Speeds item `settings-items/speed/` is first in this tab)
    │          
    ├── fullscreen-modal/    — unified fullscreen conversation view
    │   ├── fullscreen-modal.component.* — container
    │   ├── fullscreen-format.utils.ts   — shared formatting utilities
    │   ├── fs-toolbar/      — fullscreen conversation toolbar
    │   └── fs-conversation-view/ — unified conversation with temporary Key/Type input
    ├── help/                — help system (chapter components + diagrams)
    │   ├── help.component.*             — shell with table of contents
    │   ├── help-ch-*.component.*        — individual chapter components (HTML-only content)
    │   └── diagrams/                    — SVG wiring diagrams
    ├── confirm-dialog/      — reusable confirmation dialog
    ├── goal-navigator-modal/ — standalone "Setup Wizard" modal (Settings-sized): goal list, toolbar buttons for Presets, Settings and Close
    ├── setup-wizard/        — guided setup dialog (draft-only; `setup-wizard-draft.ts` holds steps, fields, limits, review and validation as pure functions)
    └── symbols-ref/         — Morse code symbol reference panel
```

### Component hierarchy
```
AppComponent
├── SettingsModalComponent
│   ├── SettingsInputsTabComponent → 8 *-card components
│   ├── SettingsOutputsTabComponent → 7 *-card components
│   ├── SettingsOtherTabComponent → 7 *-card components
│   └── ConfirmDialogComponent (reset confirmation)
├── GoalNavigatorModalComponent (Setup Wizard) → GoalNavigatorComponent
├── SetupWizardComponent (opened from the goal navigator modal, above it)
├── SetupWizardV2Component (temporary kebab entry; replaces the old wizard at cutover)
├── FullscreenModalComponent
│   ├── FsToolbarComponent
│   └── FsConversationViewComponent (unified conversation)
├── HelpComponent → help-ch-* chapter components
├── SymbolsRefComponent
├── EmojiPickerComponent
├── MidiInputEditModalComponent
├── MidiOutputEditModalComponent
├── SerialInputEditModalComponent
└── SerialOutputEditModalComponent
```

### Key interdependencies to be aware of
- **`SettingsService`** is the central hub — nearly every service and card component reads from `settings.settings()`. Changes to `AppSettings` interface or `DEFAULT_SETTINGS` affect the entire app.
- **`AppSettings` interface + `DEFAULT_SETTINGS`** (both in `settings.service.ts`): when adding a new setting, update the interface, add a default, and add the UI control in the appropriate settings card component.
- **Prosign actions pipeline**: prosign keys are defined in `settings-items/prosign-actions/prosign-actions-item.component.ts` (`prosignKeys` array), their defaults in `DEFAULT_SETTINGS.prosignActions` (settings.service.ts), and they are consumed at runtime by `DisplayBufferService.handleProsignAction()`. All three must stay in sync.
- **Emoji mappings pipeline**: emoji defaults in `DEFAULT_SETTINGS.emojiMappings`, UI in `settings-items/emojis` + `EmojiEditModalComponent`, runtime processing in `DisplayBufferService`.
- **Farnsworth / Wordsworth timing pipeline**: settings (`farnsworthEnabled`, etc.) in `AppSettings` + `DEFAULT_SETTINGS`, UI in `settings-items/farnsworth/`, timing math in `adjustGapTimings()` (morse-table.ts). Applied at runtime in `MorseEncoderService.sendCharacter()`, `startWordGapTimer()`, `playRxChar()` and `MidiOutputService.playCharElements()`. WinKeyer is excluded (hardware-timed).
- **Keyboard input mappings pipeline**: `KeyboardInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.keyboardInputMappings`, UI in `settings-items/keyboard-keyer` + `KeyboardInputEditModalComponent`, runtime in `KeyerService` (per-mapping straight key state + independent paddle keyer per mapping).
- **MIDI input mappings pipeline**: `MidiInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.midiInputMappings`, UI in `MidiInputItemComponent` (settings-items/midi-input) + `MidiInputEditModalComponent`, runtime in `MidiInputService` (per-mapping independent iambic keyer).
- **MIDI output mappings pipeline**: `MidiOutputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.midiOutputMappings`, UI in `MidiOutputItemComponent` (settings-items/midi-output) + `MidiOutputEditModalComponent` (frames `midi-output-mapping-editor`), runtime in `MidiOutputService`.
- **Serial input mappings pipeline**: `SerialInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.serialInputMappings`, UI in `serial-input-card` + `SerialInputEditModalComponent`, runtime in `SerialKeyInputService` (per-mapping independent iambic keyer, similar to MIDI input). Each mapping has optional `name`/`color` for multi-user fullscreen conversation views.
- **Serial output mappings pipeline**: `SerialOutputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.serialOutputMappings`, UI in `serial-output-card` + `SerialOutputEditModalComponent`, runtime in `SerialKeyOutputService`. Each mapping specifies `portIndex`, `pin` (DTR/RTS), `invert`, and `forward` (OutputForward). Multiple mappings can target different ports or different pins on the same port.
- **Setup Wizard pipeline**: `setup-goals.ts` is the single goal table (`MAIN_GOALS`, `MORE_GOALS`, `LANDINGS`, `goalForWizard()`); WP09/WP10 add rows and wizards there. `GoalNavigatorModalComponent` is its own modal (same box as Settings, `showGoals` in `AppComponent`), opened by `AppComponent.openGoals()` from the kebab menu, the Try Morse dialog and a wand button in the Settings toolbar. Main goals are always visible; only "More goals" expands. A goal with a `wizard` id opens `SetupWizardComponent` via `wizardRequested`; other goals emit `goalSelected(landing)`, and `AppComponent.goalsToSettings(landing)` swaps to Settings with `startLanding`, which reveals the card (`revealCard()`, `goal-opened` outline in `settings-shared.css`) and shows a dismissible hint dialog with the `hint`/`next` text. Goals and Settings swap (`goalsToSettings`/`settingsToGoals`) while keeping one history entry. Presets opens from the goals modal through `SettingsModalComponent` in `presetsOnly` mode (no Settings behind it; `presetsDismissed` returns to the goals). Navigation never changes settings.
- **Setup wizard (WP08)**: wizards for `type`, `practice` and `decode` keep a draft separate from live settings; Skip restores a step's fields, Apply calls `SettingsService.update()` with only the reviewed changed keys (the practice wizard also forces `practiceEnabled` and the `'local'` pipeline), and the wizard never changes encoder mode or enables an output route. `findChannelConflicts()` (exported from `settings.service.ts`) blocks new audio-channel conflicts. Two deliberate exceptions, each only on an explicit click: "Turn audio output off" (sidetone and opto) and "Turn on the detector" / "Apply and turn on detector" (the app then starts the detector only if audio is already running; audio and microphone access are never started by the wizard). Wizard `z-index` 8500: above Settings, below the confirm dialog. The wizard closes with Back/Escape through `AppComponent.closeActiveModal` and asks before discarding answers; `onWizardTry()` leaves wizard and Settings together to the main screen.
- **Icon pills**: kebab and dialog pills with a `.pill-icon` get their layout from `src/styles.css` (icon at the left, label centred) because `app.component.css` is at its size budget.
- **Presets pipeline**: the Presets dialog (header button in `settings-modal`) saves/updates (overwrites with current settings)/renames/duplicates/deletes/exports/imports named presets via `PresetService` (key `morsePresets`, separate from `morseProfiles`, max 40-char case-insensitive names). Files use the `mcs-settings` v1 format from `settings-transfer.ts` (no RTDB secrets). Import only adds a preset; apply goes through `prepareSettingsImport` review with per-route acknowledgements, then `SettingsService.update()` without saving the profile.
- **Settings card CSS** (`settings-shared.css`, `settings-outputs-tab.component.css`, `settings-other-tab.component.css`) is loaded **globally** via `angular.json` `styles` array — not via component `styleUrls`. Card components use `styles: [':host { display: contents; }']` only. Do NOT add these CSS files back into component `styleUrls` or the bundle will bloat.
- **Fullscreen modal CSS** lives in each component's own stylesheet (`fs-conversation-view` owns the conversation, practice and touch-overlay styles). The fullscreen toolbar owns the compact temporary Key/Type toggle beside Close; it defaults to Key and neither saves a setting nor activates an output. Type uses a hidden native input to support physical and mobile keyboards while text renders inline; only mapped physical keyboard keying is suspended, while mouse/touch and other inputs remain active.
- **Morse table** (`morse-table.ts`): `MORSE_TABLE` maps characters/prosigns to dot-dash strings; `MORSE_REVERSE` is the inverse. Changes to the table can affect encoding, decoding, and the symbols reference panel.
- **`DisplayBufferService`** bridges decoded/encoded text with prosign actions and emoji replacements — changes to prosign or emoji logic converge here. `mainOutput` and `fullscreenConversation` are independent persistent FIFO buffers; the direct full-screen action has no submenu.
- **Audio chain**: `AudioDeviceService` → `AudioInputService` → `CwInputService` (detection) → `MorseDecoderService` (decode). Output: `MorseEncoderService` → `AudioOutputService` + optional `SerialKeyOutputService` / `WinkeyerOutputService` / `MidiOutputService` / `FirebaseRtdbService`.
- **Serial input/output muting**: `SerialKeyOutputService.isSending` signal (with 30 ms holdoff per mapping) prevents `SerialKeyInputService` from processing key-down events while output is active — same pattern as `MidiOutputService.isSending` / `MidiInputService`. `SerialKeyInputService` has its own independent iambic keyer per mapping (like `MidiInputService`), bypassing `KeyerService` entirely.
- **Serial port sharing**: when serial input and output mappings use the same port index, `SerialKeyInputService` piggybacks on `SerialKeyOutputService.getOpenPort(portIndex)` instead of opening a second connection. The output service exposes an `openPorts` signal (Map<number, PortState>) and a `getOpenPort(portIndex)` method for this purpose.
- **Copy practice pipeline**: settings (`practiceEnabled`, `practiceContentMode`, `practiceFeedbackMode`, `practicePipeline`, etc.) in `AppSettings` + `DEFAULT_SETTINGS`, UI in `settings-items/practice`, sequence generation + scoring in `PracticeService`, playback via `MorseEncoderService.submitText()`. Practice characters are routed through `PracticeService.pushPracticeChar()` instead of `DisplayBufferService.pushSent()`. When `practicePipeline` is `'local'`, external outputs (serial, MIDI, RTDB, vibration) are skipped in `MorseEncoderService`. Practice and keying are exclusive: on the main screen `AppComponent.syncMainPracticeKeying()` disables mapped keyboard keying, the mouse keyer and the sprite while `encoderMode === 'practice'`; in fullscreen, practice UI exists only in Type mode and `FullscreenModalComponent.setInputMode('key')` aborts practice.
- **Fullscreen focus model**: `FullscreenModalComponent` opens with focus on `.fs-conversation`, owns Tab order (`handleTab`: body controls, then toolbar, wrapping) and focuses the always-rendered hidden `typeInput` synchronously from the Key/Type toggle so mobile keyboards open; Key mode focuses the conversation instead.
- **`audioRunning` flag**: passed as `@Input()` from `AppComponent` → `SettingsModalComponent` → tab components → card components that have test/calibration buttons (mic-card, cw-detector-card, audio-output-card, sidetone item).

## Build and Test
```bash
npm start        # ng serve — dev server at 127.0.0.1:4200
npm run build    # ng build — production build with service worker
npm run watch    # ng build --watch --configuration development
npm test         # ng test — Karma + Jasmine (no tests written yet)
```
- TypeScript strict mode enabled with Angular strict templates/injection/inputs
- Production build budget: 800kB warning / 1MB error (initial bundle)
- AudioWorklet processors (`cw-detect-processor.js`, `key-detect-processor.js`) live in `public/` as unbundled static files

## Project Conventions
- **Templates use Angular 19 control flow**: `@if`, `@for`, `@else` — not `*ngIf`/`*ngFor`
- **Subscription cleanup**: services and components collect subscriptions in a `private subs: Subscription[]` array and unsubscribe in `ngOnDestroy`
- **`NgZone`** used in services handling events originating outside Angular's zone (e.g., keyboard, Firebase callbacks)
- **Custom type declarations** for Web Serial API in `src/app/web-serial.d.ts`
- **Morse table** in `src/app/morse-table.ts` — `MORSE_TABLE`, `MORSE_REVERSE`, `timingsFromWpm(wpm)`
- **Version** tracked in both `package.json` and `src/app/version.ts` — keep them in sync
- **Version bumps**: when asked to bump the version to a specific number, update all of these:
  1. `src/app/version.ts`
  2. `package.json` (`version` field)
  3. `package-lock.json` (both the root `version` field and the `packages[""]` → `version` field)
  4. `CHANGELOG.md` — add a summary of the changes under the new version heading
  5. If new functionality was added, enrich or update the relevant help chapter(s) in `src/app/help/`
  6. If help chapters were added or removed, update the table of contents in the help component (`help.component.ts` / `help.component.html`)
  7. Review and update `README.md` (project root) and `arduino/README.md` if changes affect their general overview content
- **Help system**: standalone chapter components in `src/app/help/` with content-only HTML and minimal TS; wiring diagrams as SVGs in `src/app/help/diagrams/`. Contextual Help links emit their target element ID through `helpRequested` outputs; wrapper components forward the ID, and `AppComponent` closes the source modal before calling `openHelp(sectionId)`. `HelpComponent.initialSection` scrolls to that target. Keep the destination at the link source rather than hard-coding a section in a generic app-level handler.
- **Architecture changes**: when adding/removing/moving components, services, or shared CSS files, update this `copilot-instructions.md` — specifically the Project Structure tree, Component hierarchy, and Key interdependencies sections — so future sessions have accurate context

## Work Package Workflow
- Trigger this workflow whenever the project owner asks to implement, work on, or execute a work package identified as `WPxx` (for example, WP01). Treat the matching GitHub issue and its parent issue as the approved source for scope, constraints, dependencies, and acceptance checks.
- Before starting implementation, ask the owner whether the work should be done on a new branch (and its name). Do not create or switch branches without that answer; never commit to `main` directly unless the owner says so.
- Before editing, inspect the issue and relevant local implementation, then prepare a concise implementation plan in plain developer language. Explain the user-visible outcome, proposed changes, files or behavior likely affected, what must remain unchanged, unresolved decisions, and how the change will be verified. Ask the owner to approve the plan and resolve open product decisions. Do not edit code or post the plan comment until approval is explicit.
- After approval, add the approved plan as a comment to the matching work-package issue. Use the GitHub Pull Requests integration to retrieve and verify issue details and to comment when its write actions are available. If the integration is read-only or cannot post comments, use the authenticated GitHub CLI (`gh issue comment <number> --body ...`) without exposing credentials, then fetch the issue again to verify the comment. Never claim an issue was updated unless the posted comment has been verified.
- Implement only the approved package scope. Preserve user changes and follow the issue's safety boundaries. Keep the owner informed at meaningful checkpoints, especially before the first edit, after the first focused validation, before owner-operated hardware or permission checks, and when a blocker changes the plan. For a running app, keep the existing development server alive unless the owner approves otherwise; state its URL and any action that could request permission, send output, or affect connected hardware before asking the owner to perform it.
- For user-interface work, do NOT use the browser integration by default. Verify functionality by giving the owner a short list of high-level, step-by-step manual checks of the feature itself, and let the owner perform these. Do not hand the owner lists of viewport sizes or other exhaustive layout matrices; they are hard to test by hand. If viewport or layout testing is deemed necessary, ask the owner's permission to run it yourself with the integrated browser, using the applicable sizes from User Interface and UX Invariants. The browser integration is a last resort: use it only when the owner opts in after being asked, e.g. when the alignment or size of on-screen components must be measured accurately. When used, never silently grant permissions, start audio, key a radio, or enable an external route. Do not add or run automated browser, DOM, visual-regression, or end-to-end UI tests. Clearly separate checks performed by the agent from checks that require owner hardware, permissions, or confirmation.
- After implementation and validation, add a completion comment to the same issue. Summarize the exact files and behavior changed, user-facing result, final decisions, preserved behavior, build/tests run and their results, any browser/viewport checks the owner approved the agent to perform, and the remaining owner checks. Verify the comment through the GitHub integration or authenticated `gh` CLI before reporting it as posted. Do not begin a dependent work package until its required owner acceptance is received.
- After the completion comment is verified, ask the owner whether they want a version bump. Do not change version files, changelog, or release documentation until the owner answers yes and provides or approves the target version.
- Integration usage: use the GitHub Pull Requests integration first for issue retrieval and comment verification; fall back to authenticated `gh` only when issue-write actions are not exposed. Use the browser integration only under the last-resort rule above, preserving the running server. Report when an integration is unavailable, and never describe a CLI or screenshot check as an integration action that did not occur.
- Never offer to commit, push, or open a pull request after implementing anything; leave that to the owner.
- If something learned during the work seems important future guidance, ask the owner for permission before adding it to these instructions.

## Integration Points
- **Firebase RTDB**: config in `src/app/firebase.config.ts`, channel structure `/morse-code-studio/channels/{channelName}/{secret}`. Offline caching disabled; auto-reconnect with exponential backoff
- **Web Audio API**: AudioContext, AudioWorklet, Goertzel tone detection, sidetone/opto-coupler output
- **Web Serial API**: DTR/RTS keying for radio transmitters, DSR/CTS/DCD/RI polling for key/paddle input, WinKeyer protocol
- **Web MIDI API**: external controller input/output
- **PWA**: service worker via `ngsw-config.json`, manifest in `public/manifest.webmanifest`, `registerWhenStable:30000`

## Security
- Do NOT open public issues for vulnerabilities — use email or GitHub private vulnerability reporting (see `SECURITY.md`)
- Firebase credentials in `firebase.config.ts` are intentionally public (client-side RTDB with security rules)

## User Interface and UX Invariants
- Apply these rules to all user-visible changes, not only to a particular redesign or work package. Before a broad change to user-facing behavior, confirm the intended direction and any unresolved product choices with the project owner.
- Make the user's current task, mode, and available actions clear. Use plain labels, helpful status, and concise inline guidance; when a screen supports distinct tasks, make the selected task explicit rather than making the tasks appear interchangeable. Introduce capabilities progressively so a new user can start with a sensible path while experienced users can still reach and combine advanced options. Where setup is involved, consider optional, clearly described presets or guided paths for common user needs; explain what each choice changes and keep settings available for customization.
- Keep related actions and settings together, explain important consequences before the user acts, and make permission, connection, and output states visible. Do not rely on hidden conventions or assume that users know which mode or device is active.
- Preserve existing inputs, outputs, routing, settings, histories, and behavior unless the approved scope explicitly changes them. Never autoplay or silently enable or redirect an external keying or relay route. Permission-gated APIs and hardware actions must follow a clear user action, identify the requested device or destination, and show the resulting state.
- Reuse the established control styles instead of inventing new ones:
  - **Circular icon buttons** (close, kebab, header actions) are exactly 40 by 40 CSS pixels with `border-radius: 50%`, `padding: 0`, background `#282c34`, 1px `#556` border, `#8cf` icon, and the hover/active styles of `.settings-close-btn` / `.settings-action-btn` (settings modal) and `.kebab-btn` (main page). Close buttons use the same inline X SVG as the settings modal, never a text "×". Reuse the existing classes (`settings-close-btn`, `settings-action-btn`) where possible.
  - **Menu action buttons** (Save, Import, and similar secondary actions) use the pill look of `.kebab-help-btn`: gradient `#506078`→`#3a4858`, 20px radius, `.78rem` bold text, about 240px maximum width, centered, wrapping onto separate centered rows when space runs out.
  - **Touch rules**: any `@media (pointer: coarse)` rule that enlarges buttons (`min-height: 44px` or similar) must exclude circular icon buttons and pill buttons (use `:not(...)`), otherwise circles turn into ovals on phones. Always check circular buttons on a coarse-pointer or phone viewport.
  - **Modal sizing**: every dialog on the settings scale (settings, presets) uses the same box: `max-width: 640px`, `height: 92vh`, 12px radius. At 480px and below, Settings is full-screen (`100dvh`, no radius, no overlay padding), while Presets, the Setup Wizard goals modal and the wizard dialog stay inset (`.75rem` overlay padding, `92dvh`, 12px radius). Do not let a dialog size itself to its content.
  - **Closing dialogs**: a dialog with a header close icon does not also get a redundant footer "Close" button. Footers hold only task actions.
- Preserve the established responsive scale. The main application shell is currently capped at 940 CSS pixels; common toolbar controls are 40 by 40 CSS pixels; and the settings dialog is capped at 640 CSS pixels wide. Do not shrink existing text, controls, or touch targets to fit new content. Do not add persistent toolbar space just to fit it. Prefer reflow, vertical scrolling, and progressive disclosure, and avoid clipping, overlap, hidden controls, and unintended horizontal scrolling.
- Treat viewport sizes as CSS pixels, not device-model names or screenshot image dimensions. The current layout uses 768-pixel and 480-pixel width breakpoints, plus a short-landscape rule at 500 pixels high. When changing layout, test at 320 pixels wide; at 479, 480, and 481 pixels; at 767, 768, and 769 pixels; at 499, 500, and 501 pixels high in landscape; and at 200% browser zoom. Also check a representative phone at its owner-confirmed portrait CSS viewport, which is **360 × 800 CSS pixels** (confirmed by the owner; no need to ask again). Do not infer a different reference viewport from a device model or screenshot.
- Use semantic controls with accessible names, visible keyboard focus, and usable keyboard operation. Keep instructions and status understandable without relying on color alone, and ensure added motion or animation does not obstruct use.
- For UI changes, run `npm run build` and relevant existing tests, then provide the owner a short list of high-level manual checks of the affected flows (no viewport-size matrices). If layout verification across viewport sizes, keyboard, or touch is deemed necessary, ask the owner's permission to run it yourself with the integrated browser. A successful build or unit test does not establish that a UI change is usable. Do not add or run automated browser, DOM, visual-regression, or end-to-end UI tests; use the existing test setup for applicable non-UI logic tests.
- Write issues and implementation plans in plain language for developers. State the user problem, intended outcome, what must remain unchanged, dependencies, and how the result will be checked. Keep proposed work focused and independently reviewable, and do not imply that the work is intended for a particular kind of implementer.

## Forbidden Operations
- **NEVER run `firebase deploy` or any Firebase CLI deployment commands** (`firebase deploy`, `firebase hosting:channel:deploy`, `firebase functions:deploy`, etc.). Deployment is handled outside this repository; only the project owner deploys to production.
- **Teach wizard (WP09)**: goal `teach` (graduation-cap icon) is a classroom wizard with no radio paths (no WinKeyer, radio keying, audio decoding or pilot tone). Path from `wizardSteps`: `teachScenarios`, `teachParticipants` (max 4 local students plus teacher), `teachInputs`, `teachCopy`, `teachMobile`, `teachOutputs`, `teachTiming`, `teachDisplay`, `teachExtras`, `review`, `preset`, `apply`, `done`. Device actions (MIDI Detect key, serial `requestPort`) happen only on explicit buttons; RTDB is joined only in `done`. Apply calls `settings.update()` without saving the device profile; the preset step saves a secret-free snapshot. Group scoring is a separate package.
