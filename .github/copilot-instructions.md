# Morse Code Studio — Project Guidelines

## Overview
Browser-based Morse code encoder/decoder/keyer built with **Angular 19** (standalone components, no NgModules). Runs entirely client-side — no backend server. Uses Web Audio API, Web Serial API, Web MIDI API, and Firebase RTDB for real-time relay.

## Code Style
- **2-space indentation**, single quotes, UTF-8 — see [.editorconfig](.editorconfig)
- No ESLint or Prettier configured; follow existing patterns
- Every `.ts` file starts with the copyright header:
  ```ts
  /**
   * Morse Code Studio
   * Copyright (c) 2026 5B4AON — Mike
   * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
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
- Large monolithic components are intentional — prefer cohesion over splitting

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

## Integration Points
- **Firebase RTDB**: config in `src/app/firebase.config.ts`, channel structure `/morse-code-studio/channels/{channelName}/{secret}`. Offline caching disabled; auto-reconnect with exponential backoff
- **Web Audio API**: AudioContext, AudioWorklet, Goertzel tone detection, sidetone/opto-coupler output
- **Web Serial API**: DTR/RTS keying for radio transmitters, WinKeyer protocol
- **Web MIDI API**: external controller input/output
- **PWA**: service worker via `ngsw-config.json`, manifest in `public/manifest.webmanifest`, `registerWhenStable:30000`

## Security
- Do NOT open public issues for vulnerabilities — use email or GitHub private vulnerability reporting (see `SECURITY.md`)
- Firebase credentials in `firebase.config.ts` are intentionally public (client-side RTDB with security rules)
