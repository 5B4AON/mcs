# Morse Code Studio — UX, Security & Code Quality Review

## Overall assessment

Morse Code Studio has unusually broad and useful capabilities: text encoding, live decoding, practice, physical keyers, radio keying, relay, and independently configurable inputs and outputs. Its service-based architecture and extensive built-in documentation are strong foundations.

The main product risk is that the interface presents this capability in the same terms the implementation uses—inputs, outputs, RX/TX, WPM pools, and device settings—before helping a person decide what they want to accomplish. New users can encounter a configuration task before they have experienced a clear first success. The opportunity is not to remove flexibility, but to put an inviting, intent-first path in front of it and let advanced users reach the full routing model when they need it.

This is a static, code-grounded review, not a usability study or a penetration test. Priorities below describe product risk, not implementation estimates. The prioritized work packages and proposed release sequence are in [the UX revamp roadmap](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md).

## What is already working

- The app supports local practice as well as a wide range of audio, keyboard, touch, MIDI, serial, WinKeyer, and relay setups. Keeping those capabilities available is a core product strength.
- Settings are already stored in per-audio-device profiles, providing a useful foundation for scenario profiles.
- Help chapters include detailed setup instructions, device trade-offs, and practical examples.
- Practice already supports characters, words, callsigns, multiple feedback styles, and local-only output. This is a strong base for a learner-focused path.
- Settings cards already contain contextual hints for specialist controls; these can be adapted into progressive, task-oriented guidance.

## Prioritized findings

### P1 — Lead with user intent, not the system’s internal categories

**Observation:** The main screen opens directly into a combined text panel and encoder field, while configuration is divided into “Inputs,” “Outputs,” and “Other.” Several user goals do not fit those categories cleanly: the encoder is listed under Inputs, and Copy Practice is under Other. The interface does not first ask whether the person wants to learn, decode, send, or connect a station.

**Evidence:** `src/app/app.component.html:110-215`; `src/app/components/settings-modal/settings-modal.component.html:32-63`; `src/app/components/settings-modal/settings-inputs-tab/settings-inputs-tab.component.html:1-13`; `src/app/components/settings-modal/settings-other-tab/settings-other-tab.component.html:1-10`.

**Recommendation:** Add a first-run “What would you like to do?” entry point with a few plain-language choices, such as **Try Morse**, **Practice receiving**, **Decode live CW**, **Send Morse**, and **Connect a key or radio**. Each choice should set up only the relevant minimum and offer a clear route to advanced settings. Keep the existing settings available; reorganize their discovery around tasks rather than making users infer a task from the input/output taxonomy.

### P1 — Make starting audio an unmistakable, guided action

**Observation:** Starting audio is a prerequisite for hearing output and using audio input, but the header control is a small icon-only button. Its “Start Audio” explanation is available only as a `title` tooltip. A first-time user may not know that this control exists, what it enables, or whether microphone permission is needed for their chosen task. If startup rejects, the `finally` block clears the spinner but does not provide an in-app explanation or recovery step.

**Evidence:** `src/app/app.component.html:1-18`; `src/app/app.component.ts:665-690`; `README.md:75-81`.

**Recommendation:** Give the control a visible **Start audio** label in the initial/idle state, and explain its effect at the point of use. Show clear states for starting, active, and failed—with actionable recovery for permission denial, missing devices, and unavailable audio. Explain separately when a selected workflow actually needs microphone access; do not make users grant it just to explore typed encoding or local practice.

### P1 — Offer audience-based setup recipes and a short configuration wizard

**Observation:** Defaults are technical, global starting values rather than named journeys. For example, copy practice is disabled by default, and the existing profile key is based on connected audio-device fingerprints—not the user’s goal or experience level.

**Evidence:** `src/app/services/settings.service.ts:610-670`; `src/app/services/settings.service.ts:733-776`; `src/app/services/settings.service.ts:824-825`; `src/app/services/settings.service.ts:1018-1044`.

**Recommendation:** Offer editable, previewable scenario recipes for at least:

| Starting point | Default focus | Important guard rail |
|---|---|---|
| **First visit / Try Morse** | A sample phrase, local sidetone, an immediate encode-and-hear loop, and a visible route to practice. | No hardware setup or microphone permission required for the basic demonstration. |
| **Student / self-study** | Copy Practice, a simple starting character set, type-along or listen-and-reveal feedback, and a gentle speed/gap choice. | Keep controls such as pipeline routing and fine-grained pool tuning optional. |
| **Educator / group demonstration** | A large, readable conversation display, easy-to-understand RX/TX distinction, and optional named/coloured participants. | Make classroom display and input setup discoverable without requiring a radio configuration. |
| **New radio amateur** | Receive/decode first, then a guided local keyer or sidetone test, followed by an optional hardware setup. | Never silently enable a transmitter keying output; require explicit review of the selected hardware route. |
| **Experienced operator** | Direct access to independent RX/TX calibration, keyers, MIDI/serial/WinKeyer, relay, and routing controls. | Preserve custom routing and provide a clear path back to the complete settings model. |

