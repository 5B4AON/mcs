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
    ├── settings-modal/      — settings dialog (3 tab children, each with card children)
    │   ├── settings-modal.component.*   — tab container + reset/export/import buttons
    │   ├── settings-shared.css          — shared card styles (loaded globally via angular.json)
    │   ├── settings-inputs-tab/         — thin shell hosting 8 input card components
    │   │   ├── mic-card/
    │   │   ├── cw-detector-card/
    │   │   ├── keyboard-keyer-card/
    │   │   ├── mouse-keyer-card/
    │   │   ├── touch-keyer-card/
    │   │   ├── midi-input-card/
    │   │   ├── serial-input-card/
    │   │   └── rtdb-input-card/
    │   ├── settings-outputs-tab/        — thin shell hosting 7 output card components
    │   │   ├── audio-output-card/
    │   │   ├── serial-output-card/
    │   │   ├── winkeyer-card/
    │   │   ├── rtdb-output-card/
    │   │   ├── midi-output-card/
    │   │   ├── sidetone-card/
    │   │   └── vibration-card/
    │   └── settings-other-tab/          — thin shell hosting 6 card components
    │       ├── wake-lock-card/
    │       ├── text-blur-card/
    │       ├── farnsworth-card/
    │       ├── show-prosigns-card/
    │       ├── prosign-actions-card/
    │       └── emojis-card/
    ├── fullscreen-modal/    — fullscreen encode/decode views
    │   ├── fullscreen-modal.component.* — container
    │   ├── fullscreen-shared.css        — shared fullscreen styles
    │   ├── fullscreen-format.utils.ts   — shared formatting utilities
    │   ├── fs-toolbar/      — fullscreen mode toolbar
    │   ├── fs-decoder-view/ — fullscreen decoder display
    │   └── fs-encoder-view/ — fullscreen encoder display
    ├── help/                — help system (chapter components + diagrams)
    │   ├── help.component.*             — shell with table of contents
    │   ├── help-ch-*.component.*        — individual chapter components (HTML-only content)
    │   └── diagrams/                    — SVG wiring diagrams
    ├── confirm-dialog/      — reusable confirmation dialog
    ├── emoji-picker/        — emoji selection popup
    ├── emoji-edit-modal/    — emoji mapping editor modal
    ├── keyboard-input-edit-modal/ — keyboard key mapping editor modal
    ├── midi-input-edit-modal/     — MIDI input mapping editor modal
    ├── midi-output-edit-modal/    — MIDI output mapping editor modal
    ├── serial-input-edit-modal/   — serial input mapping editor modal
    ├── serial-output-edit-modal/  — serial output mapping editor modal
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
├── FullscreenModalComponent
│   ├── FsToolbarComponent
│   ├── FsDecoderViewComponent
│   └── FsEncoderViewComponent
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
- **Prosign actions pipeline**: prosign keys are defined in `prosign-actions-card.component.ts` (`prosignKeys` array), their defaults in `DEFAULT_SETTINGS.prosignActions` (settings.service.ts), and they are consumed at runtime by `DisplayBufferService.handleProsignAction()`. All three must stay in sync.
- **Emoji mappings pipeline**: emoji defaults in `DEFAULT_SETTINGS.emojiMappings`, UI in `emojis-card` + `EmojiEditModalComponent`, runtime processing in `DisplayBufferService`.
- **Farnsworth / Wordsworth timing pipeline**: settings (`farnsworthEnabled`, etc.) in `AppSettings` + `DEFAULT_SETTINGS`, UI in `farnsworth-card`, timing math in `adjustGapTimings()` (morse-table.ts). Applied at runtime in `MorseEncoderService.sendCharacter()`, `startWordGapTimer()`, `playRxChar()` and `MidiOutputService.playCharElements()`. WinKeyer is excluded (hardware-timed).
- **Keyboard input mappings pipeline**: `KeyboardInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.keyboardInputMappings`, UI in `keyboard-keyer-card` + `KeyboardInputEditModalComponent`, runtime in `KeyerService` (per-mapping straight key state + independent paddle keyer per mapping).
- **MIDI input mappings pipeline**: `MidiInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.midiInputMappings`, UI in `midi-input-card` + `MidiInputEditModalComponent`, runtime in `MidiInputService` (per-mapping independent iambic keyer).
- **MIDI output mappings pipeline**: `MidiOutputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.midiOutputMappings`, UI in `midi-output-card` + `MidiOutputEditModalComponent`, runtime in `MidiOutputService`.
- **Serial input mappings pipeline**: `SerialInputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.serialInputMappings`, UI in `serial-input-card` + `SerialInputEditModalComponent`, runtime in `SerialKeyInputService` (per-mapping independent iambic keyer, similar to MIDI input). Each mapping has optional `name`/`color` for multi-user fullscreen conversation views.
- **Serial output mappings pipeline**: `SerialOutputMapping[]` in `AppSettings`, defaults in `DEFAULT_SETTINGS.serialOutputMappings`, UI in `serial-output-card` + `SerialOutputEditModalComponent`, runtime in `SerialKeyOutputService`. Each mapping specifies `portIndex`, `pin` (DTR/RTS), `invert`, and `forward` (OutputForward). Multiple mappings can target different ports or different pins on the same port.
- **Settings card CSS** (`settings-shared.css`, `settings-outputs-tab.component.css`, `settings-other-tab.component.css`) is loaded **globally** via `angular.json` `styles` array — not via component `styleUrls`. Card components use `styles: [':host { display: contents; }']` only. Do NOT add these CSS files back into component `styleUrls` or the bundle will bloat.
- **Fullscreen modal CSS** (`fullscreen-shared.css`) is similarly shared. Child components (`fs-toolbar`, `fs-decoder-view`, `fs-encoder-view`) import it via `styleUrls` (only 3 consumers, so duplication is acceptable here — unlike the 19 settings cards).
- **Morse table** (`morse-table.ts`): `MORSE_TABLE` maps characters/prosigns to dot-dash strings; `MORSE_REVERSE` is the inverse. Changes to the table can affect encoding, decoding, and the symbols reference panel.
- **`DisplayBufferService`** bridges decoded/encoded text with prosign actions and emoji replacements — changes to prosign or emoji logic converge here.
- **Audio chain**: `AudioDeviceService` → `AudioInputService` → `CwInputService` (detection) → `MorseDecoderService` (decode). Output: `MorseEncoderService` → `AudioOutputService` + optional `SerialKeyOutputService` / `WinkeyerOutputService` / `MidiOutputService` / `FirebaseRtdbService`.
- **Serial input/output muting**: `SerialKeyOutputService.isSending` signal (with 30 ms holdoff per mapping) prevents `SerialKeyInputService` from processing key-down events while output is active — same pattern as `MidiOutputService.isSending` / `MidiInputService`. `SerialKeyInputService` has its own independent iambic keyer per mapping (like `MidiInputService`), bypassing `KeyerService` entirely.
- **Serial port sharing**: when serial input and output mappings use the same port index, `SerialKeyInputService` piggybacks on `SerialKeyOutputService.getOpenPort(portIndex)` instead of opening a second connection. The output service exposes an `openPorts` signal (Map<number, PortState>) and a `getOpenPort(portIndex)` method for this purpose.
- **Copy practice pipeline**: settings (`practiceEnabled`, `practiceContentMode`, `practiceFeedbackMode`, `practicePipeline`, etc.) in `AppSettings` + `DEFAULT_SETTINGS`, UI in `practice-card`, sequence generation + scoring in `PracticeService`, playback via `MorseEncoderService.submitText()`. Practice characters are routed through `PracticeService.pushPracticeChar()` instead of `DisplayBufferService.pushSent()`. When `practicePipeline` is `'local'`, external outputs (serial, MIDI, RTDB, vibration) are skipped in `MorseEncoderService`.
- **`audioRunning` flag**: passed as `@Input()` from `AppComponent` → `SettingsModalComponent` → tab components → card components that have test/calibration buttons (mic-card, cw-detector-card, audio-output-card, sidetone-card).

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
- **Help system**: standalone chapter components in `src/app/help/` with content-only HTML and minimal TS; wiring diagrams as SVGs in `src/app/help/diagrams/`
- **Architecture changes**: when adding/removing/moving components, services, or shared CSS files, update this `copilot-instructions.md` — specifically the Project Structure tree, Component hierarchy, and Key interdependencies sections — so future sessions have accurate context

