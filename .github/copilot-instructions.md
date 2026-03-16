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
│   ├── wake-lock.service.ts    — Screen Wake Lock API
│   └── vibration-output.service.ts — Vibration API output
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
│   ├── SettingsOtherTabComponent → 4 *-card components
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
- **Fullscreen modal CSS** (`fullscreen-shared.css`) is similarly shared. Child components (`fs-toolbar`, `fs-decoder-view`, `fs-encoder-view`) import it via `styleUrls` (only 3 consumers, so duplication is acceptable here — unlike the 18 settings cards).
- **Morse table** (`morse-table.ts`): `MORSE_TABLE` maps characters/prosigns to dot-dash strings; `MORSE_REVERSE` is the inverse. Changes to the table can affect encoding, decoding, and the symbols reference panel.
- **`DisplayBufferService`** bridges decoded/encoded text with prosign actions and emoji replacements — changes to prosign or emoji logic converge here.
- **Audio chain**: `AudioDeviceService` → `AudioInputService` → `CwInputService` (detection) → `MorseDecoderService` (decode). Output: `MorseEncoderService` → `AudioOutputService` + optional `SerialKeyOutputService` / `WinkeyerOutputService` / `MidiOutputService` / `FirebaseRtdbService`.
- **Serial input/output muting**: `SerialKeyOutputService.isSending` signal (with 30 ms holdoff per mapping) prevents `SerialKeyInputService` from processing key-down events while output is active — same pattern as `MidiOutputService.isSending` / `MidiInputService`. `SerialKeyInputService` has its own independent iambic keyer per mapping (like `MidiInputService`), bypassing `KeyerService` entirely.
- **Serial port sharing**: when serial input and output mappings use the same port index, `SerialKeyInputService` piggybacks on `SerialKeyOutputService.getOpenPort(portIndex)` instead of opening a second connection. The output service exposes an `openPorts` signal (Map<number, PortState>) and a `getOpenPort(portIndex)` method for this purpose.
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

## Integration Points
- **Firebase RTDB**: config in `src/app/firebase.config.ts`, channel structure `/morse-code-studio/channels/{channelName}/{secret}`. Offline caching disabled; auto-reconnect with exponential backoff
- **Web Audio API**: AudioContext, AudioWorklet, Goertzel tone detection, sidetone/opto-coupler output
- **Web Serial API**: DTR/RTS keying for radio transmitters, DSR/CTS/DCD/RI polling for key/paddle input, WinKeyer protocol
- **Web MIDI API**: external controller input/output
- **PWA**: service worker via `ngsw-config.json`, manifest in `public/manifest.webmanifest`, `registerWhenStable:30000`

## Security
- Do NOT open public issues for vulnerabilities — use email or GitHub private vulnerability reporting (see `SECURITY.md`)
- Firebase credentials in `firebase.config.ts` are intentionally public (client-side RTDB with security rules)

## Forbidden Operations
- **NEVER run `firebase deploy` or any Firebase CLI deployment commands** (`firebase deploy`, `firebase hosting:channel:deploy`, `firebase functions:deploy`, etc.). Deployment is handled outside of Copilot's scope. Only the project owner deploys to production.