Make setup a navigable wizard rather than a one-way questionnaire. A useful flow is: choose the goal and audience; see relevant input/output options based on browser support and connected devices; configure the selected options; run applicable checks; then review the complete proposed setup before applying it. Every stage should have clear **Back** and **Next** actions, with optional steps skippable and earlier choices retained when users revisit them. Keep changes in a draft until the user confirms the final summary, and offer a route to full settings at any point.

Keep three concepts clear and distinct: built-in scenario recipes are editable starting points; named user presets are configurations the user explicitly saves and can recall, rename, duplicate, or delete; existing device profiles continue to auto-load settings for a particular audio-device fingerprint. Let users save a named preset from the current setup or the wizard’s final review, and preview what recalling it will change before applying it. Apply it to the current hardware without silently discarding unrelated custom settings; identify unavailable devices and let the user remap them. Since saved settings can include RTDB channel secrets, explain where presets are stored and whether a saved preset includes those credentials.

### P1 — Improve accessibility and reduce reliance on hidden controls

**Observation:** Several important controls are icon-only and depend on `title` text. The settings overlay has no dialog semantics in its outer wrapper; its tab buttons are not exposed as a tablist, and card expansion is attached to clickable `div` elements. The touch keyer uses clickable `div` elements rather than native buttons. These patterns make discovery, keyboard operation, and assistive-technology use less dependable.

**Evidence:** `src/app/app.component.html:9-27`; `src/app/components/settings-modal/settings-modal.component.html:1-2,32-46`; `src/app/components/settings-modal/settings-inputs-tab/cw-detector-card/cw-detector-card.component.html:3-15`; `src/app/components/fullscreen-modal/fs-decoder-view/fs-decoder-view.component.html:105-144`.

**Recommendation:** Use visible labels for primary actions and programmatic accessible names for icon-only controls. Give dialogs and tab navigation appropriate semantics and keyboard behavior; manage focus on open/close; make expandable card headers keyboard-operable; and make touch keyer controls accessible as buttons with clear dit/dah or straight-key names. Verify contrast, target sizes, zoom, and screen-reader announcements across mobile and desktop.

### P2 — Give encoder and decoder distinct, persistent identities without splitting their capabilities

**Observation:** The main display intentionally combines RX and TX text, and the fullscreen UI conditionally presents either a decoder or encoder view. That is powerful for conversation use, but the mode choice is reached through a fullscreen menu rather than a persistent, understandable workspace choice. The combined display marks RX/TX lines by style without an adjacent plain-language legend. A user can reasonably assume that changing views changes what the app can receive or send.

**Evidence:** `src/app/app.component.html:163-171,270-279`; `src/app/components/fullscreen-modal/fullscreen-modal.component.html:12-24`; `src/app/components/help/help-ch-config.component.html:85-109`.

**Recommendation:** Provide persistent **Practice**, **Listen/Decode**, **Compose/Send**, and **Operate** workspace choices with a concise explanation of what each emphasizes. Keep a clearly named **Combined conversation** view for users who want both directions together. These should be views over the same independent RX/TX streams and existing buffers—not mutually exclusive feature modes. Make the current workspace visible and make switching views preserve ongoing activity and history.

### P2 — Replace “look it up in Help” with just-in-time guidance and status

**Observation:** Help is comprehensive, but it is reached from the header’s overflow menu and contains eleven chapters. The current quick-start guide still directs people to start audio, inspect settings, choose inputs and outputs, and save settings before describing success. Hidden WPM controls and technical labels add to the initial learning burden.

**Evidence:** `src/app/app.component.html:22-65`; `src/app/components/help/help.component.html:19-127`; `src/app/components/help/help-ch-intro.component.html:67-99`.

**Recommendation:** Keep the detailed manual as the reference layer, but surface brief “what this does / when to use it” hints beside unfamiliar controls. Add a visible setup checklist with current readiness, meaningful device/permission errors, and a contextual next action (for example, “Audio is off—start audio to hear this test”). Explain RX, TX, keyer, and encoder speed at first use rather than relying on abbreviations or tooltips. In practice mode, explain why the text field changes or becomes unavailable for some feedback styles and make the active exercise/feedback mode obvious. Keep specialist hardware wiring guidance available, but let beginners defer the lengthy technical details until they choose that setup.

## Security and privacy review

### S1 — Treat relay channel secrets as exposed client-side capabilities