## Work Package Workflow
- Trigger this workflow whenever the project owner asks to implement, work on, or execute a work package identified as `WPxx` (for example, WP01). Treat the matching GitHub issue and its parent issue as the approved source for scope, constraints, dependencies, and acceptance checks.
- Before editing, inspect the issue and relevant local implementation, then prepare a concise implementation plan in plain developer language. Explain the user-visible outcome, proposed changes, files or behavior likely affected, what must remain unchanged, unresolved decisions, and how the change will be verified. Ask the owner to approve the plan and resolve open product decisions. Do not edit code or post the plan comment until approval is explicit.
- After approval, add the approved plan as a comment to the matching work-package issue. Use the GitHub Pull Requests integration to retrieve and verify issue details and to comment when its write actions are available. If the integration is read-only or cannot post comments, use the authenticated GitHub CLI (`gh issue comment <number> --body ...`) without exposing credentials, then fetch the issue again to verify the comment. Never claim an issue was updated unless the posted comment has been verified.
- Implement only the approved package scope. Preserve user changes and follow the issue's safety boundaries. Keep the owner informed at meaningful checkpoints, especially before the first edit, after the first focused validation, before owner-operated hardware or permission checks, and when a blocker changes the plan. For a running app, keep the existing development server alive unless the owner approves otherwise; state its URL and any action that could request permission, send output, or affect connected hardware before asking the owner to perform it.
- For user-interface work, use the available browser integration to inspect the running app and manually exercise safe flows. Capture or inspect the applicable viewport sizes from User Interface and UX Invariants, including the owner-confirmed phone viewport. Do not use the browser integration to silently grant permissions, start audio, key a radio, or enable an external route. Do not add or run automated browser, DOM, visual-regression, or end-to-end UI tests. If the browser integration is unavailable, report that limitation and provide the owner with exact manual checks instead. Clearly separate checks performed by the agent from checks that require owner hardware, permissions, or confirmation.
- After implementation and validation, add a completion comment to the same issue. Summarize the exact files and behavior changed, user-facing result, final decisions, preserved behavior, build/tests run and their results, browser/viewport checks performed, and any remaining owner checks. Verify the comment through the GitHub integration or authenticated `gh` CLI before reporting it as posted. Do not begin a dependent work package until its required owner acceptance is received.
- After the completion comment is verified, ask the owner whether they want a version bump. Do not change version files, changelog, or release documentation until the owner answers yes and provides or approves the target version.
- Integration usage: use the GitHub Pull Requests integration first for issue retrieval and comment verification; fall back to authenticated `gh` only when issue-write actions are not exposed. Use the browser integration for live-app manual inspection and viewport review while preserving the running server. Report when either integration is unavailable, and never describe a CLI or screenshot check as an integration action that did not occur.

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
- Preserve the established responsive scale. The main application shell is currently capped at 940 CSS pixels; common toolbar controls are 40 by 40 CSS pixels; and the settings dialog is capped at 640 CSS pixels wide. Do not shrink existing text, controls, or touch targets to fit new content. Do not add persistent toolbar space just to fit it. Prefer reflow, vertical scrolling, and progressive disclosure, and avoid clipping, overlap, hidden controls, and unintended horizontal scrolling.
- Treat viewport sizes as CSS pixels, not device-model names or screenshot image dimensions. The current layout uses 768-pixel and 480-pixel width breakpoints, plus a short-landscape rule at 500 pixels high. When changing layout, test at 320 pixels wide; at 479, 480, and 481 pixels; at 767, 768, and 769 pixels; at 499, 500, and 501 pixels high in landscape; and at 200% browser zoom. Also check a representative phone at its owner-confirmed portrait CSS viewport. If that reference viewport is not known, ask the owner to confirm it rather than inferring it from a device model or screenshot.
- Use semantic controls with accessible names, visible keyboard focus, and usable keyboard operation. Keep instructions and status understandable without relying on color alone, and ensure added motion or animation does not obstruct use.
- For UI changes, run `npm run build` and relevant existing tests, then manually check the affected flows at the applicable viewport sizes and with keyboard and touch input. A successful build or unit test does not establish that a UI change is usable. Do not add or run automated browser, DOM, visual-regression, or end-to-end UI tests; use the existing test setup for applicable non-UI logic tests.
- Write issues and implementation plans in plain language for developers. State the user problem, intended outcome, what must remain unchanged, dependencies, and how the result will be checked. Keep proposed work focused and independently reviewable, and do not imply that the work is intended for a particular kind of implementer.

## Forbidden Operations
- **NEVER run `firebase deploy` or any Firebase CLI deployment commands** (`firebase deploy`, `firebase hosting:channel:deploy`, `firebase functions:deploy`, etc.). Deployment is handled outside this repository; only the project owner deploys to production.