**Observation:** Firebase configuration is correctly presented as client configuration, not a server-held secret. However, the example Realtime Database rules grant `.read: true` and `.write: true` at the channel/secret path, and the code uses the secret as a path segment. The documentation also notes that limits and expiry are external configuration. A deployment that copies these rules permits anonymous reads and writes for anyone who can access the relevant path; the path secret is not equivalent to authenticated authorization.

**Evidence:** `src/app/firebase.config.ts:11-17,19-41,65-76`; `src/app/services/firebase-rtdb.service.ts:27-30,59-65,304-319,564-585`.

**Recommendation:** Clearly label relay as a shared-channel feature with a public-client threat model. Explain that channel secrets are capability tokens, advise unique high-entropy values and non-sensitive traffic, and make restrictive database rules, validation, quotas/rate limits, and expiry part of the setup guidance. If the intended use requires private or authenticated messaging, the current unauthenticated relay model needs a separate design rather than stronger wording around a path secret. This review does not establish the rules of any deployed Firebase project.

### S2 — Disclose that saved channel credentials are stored in browser storage

**Observation:** Settings profiles are serialized to `localStorage`, including the RTDB channel secret fields. The settings inputs use `type="password"`, which masks the value on screen but does not protect the saved value from other same-origin script or someone with access to the browser profile.

**Evidence:** `src/app/services/settings.service.ts:824-825,1022-1044`; `src/app/components/settings-modal/settings-inputs-tab/rtdb-input-card/rtdb-input-card.component.html:44-49`; `src/app/components/settings-modal/settings-outputs-tab/rtdb-output-card/rtdb-output-card.component.html:46-50`.

**Recommendation:** Tell users where relay settings are saved and advise against reusing sensitive credentials, especially on shared devices. Consider an explicit “remember this secret” choice and a way to clear relay credentials independently of all settings. Do not imply that password masking encrypts locally stored settings.

## Code quality and validation notes

- The separation into focused services, standalone components, and settings cards is a sound basis for incremental UX work. The main component nevertheless imports and orchestrates many services and owns much of the main-screen behavior; adding guided flows there without further boundaries could make future changes harder to reason about. Keep new onboarding/workspace state localized and testable.
- Audio startup errors are caught in the auto-start path, but the user-initiated `toggleAudio()` path only has a `finally` block. Provide visible error state and recovery for both paths, and keep their behavior consistent.
- The repository has an `npm test` script, but no `*.spec.ts` files were present in this checkout. Add focused automated coverage for first-run setup, audio permission failure, preset preview/apply/cancel, view switching with ongoing RX/TX, and the rule that a setup preset cannot silently enable external radio keying.
- No exploitable issue was confirmed from this static review. The Firebase rule example and client-side secret persistence above are concrete risks to address or clearly communicate; any deployment-specific exposure depends on the actual database rules and hosting configuration.

## Suggested implementation sequence

Follow the package boundaries and release order in [the UX revamp roadmap](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md); keep each package separately approved and manually accepted:

1. **R1 — A reliable first Morse session:** packages 01–03 cover audio activation/recovery, an explicit first-success path, and accurate live-versus-saved settings status.
2. **R2 — Inclusive, trustworthy controls:** packages 04–05 clarify relay privacy/local credential storage and make core controls/modals accessible.
3. **R3 — Practice and findability:** packages 06–07 improve practice clarity and add goal-based routes into existing settings.
4. **R4 — Guided setup foundation:** package 08 adds safe core wizard paths.
5. **R5 — Audience and station setup paths:** packages 09–10 add educator and hardware/relay scenarios with explicit safety review.
6. **R6 — Recallable named configurations:** package 11 adds named presets after the shared output-safety classifier.
7. **R7 — Seamless saved-setup journeys:** package 12 integrates accepted presets with the wizard.
8. **R8 — Clear operating workspaces:** package 13 proposes clearer view choices while preserving the combined conversation and ongoing RX/TX streams.

## Product-level success criteria

- A first-time visitor can reach a satisfying local Morse encode-and-hear or practice experience without deciphering the settings taxonomy.
- Users can move backward and forward through a scenario setup without losing choices, review changes before applying them, and later recall a clearly named saved configuration.
- Starting audio, microphone permission, and device failures are visibly explained with a next action; users can tell which capabilities are active.
- A learner, educator, new operator, and experienced amateur can choose a relevant starting point, understand what it changes, and edit or leave it.
- Decoder, encoder, and combined conversation views have distinct, persistent labels while retaining shared RX/TX activity, independent buffers, and full routing flexibility.
- No preset enables an external transmitter/keying output without explicit user review and confirmation.
- Core journeys work with keyboard, touch, and assistive technologies, and the relay’s client-side storage and access model are accurately communicated.
